import React from 'react';
import type { CollabRoomLink } from '../../collab/links';
import { useEditorUiStore } from '../../stores/editorStore';
import { useCollabStore } from '../../stores/collabStore';
import { describeCollabStatus, useEscapeKey } from './collabUi';

interface JoinPromptProps {
    room: CollabRoomLink;
    onResolved: () => void;
}

export const JoinPrompt: React.FC<JoinPromptProps> = ({ room, onResolved }) => {
    const projectName = useEditorUiStore(state => state.projectName);
    const saveProject = useEditorUiStore(state => state.saveProject);
    const notify = useEditorUiStore(state => state.notify);
    const status = useCollabStore(state => state.status);
    const error = useCollabStore(state => state.error);
    const [isBusy, setIsBusy] = React.useState(false);

    const join = async () => {
        setIsBusy(true);
        try {
            const { joinLiveSession } = await import('../../collab/session');
            await joinLiveSession(room);
            onResolved();
        } catch (error) {
            notify(error instanceof Error ? error.message : 'Could not join collaboration');
            setIsBusy(false);
        }
    };

    const saveThenJoin = () => {
        saveProject(projectName);
        void join();
    };

    const cancel = React.useCallback(async () => {
        const { leaveLiveSession } = await import('../../collab/session');
        await leaveLiveSession();
        onResolved();
    }, [onResolved]);

    useEscapeKey(React.useCallback(() => { void cancel(); }, [cancel]));

    return (
        <div className="collab-modal-backdrop">
            <section className="collab-modal" role="dialog" aria-modal="true" aria-labelledby="join-title">
                <h2 id="join-title">Join as Guest?</h2>
                <span className="collab-flow-badge">Live collaboration</span>
                <p>Your current drawing will be replaced after the shared project is received and validated.</p>
                {isBusy && (
                    <div className="collab-connecting-status collab-fine-print">
                        <span className="collab-pending-spinner" aria-hidden="true" />
                        <span>{describeCollabStatus(status)}</span>
                    </div>
                )}
                {error && <p className="collab-error" role="alert">{error}</p>}
                <div className="collab-modal-actions">
                    <button type="button" className="primary-btn" autoFocus disabled={isBusy} onClick={() => void join()}>
                        {isBusy ? 'Joining…' : 'Join'}
                    </button>
                    <button type="button" className="secondary-btn" disabled={isBusy} onClick={saveThenJoin}>
                        Save mine first
                    </button>
                    <button type="button" className="secondary-btn" onClick={() => void cancel()}>
                        Cancel
                    </button>
                </div>
            </section>
        </div>
    );
};
