import React from 'react';
import { useCollabStore } from '../../stores/collabStore';
import { useEditorUiStore } from '../../stores/editorStore';
import { useEscapeKey } from './collabUi';

interface InviteModalProps {
    onClose: () => void;
}

const copyText = async (value: string): Promise<void> => {
    if (!navigator.clipboard) throw new Error('Clipboard access is unavailable');
    await navigator.clipboard.writeText(value);
};

export const InviteModal: React.FC<InviteModalProps> = ({ onClose }) => {
    const role = useCollabStore(state => state.role);
    const peers = useCollabStore(state => state.peers);
    const isSessionActive = useCollabStore(state => state.isSessionActive);
    const error = useCollabStore(state => state.error);
    const notify = useEditorUiStore(state => state.notify);
    const [isBusy, setIsBusy] = React.useState(false);
    const copyOfferLink = useCollabStore(state => state.copyOfferLink);
    const link = useCollabStore(state => state.liveSessionLink);
    const currentColor = useEditorUiStore(state => state.currentColor);

    useEscapeKey(onClose);

    // The Host typically sits on this dialog while waiting for their guest.
    // The moment the guest arrives there's nothing left to do here — close it
    // so they land straight on the shared canvas (the "Guest joined" toast
    // explains the transition). Only the 0 → 1 *transition* closes; reopening
    // the modal while a guest is already present stays open.
    const peerPresent = peers.length > 0;
    const previousPeerPresentRef = React.useRef(peerPresent);
    React.useEffect(() => {
        const wasPresent = previousPeerPresentRef.current;
        previousPeerPresentRef.current = peerPresent;
        if (isSessionActive && peerPresent && !wasPresent) onClose();
    }, [peerPresent, isSessionActive, onClose]);

    const start = async () => {
        setIsBusy(true);
        try {
            const { startLiveSession } = await import('../../collab/session');
            const nextLink = await startLiveSession();
            await copyText(nextLink);
            notify('Link copied — anyone with it can draw with you', 'info');
        } catch (startError) {
            notify(startError instanceof Error ? startError.message : 'Could not start collaboration');
        } finally {
            setIsBusy(false);
        }
    };

    const copyLink = async () => {
        if (!link) return;
        try {
            await copyText(link);
            notify('Collaboration link copied', 'info');
        } catch (copyError) {
            notify(copyError instanceof Error ? copyError.message : 'Could not copy link');
        }
    };

    const leave = async () => {
        setIsBusy(true);
        const { leaveLiveSession } = await import('../../collab/session');
        await leaveLiveSession();
        setIsBusy(false);
        onClose();
        notify('Left collaboration — this tab is now a local project', 'info');
    };

    const shareCopy = async () => {
        setIsBusy(true);
        try {
            const { createCopyOffer } = await import('../../collab/session');
            const nextLink = await createCopyOffer();
            await copyText(nextLink);
            notify('One-shot copy link copied — it expires in 30 minutes', 'info');
        } catch (copyError) {
            notify(copyError instanceof Error ? copyError.message : 'Could not share a copy');
        } finally {
            setIsBusy(false);
        }
    };

    const revokeCopy = async () => {
        const { revokeCopyOffer } = await import('../../collab/session');
        revokeCopyOffer();
        notify('Copy offer revoked', 'info');
    };

    return (
        <div className="collab-modal-backdrop" role="presentation" onMouseDown={onClose}>
            <section
                className="collab-modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby="collab-modal-title"
                onMouseDown={event => event.stopPropagation()}
            >
                <div className="collab-modal-header">
                    <h2 id="collab-modal-title">Share</h2>
                    <button type="button" className="collab-close" onClick={onClose} aria-label="Close">×</button>
                </div>

                {!isSessionActive ? (
                    <>
                        <p>Invite one person to draw with you live. Both tabs keep a full peer-to-peer copy.</p>
                        <button type="button" className="primary-btn" autoFocus disabled={isBusy} onClick={start}>
                            {isBusy ? 'Starting…' : 'Invite a collaborator'}
                        </button>
                        <button type="button" className="secondary-btn" disabled={isBusy} onClick={shareCopy}>
                            Share a copy
                        </button>
                    </>
                ) : (
                    <>
                        <div className="collab-session-summary">
                            <span className="collab-peer-dot" style={{ backgroundColor: currentColor ?? '#8c91a6' }} />
                            <strong>You are {role === 'host' ? 'Host' : 'Guest'}</strong>
                        </div>
                        {/*
                          One sentence owns "is a peer here" — the old bare status
                          word ("Connected") duplicated this same fact in vaguer
                          language right next to it.
                        */}
                        <p>
                            {peers.length > 0
                                ? `${peers[0].role === 'host' ? 'Host' : 'Guest'} is connected and drawing with you.`
                                : role === 'host'
                                    ? 'Nobody has joined yet — share the link below to invite them.'
                                    : 'Waiting for the Host to be here…'}
                        </p>
                        {/* v1 sessions cap at one guest — once someone's here, the
                            room is full and there's nobody left to invite. */}
                        {role === 'host' && link && peers.length === 0 && (
                            <button type="button" className="primary-btn" onClick={copyLink}>
                                Copy invite link
                            </button>
                        )}
                        {/* Sharing a copy is independent of the live guest slot —
                            it stays available even while a guest is present. */}
                        {role === 'host' && (
                            <button type="button" className="secondary-btn" disabled={isBusy} onClick={shareCopy}>
                                Share a copy
                            </button>
                        )}
                        <button type="button" className="secondary-btn" disabled={isBusy} onClick={leave}>
                            Leave session
                        </button>
                    </>
                )}
                {copyOfferLink && (
                    <div className="collab-copy-offer">
                        <span>Copy offer active for 30 minutes</span>
                        <button type="button" className="secondary-btn-small" onClick={() => { void revokeCopy(); }}>Revoke</button>
                    </div>
                )}
                {error && <p className="collab-error" role="alert">{error}</p>}
                <p className="collab-fine-print">The link contains the room key. Share it only with someone you trust.</p>
            </section>
        </div>
    );
};
