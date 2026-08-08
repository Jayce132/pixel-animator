import { useCollabStore } from '../stores/collabStore';

export interface CollabCursor {
    x: number;
    y: number;
}

export const updateLocalCollabCursor = (cursor: CollabCursor | null): void => {
    if (!useCollabStore.getState().isSessionActive) return;
    void import('./session').then(session => session.publishLocalCollabCursor(cursor));
};
