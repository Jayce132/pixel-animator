import { useEffect } from 'react';
import type { CollabStatus } from '../../stores/collabStore';

/** Raw lifecycle statuses are internal enums — never show them verbatim. */
export const describeCollabStatus = (status: CollabStatus): string => {
    switch (status) {
        case 'offline': return 'Offline';
        case 'loading-cache': return 'Loading saved session…';
        case 'waiting-peer': return 'Waiting for your collaborator…';
        case 'syncing': return 'Syncing project…';
        case 'connected': return 'Connected';
        case 'full': return 'Session is full';
        case 'error': return 'Connection error';
    }
};

/** Dialog-level Escape handling, matching the palette selector's pattern. */
export const useEscapeKey = (onEscape: () => void): void => {
    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') onEscape();
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [onEscape]);
};
