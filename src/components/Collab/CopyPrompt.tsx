import React from 'react';
import type { CollabRoomLink } from '../../collab/links';
import { useEditorUiStore } from '../../stores/editorStore';
import { useEscapeKey } from './collabUi';

interface CopyPromptProps {
    room: CollabRoomLink;
    onResolved: () => void;
}

export const CopyPrompt: React.FC<CopyPromptProps> = ({ room, onResolved }) => {
    const projectName = useEditorUiStore(state => state.projectName);
    const saveProject = useEditorUiStore(state => state.saveProject);
    const notify = useEditorUiStore(state => state.notify);
    const [isWaiting, setIsWaiting] = React.useState(false);

    const receive = async () => {
        setIsWaiting(true);
        try {
            const { receiveCopyOffer } = await import('../../collab/session');
            await receiveCopyOffer(room);
            notify('Shared copy received — it is now your local project', 'info');
            onResolved();
        } catch (error) {
            if (error instanceof Error && error.message === 'Copy receipt was cancelled') return;
            notify(error instanceof Error ? error.message : 'Could not receive copy');
            setIsWaiting(false);
        }
    };

    const saveThenReceive = () => {
        saveProject(projectName);
        void receive();
    };

    const cancel = React.useCallback(async () => {
        const { cancelCopyReceipt } = await import('../../collab/session');
        cancelCopyReceipt();
        setIsWaiting(false);
        onResolved();
    }, [onResolved]);

    useEscapeKey(React.useCallback(() => { void cancel(); }, [cancel]));

    return (
        <div className="collab-modal-backdrop">
            <section className="collab-modal" role="dialog" aria-modal="true" aria-labelledby="copy-title">
                <h2 id="copy-title">Get a copy of this project?</h2>
                <span className="collab-flow-badge">One-time copy</span>
                <p>Your current drawing will be replaced. The received project will not stay connected to the sender.</p>
                {isWaiting && (
                    <div className="collab-connecting-status collab-fine-print">
                        <span className="collab-pending-spinner" aria-hidden="true" />
                        <span>Waiting for the person who shared this copy…</span>
                    </div>
                )}
                <div className="collab-modal-actions">
                    <button type="button" className="primary-btn" autoFocus disabled={isWaiting} onClick={() => void receive()}>
                        {isWaiting ? 'Waiting…' : 'Get copy'}
                    </button>
                    <button type="button" className="secondary-btn" disabled={isWaiting} onClick={saveThenReceive}>
                        Save mine first
                    </button>
                    <button type="button" className="secondary-btn" onClick={() => { void cancel(); }}>Cancel</button>
                </div>
            </section>
        </div>
    );
};
