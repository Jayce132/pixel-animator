import React from 'react';
import { useCollabStore } from '../../stores/collabStore';
import { useEscapeKey } from './collabUi';

/**
 * Proposer-side counterpart of ConsentPrompt: while our wholesale proposal
 * waits for the peer's answer (up to 30 s), show what is pending and offer a
 * way out. A banner, not a modal — drawing stays possible and strokes made in
 * the meantime merge normally.
 */
export const ProposalPendingOverlay: React.FC = () => {
    const kind = useCollabStore(state => state.outgoingProposalKind);
    const role = useCollabStore(state => state.role);

    const cancel = React.useCallback(() => {
        void import('../../collab/session').then(({ cancelOutgoingProposal }) => {
            cancelOutgoingProposal();
        });
    }, []);

    useEscapeKey(React.useCallback(() => {
        if (kind !== null) cancel();
    }, [kind, cancel]));

    if (kind === null) return null;

    const peerLabel = role === 'host' ? 'Guest' : 'Host';
    return (
        <div className="collab-pending-banner" role="status">
            <span className="collab-pending-spinner" aria-hidden="true" />
            <span>
                {kind === 'palette-convert'
                    ? `Waiting for ${peerLabel} to approve the palette conversion…`
                    : `Waiting for ${peerLabel} to approve loading the project…`}
            </span>
            <button type="button" className="secondary-btn-small" onClick={cancel}>
                Cancel
            </button>
        </div>
    );
};
