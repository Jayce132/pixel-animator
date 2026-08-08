import { create } from 'zustand';
import type { Tool } from '../types';

export type CollabStatus =
    | 'offline'
    | 'loading-cache'
    | 'waiting-peer'
    | 'syncing'
    | 'connected'
    | 'full'
    | 'error';

export type CollabRole = 'pending' | 'host' | 'guest';

export interface IncomingWholesaleProposal {
    id: string;
    kind: 'palette-convert' | 'load-project';
    payload: { colors?: string[]; fileName?: string; fileSize?: number; contentHash?: string };
    peerRole: 'host' | 'guest';
}

export interface CollabPeer {
    clientId: number;
    /** The peer's current paint color — drives presence indicators everywhere (no fixed identity color). */
    color: string;
    /** The peer's current tool — their presence cursor renders this tool's actual art. */
    tool: Tool;
    brushSize: 1 | 2;
    cursor: { x: number; y: number } | null;
    frameId: string | null;
    instanceId: string;
    role: CollabRole;
    /** The peer's active selection outline — read-only, never merged into your own selection. */
    selectedPixels: Set<number>;
    /** The peer's floating (dragged, not yet stamped) pixels — read-only preview. */
    floatingLayer: Map<number, string | null>;
}

export interface CollabStoreState {
    status: CollabStatus;
    /** Kind of the local user's wholesale proposal awaiting the peer's answer. */
    outgoingProposalKind: 'palette-convert' | 'load-project' | null;
    roomId: string | null;
    role: CollabRole | null;
    peers: CollabPeer[];
    isSessionActive: boolean;
    signalingConnected: boolean;
    documentReady: boolean;
    error: string | null;
    undoRevision: number;
    incomingProposal: IncomingWholesaleProposal | null;
    copyOfferLink: string | null;
    liveSessionLink: string | null;
    setLifecycle: (updates: Partial<Pick<
        CollabStoreState,
        | 'documentReady'
        | 'error'
        | 'isSessionActive'
        | 'role'
        | 'roomId'
        | 'signalingConnected'
        | 'status'
    >>) => void;
    setPeers: (peers: CollabPeer[]) => void;
    setIncomingProposal: (proposal: IncomingWholesaleProposal | null) => void;
    setOutgoingProposalKind: (kind: 'palette-convert' | 'load-project' | null) => void;
    setCopyOfferLink: (link: string | null) => void;
    setLiveSessionLink: (link: string | null) => void;
    bumpUndoRevision: () => void;
    reset: () => void;
}

const initialCollabState = {
    status: 'offline' as const,
    roomId: null,
    role: null,
    peers: [] as CollabPeer[],
    isSessionActive: false,
    signalingConnected: false,
    documentReady: false,
    error: null,
    undoRevision: 0,
    incomingProposal: null as IncomingWholesaleProposal | null,
    outgoingProposalKind: null as 'palette-convert' | 'load-project' | null,
    copyOfferLink: null,
    liveSessionLink: null
};

export const useCollabStore = create<CollabStoreState>((set) => ({
    ...initialCollabState,
    setLifecycle: (updates) => set(updates),
    setPeers: (peers) => set({ peers }),
    setIncomingProposal: (incomingProposal) => set({ incomingProposal }),
    setOutgoingProposalKind: (outgoingProposalKind) => set({ outgoingProposalKind }),
    setCopyOfferLink: (copyOfferLink) => set({ copyOfferLink }),
    setLiveSessionLink: (liveSessionLink) => set({ liveSessionLink }),
    bumpUndoRevision: () => set(state => ({ undoRevision: state.undoRevision + 1 })),
    reset: () => set({
        ...initialCollabState,
        peers: []
    })
}));
