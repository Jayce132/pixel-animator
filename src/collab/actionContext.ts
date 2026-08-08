let currentOrigin: unknown = null;
export interface CollabWholesaleMarker {
    id: string;
    kind: 'palette-convert' | 'load-project';
}

let currentWholesaleMarker: CollabWholesaleMarker | null = null;

export const getCollabActionOrigin = (): unknown => currentOrigin;
export const getCollabWholesaleMarker = () => currentWholesaleMarker;

/**
 * Supplies an explicit origin to synchronous Zustand actions. Store listeners
 * run synchronously, so the bridge observes this value before it is restored.
 */
export const withCollabActionOrigin = <T>(origin: unknown, action: () => T): T => {
    const previousOrigin = currentOrigin;
    currentOrigin = origin;
    try {
        return action();
    } finally {
        currentOrigin = previousOrigin;
    }
};

export const withCollabWholesaleAction = <T>(
    origin: unknown,
    marker: CollabWholesaleMarker,
    action: () => T
): T => {
    const previousMarker = currentWholesaleMarker;
    currentWholesaleMarker = marker;
    try {
        return withCollabActionOrigin(origin, action);
    } finally {
        currentWholesaleMarker = previousMarker;
    }
};
