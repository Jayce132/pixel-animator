import { nanoid } from 'nanoid';
import * as Y from 'yjs';
import { IndexeddbPersistence } from 'y-indexeddb';
import { WebrtcProvider } from 'y-webrtc';
import { useCollabStore } from '../stores/collabStore';
import type { CollabPeer, CollabRole } from '../stores/collabStore';
import type { IncomingWholesaleProposal } from '../stores/collabStore';
import { useEditorUiStore } from '../stores/editorStore';
import type { EditorUiState } from '../stores/editor/types';
import { TOTAL_PIXELS } from '../types';
import type { Tool } from '../types';
import { clonePixelData, wholesaleInstallRevealState } from '../utils/pixelData';
import { createCollabBridge } from './bridge';
import type { CollabBridge } from './bridge';
import {
    collabDocToProject,
    getCollabDocHandles,
    seedDocFromStore,
    validateDoc
} from './doc';
import {
    createCollabUndoController
} from './undo';
import type { CollabUndoController } from './undoRuntime';
import { setActiveCollabUndoController } from './undoRuntime';
import { withCollabWholesaleAction } from './actionContext';
import { LOCAL_WHOLESALE_ORIGIN } from './origins';
import { resolveAdmissionClaims } from './admission';
import type { AdmissionClaim } from './admission';
import { resolveCrossingProposals } from './proposals';
import {
    buildCollabLink,
    ROOM_ID_LENGTH,
    ROOM_KEY_LENGTH
} from './links';
import type { CollabRoomLink } from './links';
import type { CollabCursor } from './presenceRuntime';

const ADMISSION_SETTLE_MS = 1_200;
const WAITING_NOTICE_MS = 15_000;
const COPY_OFFER_TTL_MS = 30 * 60 * 1_000;
// y-protocols' Awareness prunes a silently-vanished peer's state after a
// fixed, non-configurable 30s of no updates (outdatedTimeout, internal to
// the library). Our own admission/peers refresh is otherwise purely event-
// driven (awareness 'change', provider 'peers', doc 'afterTransaction') —
// nothing forces a re-check if none of those happen to fire again after a
// peer goes dark. This heartbeat re-evaluates admission on a fixed cadence
// regardless, so "Guest is connected" can't go stale indefinitely on our
// side once the underlying awareness state has actually expired.
const PRESENCE_HEARTBEAT_MS = 5_000;
// A pending joiner that sees no established Host/Guest claims must NOT
// self-elect immediately — the real Host's awareness state is usually still
// in flight (WebRTC signaling + ICE take longer than the admission settle
// timer), and a premature host claim collides with the real one at equal
// epoch, demoting the true Host on a coin-flip instanceId tiebreak. Election
// is only for genuinely empty rooms, after this window of continued silence.
const ELECTION_WINDOW_MS = 10_000;
const VALID_TOOLS: readonly Tool[] = ['brush', 'eraser', 'fill', 'select'];

type RoleClaim = AdmissionClaim;

interface AwarenessState {
    roleClaim?: RoleClaim;
    /** Peer's current paint color and tool — drives presence indicators, and seeds a joining guest's own color/recents. */
    color?: string;
    tool?: Tool;
    brushSize?: 1 | 2;
    recentColors?: string[];
    /**
     * Live selection outline + dragged-but-not-stamped pixels, for the
     * "watch the guest's selection move" presence overlay. Read-only on the
     * receiving end — never merged into the local selectedPixels/
     * floatingLayer, which drive real stamp/flip/rotate actions.
     */
    selectedPixels?: number[];
    floatingLayer?: [number, string | null][];
    frameId?: string | null;
    cursor?: CollabCursor | null;
    proposal?: WholesaleProposal | null;
    proposalResponse?: WholesaleProposalResponse | null;
}

interface WholesaleProposal {
    id: string;
    kind: 'palette-convert' | 'load-project';
    payload: IncomingWholesaleProposal['payload'];
    ts: number;
}

interface WholesaleProposalResponse {
    id: string;
    approved: boolean;
    busy?: boolean;
}

interface OutgoingProposal {
    proposal: WholesaleProposal;
    resolve: (result: WholesaleProposalResult) => void;
    timer: number;
}

export interface WholesaleProposalResult {
    id: string;
    approved: boolean;
}

interface LiveRuntime {
    generation: number;
    room: CollabRoomLink;
    instanceId: string;
    roleClaim: RoleClaim;
    doc: Y.Doc;
    persistence: IndexeddbPersistence;
    provider: WebrtcProvider;
    bridge: CollabBridge | null;
    undo: CollabUndoController | null;
    unsubscribeEditor: (() => void) | null;
    admissionTimer: number | null;
    waitingTimer: number | null;
    electionTimer: number | null;
    presenceHeartbeatTimer: number | null;
    activated: boolean;
    creator: boolean;
    readyPromise: Promise<void>;
    resolveReady: () => void;
    rejectReady: (error: Error) => void;
    readySettled: boolean;
    outgoingProposal: OutgoingProposal | null;
    incomingProposalId: string | null;
    respondedProposalId: string | null;
    hadPeer: boolean;
}

let generation = 0;
let runtime: LiveRuntime | null = null;

interface CopyOfferRuntime {
    room: CollabRoomLink;
    doc: Y.Doc;
    provider: WebrtcProvider;
    expiryTimer: number;
    beforeUnload: () => void;
}

interface CopyReceiptRuntime {
    room: CollabRoomLink;
    doc: Y.Doc;
    provider: WebrtcProvider;
    reject: (error: Error) => void;
    settled: boolean;
}

let copyOffer: CopyOfferRuntime | null = null;
let copyReceipt: CopyReceiptRuntime | null = null;

const replaceHash = (room: CollabRoomLink | null): void => {
    const url = new URL(window.location.href);
    url.hash = room
        ? new URL(buildCollabLink(room)).hash
        : '';
    window.history.replaceState(null, '', url);
};

const fingerprintKey = async (key: string): Promise<string> => {
    const bytes = new TextEncoder().encode(key);
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest).slice(0, 6), byte => (
        byte.toString(16).padStart(2, '0')
    )).join('');
};

const getSignalingOptions = (): { signaling?: string[] } => {
    const configured = import.meta.env.VITE_COLLAB_SIGNALING as string | undefined;
    if (configured === undefined) return {};
    const signaling = configured.split(',').map(value => value.trim()).filter(Boolean);
    if (signaling.length === 0) throw new Error('VITE_COLLAB_SIGNALING is empty');
    signaling.forEach(value => {
        const url = new URL(value);
        if (url.protocol !== 'ws:' && url.protocol !== 'wss:') {
            throw new Error('Collaboration signaling URLs must use ws:// or wss://');
        }
    });
    return { signaling };
};

const resetHistories = (state: EditorUiState): void => {
    useEditorUiStore.setState({
        sprites: state.sprites.map(sprite => ({
            ...sprite,
            history: [clonePixelData(sprite.pixelData)],
            redoHistory: [],
            overlayHistory: [clonePixelData(sprite.overlayPixelData)],
            overlayRedoHistory: []
        }))
    });
};

const validRoleClaim = (value: unknown): value is RoleClaim => {
    if (typeof value !== 'object' || value === null) return false;
    const claim = value as Partial<RoleClaim>;
    return (claim.role === 'pending' || claim.role === 'host' || claim.role === 'guest')
        && Number.isSafeInteger(claim.epoch)
        && (claim.epoch ?? -1) >= 0
        && typeof claim.instanceId === 'string'
        && claim.instanceId.length > 0
        && claim.instanceId.length <= 64;
};

const awarenessEntries = (current: LiveRuntime): Array<{
    clientId: number;
    state: AwarenessState;
    claim: RoleClaim;
}> => {
    const entries: Array<{ clientId: number; state: AwarenessState; claim: RoleClaim }> = [];
    current.provider.awareness.getStates().forEach((rawState, clientId) => {
        const state = rawState as AwarenessState;
        if (validRoleClaim(state.roleClaim)) entries.push({ clientId, state, claim: state.roleClaim });
    });
    return entries;
};

const publishClaim = (current: LiveRuntime, role: CollabRole, epoch = current.roleClaim.epoch): void => {
    const previousRole = current.roleClaim.role;
    current.roleClaim = { role, epoch, instanceId: current.instanceId };
    current.provider.awareness.setLocalStateField('roleClaim', current.roleClaim);
    useCollabStore.getState().setLifecycle({ role });
    if (current.activated && previousRole !== role) {
        if (previousRole === 'host' && role === 'guest') {
            useEditorUiStore.getState().notify('Role conflict resolved — you are now Guest', 'info');
        } else if (role === 'host') {
            useEditorUiStore.getState().notify('Collaborator left — you are now Host', 'info');
        }
    }
};

const isValidHexColor = (value: unknown): value is string => (
    typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)
);

const isValidRecentColors = (value: unknown): value is string[] => (
    Array.isArray(value) && value.length <= 16 && value.every(isValidHexColor)
);

const isValidPixelIndex = (value: unknown): value is number => (
    typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < TOTAL_PIXELS
);

const parseAwarenessSelectedPixels = (value: unknown): Set<number> => {
    if (!Array.isArray(value) || value.length > TOTAL_PIXELS) return new Set();
    return new Set(value.filter(isValidPixelIndex));
};

const parseAwarenessFloatingLayer = (value: unknown): Map<number, string | null> => {
    const layer = new Map<number, string | null>();
    if (!Array.isArray(value) || value.length > TOTAL_PIXELS) return layer;
    for (const entry of value) {
        if (!Array.isArray(entry) || entry.length !== 2) continue;
        const [index, color] = entry;
        if (!isValidPixelIndex(index)) continue;
        if (color !== null && !isValidHexColor(color)) continue;
        layer.set(index, color);
    }
    return layer;
};

const peersFromAwareness = (current: LiveRuntime): CollabPeer[] => (
    awarenessEntries(current)
        .filter(entry => entry.clientId !== current.doc.clientID)
        .map(entry => ({
            clientId: entry.clientId,
            // Malformed/stale entries fall back to a neutral gray rather than
            // trusting an arbitrary string — never a fixed "identity" color.
            color: isValidHexColor(entry.state.color) ? entry.state.color : '#8c91a6',
            tool: VALID_TOOLS.includes(entry.state.tool as Tool) ? (entry.state.tool as Tool) : 'brush',
            brushSize: entry.state.brushSize === 2 ? 2 as const : 1 as const,
            cursor: entry.state.cursor
                && Number.isInteger(entry.state.cursor.x)
                && Number.isInteger(entry.state.cursor.y)
                && entry.state.cursor.x >= 0
                && entry.state.cursor.x < 32
                && entry.state.cursor.y >= 0
                && entry.state.cursor.y < 32
                ? entry.state.cursor
                : null,
            frameId: typeof entry.state.frameId === 'string' ? entry.state.frameId : null,
            instanceId: entry.claim.instanceId,
            role: entry.claim.role,
            selectedPixels: parseAwarenessSelectedPixels(entry.state.selectedPixels),
            floatingLayer: parseAwarenessFloatingLayer(entry.state.floatingLayer)
        }))
);

const finishOutgoingProposal = (
    current: LiveRuntime,
    approved: boolean
): void => {
    const outgoing = current.outgoingProposal;
    if (!outgoing) return;
    current.outgoingProposal = null;
    useCollabStore.getState().setOutgoingProposalKind(null);
    window.clearTimeout(outgoing.timer);
    current.provider.awareness.setLocalStateField('proposal', null);
    outgoing.resolve({ id: outgoing.proposal.id, approved });
};

/** Withdraw the local user's pending wholesale proposal (resolves as declined). */
export const cancelOutgoingProposal = (): void => {
    const current = runtime;
    if (!current) return;
    finishOutgoingProposal(current, false);
};

const isValidProposal = (value: unknown): value is WholesaleProposal => {
    if (typeof value !== 'object' || value === null) return false;
    const proposal = value as Partial<WholesaleProposal>;
    return typeof proposal.id === 'string'
        && proposal.id.length <= 64
        && (proposal.kind === 'palette-convert' || proposal.kind === 'load-project')
        && typeof proposal.ts === 'number'
        && Math.abs(Date.now() - proposal.ts) <= 60_000
        && typeof proposal.payload === 'object'
        && proposal.payload !== null;
};

const processProposals = (current: LiveRuntime): void => {
    const remoteEntries = awarenessEntries(current).filter(entry => entry.clientId !== current.doc.clientID);

    const response = remoteEntries
        .map(entry => entry.state.proposalResponse)
        .find(candidate => candidate?.id === current.outgoingProposal?.proposal.id);
    if (response && current.outgoingProposal) {
        finishOutgoingProposal(current, response.approved);
    }

    const remoteProposalEntry = remoteEntries.find(entry => isValidProposal(entry.state.proposal));
    const remoteProposal = remoteProposalEntry?.state.proposal;
    if (!remoteProposal || !remoteProposalEntry) {
        if (current.incomingProposalId) {
            current.incomingProposalId = null;
            useCollabStore.getState().setIncomingProposal(null);
        }
        current.respondedProposalId = null;
        current.provider.awareness.setLocalStateField('proposalResponse', null);
        return;
    }

    if (current.respondedProposalId === remoteProposal.id) return;

    if (current.outgoingProposal) {
        const localId = current.outgoingProposal.proposal.id;
        if (resolveCrossingProposals(localId, remoteProposal.id) === 'local-proceeds') {
            current.provider.awareness.setLocalStateField('proposalResponse', {
                id: remoteProposal.id,
                approved: false,
                busy: true
            } satisfies WholesaleProposalResponse);
            return;
        }
        finishOutgoingProposal(current, false);
    }

    if (current.incomingProposalId === remoteProposal.id) return;
    current.incomingProposalId = remoteProposal.id;
    useCollabStore.getState().setIncomingProposal({
        id: remoteProposal.id,
        kind: remoteProposal.kind,
        payload: remoteProposal.payload,
        peerRole: remoteProposalEntry.claim.role === 'host' ? 'host' : 'guest'
    });
};

/**
 * A joining guest's own currentColor/recentColors are purely local state —
 * never part of the shared doc — so they'd otherwise start from this
 * browser's last session (or the app default) instead of matching whoever
 * is already here. Snapshot an established peer's broadcast tool/color/
 * recentColors once, at install time, so the guest picks up where the room
 * already is instead of arriving with unrelated context.
 */
const establishedPeerToolState = (current: LiveRuntime): {
    currentColor: string;
    recentColors: string[];
} | null => {
    const entry = awarenessEntries(current).find(candidate => (
        candidate.clientId !== current.doc.clientID && candidate.claim.role !== 'pending'
    ));
    if (!entry) return null;
    const color = entry.state.color;
    if (!isValidHexColor(color)) return null;
    const recentColors = isValidRecentColors(entry.state.recentColors) ? entry.state.recentColors : [color];
    return { currentColor: color, recentColors };
};

const installProjectFromDoc = (current: LiveRuntime): void => {
    const project = collabDocToProject(validateDoc(current.doc));
    useEditorUiStore.setState({
        ...project,
        activeSpriteId: project.sprites[0].id,
        floatingLayer: new Map(),
        selectedPixels: new Set(),
        isPlaying: false,
        // The guest is receiving the Host's project fully-formed — it should
        // appear ready to draw on immediately, not replay the "pick a color
        // to begin" first-launch intro. Prefer matching whoever is already
        // here (their current color + recents); fall back to the palette's
        // first color only if no established peer state is available yet.
        ...(establishedPeerToolState(current) ?? wholesaleInstallRevealState(project.palette))
    });
};

const activateRuntime = (current: LiveRuntime): void => {
    if (current.activated || runtime !== current) return;
    validateDoc(current.doc);
    if (!current.creator) installProjectFromDoc(current);
    resetHistories(useEditorUiStore.getState());

    current.undo = createCollabUndoController(current.doc, () => {
        useCollabStore.getState().bumpUndoRevision();
        // Editor selectors read the imperative manager; provoke a selector pass.
        useEditorUiStore.setState({});
    });
    setActiveCollabUndoController(current.undo);
    current.bridge = createCollabBridge(current.doc, useEditorUiStore, { undo: current.undo });
    current.unsubscribeEditor = useEditorUiStore.subscribe((state, previous) => {
        if (state.activeSpriteId !== previous.activeSpriteId) {
            current.provider.awareness.setLocalStateField('frameId', state.activeSpriteId);
        }
        if (state.currentColor !== previous.currentColor) {
            current.provider.awareness.setLocalStateField('color', state.currentColor ?? state.palette[0]);
        }
        if (state.currentTool !== previous.currentTool) {
            current.provider.awareness.setLocalStateField('tool', state.currentTool);
        }
        if (state.brushSize !== previous.brushSize) {
            current.provider.awareness.setLocalStateField('brushSize', state.brushSize);
        }
        if (state.recentColors !== previous.recentColors) {
            current.provider.awareness.setLocalStateField('recentColors', state.recentColors);
        }
        // Both already update at most once per animation frame during a drag
        // (pixelBatching.ts flushes via rAF before either reference changes
        // in the store) — no extra throttling needed on top for "live drag".
        if (state.selectedPixels !== previous.selectedPixels) {
            current.provider.awareness.setLocalStateField(
                'selectedPixels',
                Array.from(state.selectedPixels)
            );
        }
        if (state.floatingLayer !== previous.floatingLayer) {
            current.provider.awareness.setLocalStateField(
                'floatingLayer',
                Array.from(state.floatingLayer.entries())
            );
        }
    });
    current.provider.awareness.setLocalStateField(
        'frameId',
        useEditorUiStore.getState().activeSpriteId
    );
    current.activated = true;
    if (!current.readySettled) {
        current.readySettled = true;
        current.resolveReady();
    }
    const peers = peersFromAwareness(current).filter(peer => peer.role !== 'pending');
    useCollabStore.getState().setPeers(peers);
    useCollabStore.getState().setLifecycle({
        documentReady: true,
        isSessionActive: true,
        status: peers.length > 0 ? 'connected' : 'waiting-peer'
    });
};

const closeRuntime = async (current: LiveRuntime, clearHash: boolean): Promise<void> => {
    if (runtime === current) runtime = null;
    useCollabStore.getState().setLiveSessionLink(null);
    if (!current.readySettled) {
        current.readySettled = true;
        current.rejectReady(new Error('Collaboration setup was cancelled'));
    }
    if (current.admissionTimer !== null) window.clearTimeout(current.admissionTimer);
    if (current.waitingTimer !== null) window.clearTimeout(current.waitingTimer);
    if (current.electionTimer !== null) window.clearTimeout(current.electionTimer);
    if (current.presenceHeartbeatTimer !== null) window.clearInterval(current.presenceHeartbeatTimer);
    current.unsubscribeEditor?.();
    finishOutgoingProposal(current, false);
    useCollabStore.getState().setIncomingProposal(null);
    current.bridge?.destroy();
    current.undo?.destroy();
    setActiveCollabUndoController(null);
    current.provider.awareness.setLocalState(null);
    current.provider.destroy();
    await current.persistence.destroy().catch(() => undefined);
    current.doc.destroy();
    if (clearHash) replaceHash(null);
};

/**
 * v1 sessions deliberately have no reconnection or role-promotion mode.
 * Once a room has admitted its collaborator, either peer disappearing ends
 * the live session for the remaining tab. The current merged document stays
 * in the editor and immediately becomes an ordinary local project.
 */
const detachAfterPeerDeparture = (current: LiveRuntime): void => {
    if (runtime !== current || !current.activated || !current.hadPeer) return;

    generation += 1;
    runtime = null;
    useEditorUiStore.getState().flushPendingPixelUpdates();
    // closeRuntime tears down the bridge/provider synchronously before its
    // IndexedDB cleanup await. Reset local state immediately after that
    // synchronous teardown so the UI never enters a reconnecting interlude.
    void closeRuntime(current, false);
    resetHistories(useEditorUiStore.getState());
    useCollabStore.getState().reset();
    useCollabStore.getState().setCopyOfferLink(getCurrentCopyOfferLink());
    replaceHash(null);
    useEditorUiStore.getState().notify(
        'Collaborator left — this is now a local project',
        'info'
    );
};

const rejectFullRoom = (current: LiveRuntime): void => {
    useCollabStore.getState().setLifecycle({
        error: 'This session already has a Host and Guest',
        status: 'full'
    });
    if (!current.readySettled) {
        current.readySettled = true;
        current.rejectReady(new Error('This session is full'));
    }
    void closeRuntime(current, false);
};

const resolveAdmission = (current: LiveRuntime): void => {
    if (runtime !== current) return;
    const entries = awarenessEntries(current);
    const claims = entries.map(entry => entry.claim);
    const assignments = resolveAdmissionClaims(claims);
    const hasEstablishedRemotePeer = entries.some(entry => (
        entry.clientId !== current.doc.clientID && entry.claim.role !== 'pending'
    ));
    if (hasEstablishedRemotePeer) current.hadPeer = true;
    if (current.activated && current.hadPeer && !hasEstablishedRemotePeer) {
        detachAfterPeerDeparture(current);
        return;
    }
    const anyEstablishedClaim = claims.some(claim => claim.role !== 'pending');

    // Pending + total silence: inconclusive, not an empty room. The real
    // Host's awareness is usually still in flight; claiming a role now
    // creates equal-epoch host conflicts that can demote the true Host.
    // Only after ELECTION_WINDOW_MS of continued silence do pending peers
    // deterministically elect (lowest instanceId → Host, next → Guest).
    if (current.roleClaim.role === 'pending' && !anyEstablishedClaim) {
        if (current.electionTimer === null) {
            current.electionTimer = window.setTimeout(() => {
                current.electionTimer = null;
                if (runtime !== current || current.roleClaim.role !== 'pending') return;
                const nowClaims = awarenessEntries(current).map(entry => entry.claim);
                if (nowClaims.some(claim => claim.role !== 'pending')) {
                    resolveAdmission(current);
                    return;
                }
                const ordered = nowClaims
                    .filter(claim => claim.role === 'pending')
                    .sort((left, right) => left.instanceId.localeCompare(right.instanceId));
                if (ordered[0]?.instanceId === current.instanceId) {
                    publishClaim(current, 'host');
                } else if (ordered[1]?.instanceId === current.instanceId) {
                    publishClaim(current, 'guest');
                } else {
                    rejectFullRoom(current);
                    return;
                }
                resolveAdmission(current);
            }, ELECTION_WINDOW_MS);
        }
        return;
    }
    if (current.electionTimer !== null) {
        window.clearTimeout(current.electionTimer);
        current.electionTimer = null;
    }

    const { host, guest } = assignments;
    let assignedRole: CollabRole | null = null;
    if (host?.instanceId === current.instanceId) assignedRole = 'host';
    else if (guest?.instanceId === current.instanceId) assignedRole = 'guest';

    // A pending peer only ever becomes Host via explicit empty-room election
    // (above) or by being the session creator.
    if (assignedRole === 'host' && current.roleClaim.role === 'pending') {
        return;
    }

    if (!assignedRole) {
        if (current.roleClaim.role === 'pending' && claims.length >= 3) rejectFullRoom(current);
        return;
    }
    if (current.roleClaim.role !== assignedRole) {
        publishClaim(current, assignedRole, Math.max(current.roleClaim.epoch, host?.epoch ?? 0));
    }

    const peers = peersFromAwareness(current).filter(peer => peer.role !== 'pending');
    const hadPeers = useCollabStore.getState().peers.length > 0;
    useCollabStore.getState().setPeers(peers);
    if (current.activated && !hadPeers && peers.length > 0) {
        useEditorUiStore.getState().notify(
            `${current.roleClaim.role === 'host' ? 'Guest' : 'Host'} joined — you're drawing together now`,
            'info'
        );
    }
    if (getCollabDocHandles(current.doc).meta.get('initialized') === true) {
        try {
            activateRuntime(current);
        } catch (error) {
            useCollabStore.getState().setLifecycle({
                error: error instanceof Error ? error.message : 'Invalid collaboration document',
                status: 'error'
            });
            if (!current.readySettled) {
                current.readySettled = true;
                current.rejectReady(error instanceof Error ? error : new Error('Invalid collaboration document'));
            }
        }
    }
    if (current.activated) {
        useCollabStore.getState().setLifecycle({
            status: peers.length > 0 ? 'connected' : 'waiting-peer'
        });
    }
};

const scheduleAdmission = (current: LiveRuntime): void => {
    if (current.admissionTimer !== null) window.clearTimeout(current.admissionTimer);
    current.admissionTimer = window.setTimeout(() => {
        current.admissionTimer = null;
        resolveAdmission(current);
    }, ADMISSION_SETTLE_MS);
};

const attachProviderListeners = (current: LiveRuntime): void => {
    current.provider.on('status', ({ connected }) => {
        if (runtime !== current) return;
        useCollabStore.getState().setLifecycle({ signalingConnected: connected });
    });
    current.provider.on('peers', ({ webrtcPeers, bcPeers }) => {
        if (runtime !== current) return;
        // Awareness intentionally retains a vanished client's last state for
        // about 30 seconds. The provider's physical peer list changes as soon
        // as the tab/connection closes, which is the v1 session boundary.
        if (
            current.activated
            && current.hadPeer
            && webrtcPeers.length === 0
            && bcPeers.length === 0
        ) {
            detachAfterPeerDeparture(current);
            return;
        }
        scheduleAdmission(current);
    });
    current.provider.awareness.on('change', () => {
        if (runtime !== current) return;
        scheduleAdmission(current);
        const peers = peersFromAwareness(current).filter(peer => peer.role !== 'pending');
        const hadEstablishedPeer = current.hadPeer;
        if (peers.length > 0) current.hadPeer = true;
        useCollabStore.getState().setPeers(peers);
        if (current.activated && hadEstablishedPeer && peers.length === 0) {
            detachAfterPeerDeparture(current);
            return;
        }
        processProposals(current);
    });
    current.doc.on('afterTransaction', () => {
        if (
            runtime === current
            && !current.activated
            && getCollabDocHandles(current.doc).meta.get('initialized') === true
        ) {
            scheduleAdmission(current);
        }
    });
    // Defensive re-check independent of inbound events — see
    // PRESENCE_HEARTBEAT_MS above for why this exists.
    current.presenceHeartbeatTimer = window.setInterval(() => {
        if (runtime !== current) return;
        resolveAdmission(current);
    }, PRESENCE_HEARTBEAT_MS);
};

const createRuntime = async (
    room: CollabRoomLink,
    creator: boolean
): Promise<LiveRuntime> => {
    generation += 1;
    const currentGeneration = generation;
    const doc = new Y.Doc();
    const fingerprint = await fingerprintKey(room.key);
    const persistence = new IndexeddbPersistence(
        `ag-live-${room.roomId}-${fingerprint}`,
        doc
    );
    useCollabStore.getState().setLifecycle({ status: 'loading-cache' });
    await persistence.whenSynced;
    if (currentGeneration !== generation) {
        await persistence.destroy();
        doc.destroy();
        throw new Error('Collaboration setup was superseded');
    }

    if (creator) {
        const handles = getCollabDocHandles(doc);
        if (handles.meta.size || handles.frames.size || handles.palette.size) {
            await persistence.destroy();
            doc.destroy();
            throw new Error('New collaboration room unexpectedly contains cached data');
        }
        useEditorUiStore.getState().flushPendingPixelUpdates();
        seedDocFromStore(doc, useEditorUiStore.getState());
    }

    const provider = new WebrtcProvider(room.roomId, doc, {
        password: room.key,
        maxConns: 3,
        ...getSignalingOptions()
    });
    const instanceId = nanoid();
    const roleClaim: RoleClaim = {
        role: creator ? 'host' : 'pending',
        epoch: 0,
        instanceId
    };
    let resolveReady!: () => void;
    let rejectReady!: (error: Error) => void;
    const readyPromise = new Promise<void>((resolve, reject) => {
        resolveReady = resolve;
        rejectReady = reject;
    });
    void readyPromise.catch(() => undefined);
    const current: LiveRuntime = {
        generation: currentGeneration,
        room,
        instanceId,
        roleClaim,
        doc,
        persistence,
        provider,
        bridge: null,
        undo: null,
        unsubscribeEditor: null,
        admissionTimer: null,
        waitingTimer: null,
        electionTimer: null,
        presenceHeartbeatTimer: null,
        activated: false,
        creator,
        readyPromise,
        resolveReady,
        rejectReady,
        readySettled: false,
        outgoingProposal: null,
        incomingProposalId: null,
        respondedProposalId: null,
        hadPeer: false
    };
    runtime = current;
    useCollabStore.getState().setLiveSessionLink(buildCollabLink(room));
    const localState = useEditorUiStore.getState();
    provider.awareness.setLocalState({
        roleClaim,
        color: localState.currentColor ?? localState.palette[0],
        tool: localState.currentTool,
        brushSize: localState.brushSize,
        recentColors: localState.recentColors,
        selectedPixels: creator ? Array.from(localState.selectedPixels) : [],
        floatingLayer: creator ? Array.from(localState.floatingLayer.entries()) : [],
        frameId: creator ? localState.activeSpriteId : null,
        cursor: null
    });
    attachProviderListeners(current);
    current.waitingTimer = window.setTimeout(() => {
        if (runtime !== current || current.activated) return;
        useCollabStore.getState().setLifecycle({ status: 'waiting-peer' });
    }, WAITING_NOTICE_MS);
    return current;
};

export const startLiveSession = async (): Promise<string> => {
    if (runtime) return buildCollabLink(runtime.room);
    const room: CollabRoomLink = {
        roomId: nanoid(ROOM_ID_LENGTH),
        key: nanoid(ROOM_KEY_LENGTH),
        mode: 'live'
    };
    useCollabStore.getState().setLifecycle({
        error: null,
        roomId: room.roomId,
        role: 'host',
        status: 'loading-cache'
    });
    let current: LiveRuntime | null = null;
    try {
        current = await createRuntime(room, true);
        replaceHash(room);
        activateRuntime(current);
        return buildCollabLink(room);
    } catch (error) {
        if (current) await closeRuntime(current, true);
        useCollabStore.getState().setLifecycle({
            error: error instanceof Error ? error.message : 'Could not start collaboration',
            status: 'error'
        });
        throw error;
    }
};

export const joinLiveSession = async (room: CollabRoomLink): Promise<void> => {
    if (room.mode !== 'live') throw new Error('Copy links use the copy receiver flow');
    if (runtime) await leaveLiveSession(false);
    useCollabStore.getState().setLifecycle({
        error: null,
        roomId: room.roomId,
        role: 'pending',
        status: 'loading-cache'
    });
    let current: LiveRuntime | null = null;
    try {
        current = await createRuntime(room, false);
        replaceHash(room);
        scheduleAdmission(current);
        await current.readyPromise;
    } catch (error) {
        const status = useCollabStore.getState().status;
        useCollabStore.getState().setLifecycle({
            error: error instanceof Error ? error.message : 'Could not join collaboration',
            status: status === 'full' ? 'full' : 'error'
        });
        throw error;
    }
};

export const leaveLiveSession = async (clearHash = true): Promise<void> => {
    generation += 1;
    const current = runtime;
    useEditorUiStore.getState().flushPendingPixelUpdates();
    if (current) await closeRuntime(current, clearHash);
    resetHistories(useEditorUiStore.getState());
    useCollabStore.getState().reset();
    useCollabStore.getState().setCopyOfferLink(getCurrentCopyOfferLink());
    if (clearHash && !current) replaceHash(null);
};

export const publishLocalCollabCursor = (cursor: CollabCursor | null): void => {
    runtime?.provider.awareness.setLocalStateField('cursor', cursor);
};

export const getCurrentCollabLink = (): string | null => (
    runtime ? buildCollabLink(runtime.room) : null
);

const destroyCopyOffer = (): void => {
    const offer = copyOffer;
    if (!offer) return;
    copyOffer = null;
    useCollabStore.getState().setCopyOfferLink(null);
    window.clearTimeout(offer.expiryTimer);
    window.removeEventListener('beforeunload', offer.beforeUnload);
    offer.provider.awareness.setLocalState(null);
    offer.provider.destroy();
    offer.doc.destroy();
};

export const revokeCopyOffer = (): void => destroyCopyOffer();

export const getCurrentCopyOfferLink = (): string | null => (
    copyOffer ? buildCollabLink(copyOffer.room) : null
);

export const createCopyOffer = async (): Promise<string> => {
    destroyCopyOffer();
    useEditorUiStore.getState().flushPendingPixelUpdates();
    const room: CollabRoomLink = {
        roomId: nanoid(ROOM_ID_LENGTH),
        key: nanoid(ROOM_KEY_LENGTH),
        mode: 'copy'
    };
    const doc = new Y.Doc();
    seedDocFromStore(doc, useEditorUiStore.getState());
    const provider = new WebrtcProvider(room.roomId, doc, {
        password: room.key,
        maxConns: 2,
        ...getSignalingOptions()
    });
    const beforeUnload = () => destroyCopyOffer();
    const offer: CopyOfferRuntime = {
        room,
        doc,
        provider,
        expiryTimer: window.setTimeout(destroyCopyOffer, COPY_OFFER_TTL_MS),
        beforeUnload
    };
    copyOffer = offer;
    useCollabStore.getState().setCopyOfferLink(buildCollabLink(room));
    window.addEventListener('beforeunload', beforeUnload);
    const sharerState = useEditorUiStore.getState();
    provider.awareness.setLocalState({
        copyOffer: { offerId: room.roomId },
        color: sharerState.currentColor ?? sharerState.palette[0],
        recentColors: sharerState.recentColors
    });
    provider.awareness.on('change', () => {
        if (copyOffer !== offer) return;
        const acknowledged = [...provider.awareness.getStates().values()].some(state => {
            const ack = (state as { copyAck?: { offerId?: unknown } }).copyAck;
            return ack?.offerId === room.roomId;
        });
        if (acknowledged) destroyCopyOffer();
    });
    return buildCollabLink(room);
};

const destroyCopyReceipt = (reason?: Error): void => {
    const receipt = copyReceipt;
    if (!receipt) return;
    copyReceipt = null;
    if (!receipt.settled && reason) {
        receipt.settled = true;
        receipt.reject(reason);
    }
    receipt.provider.awareness.setLocalState(null);
    receipt.provider.destroy();
    receipt.doc.destroy();
};

export const cancelCopyReceipt = (): void => {
    destroyCopyReceipt(new Error('Copy receipt was cancelled'));
    replaceHash(null);
};

export const receiveCopyOffer = async (room: CollabRoomLink): Promise<void> => {
    if (room.mode !== 'copy') throw new Error('Expected a copy link');
    if (runtime) await leaveLiveSession(false);
    destroyCopyReceipt(new Error('A newer copy receipt replaced this one'));

    const doc = new Y.Doc();
    const provider = new WebrtcProvider(room.roomId, doc, {
        password: room.key,
        maxConns: 2,
        ...getSignalingOptions()
    });
    let resolveReceipt!: () => void;
    let rejectReceipt!: (error: Error) => void;
    const received = new Promise<void>((resolve, reject) => {
        resolveReceipt = resolve;
        rejectReceipt = reject;
    });
    void received.catch(() => undefined);
    const receipt: CopyReceiptRuntime = {
        room,
        doc,
        provider,
        reject: rejectReceipt,
        settled: false
    };
    copyReceipt = receipt;
    provider.awareness.setLocalState({ copyReceiver: { instanceId: nanoid() } });

    const sharerToolState = (): { currentColor: string; recentColors: string[] } | null => {
        for (const state of provider.awareness.getStates().values()) {
            const candidate = state as { copyOffer?: unknown; color?: unknown; recentColors?: unknown };
            if (!candidate.copyOffer || !isValidHexColor(candidate.color)) continue;
            return {
                currentColor: candidate.color,
                recentColors: isValidRecentColors(candidate.recentColors) ? candidate.recentColors : [candidate.color]
            };
        }
        return null;
    };

    const tryInstall = (): void => {
        if (copyReceipt !== receipt || receipt.settled) return;
        if (getCollabDocHandles(doc).meta.get('initialized') !== true) return;
        try {
            const project = collabDocToProject(validateDoc(doc));
            useEditorUiStore.setState({
                ...project,
                activeSpriteId: project.sprites[0].id,
                floatingLayer: new Map(),
                selectedPixels: new Set(),
                isPlaying: false,
                ...(sharerToolState() ?? wholesaleInstallRevealState(project.palette))
            });
            resetHistories(useEditorUiStore.getState());
            provider.awareness.setLocalStateField('copyAck', { offerId: room.roomId });
            receipt.settled = true;
            resolveReceipt();
            window.setTimeout(() => {
                if (copyReceipt === receipt) {
                    destroyCopyReceipt();
                    replaceHash(null);
                }
            }, 500);
        } catch (error) {
            receipt.settled = true;
            rejectReceipt(error instanceof Error ? error : new Error('Invalid copy document'));
            destroyCopyReceipt();
        }
    };
    doc.on('afterTransaction', tryInstall);
    tryInstall();
    await received;
};

export const getRemoteAwarenessStates = (): Array<{
    clientId: number;
    state: AwarenessState;
}> => {
    if (!runtime) return [];
    const states: Array<{ clientId: number; state: AwarenessState }> = [];
    runtime.provider.awareness.getStates().forEach((state, clientId) => {
        if (clientId !== runtime?.doc.clientID) {
            states.push({ clientId, state: state as AwarenessState });
        }
    });
    return states;
};

export const proposeWholesaleChange = (
    kind: WholesaleProposal['kind'],
    payload: WholesaleProposal['payload']
): Promise<WholesaleProposalResult> => {
    const current = runtime;
    const id = nanoid();
    if (!current?.activated) return Promise.resolve({ id, approved: true });
    const establishedPeers = awarenessEntries(current).filter(entry => (
        entry.clientId !== current.doc.clientID && entry.claim.role !== 'pending'
    ));
    if (current.outgoingProposal) {
        return Promise.resolve({ id, approved: false });
    }
    if (establishedPeers.length === 0) {
        if (current.hadPeer) detachAfterPeerDeparture(current);
        return Promise.resolve({ id, approved: true });
    }
    const proposal: WholesaleProposal = { id, kind, payload, ts: Date.now() };
    return new Promise(resolve => {
        const timer = window.setTimeout(() => {
            if (current.outgoingProposal?.proposal.id === id) finishOutgoingProposal(current, false);
        }, 30_000);
        current.outgoingProposal = { proposal, resolve, timer };
        useCollabStore.getState().setOutgoingProposalKind(kind);
        current.provider.awareness.setLocalStateField('proposal', proposal);
    });
};

export const respondToWholesaleProposal = (id: string, approved: boolean): void => {
    const current = runtime;
    if (!current || current.incomingProposalId !== id) return;
    current.respondedProposalId = id;
    current.provider.awareness.setLocalStateField('proposalResponse', { id, approved });
    current.incomingProposalId = null;
    useCollabStore.getState().setIncomingProposal(null);
};

export const applyApprovedWholesale = <T>(
    result: WholesaleProposalResult,
    kind: WholesaleProposal['kind'],
    action: () => T
): T | undefined => {
    if (!result.approved) return undefined;
    return withCollabWholesaleAction(
        LOCAL_WHOLESALE_ORIGIN,
        { id: result.id, kind },
        action
    );
};
