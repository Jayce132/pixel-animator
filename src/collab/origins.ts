/** Stable transaction origins used by the bridge and Y.UndoManager filters. */
export const LOCAL_PIXEL_ORIGIN = Object.freeze({ kind: 'local-pixel' });
export const LOCAL_PALETTE_ORIGIN = Object.freeze({ kind: 'local-palette' });
export const LOCAL_STRUCTURAL_ORIGIN = Object.freeze({ kind: 'local-structural' });
export const LOCAL_WHOLESALE_ORIGIN = Object.freeze({ kind: 'local-wholesale' });
export const SYSTEM_REPAIR_ORIGIN = Object.freeze({ kind: 'system-repair' });
export const SYSTEM_SEED_ORIGIN = Object.freeze({ kind: 'system-seed' });

export const LOCAL_COLLAB_ORIGINS: ReadonlySet<unknown> = new Set([
    LOCAL_PIXEL_ORIGIN,
    LOCAL_PALETTE_ORIGIN,
    LOCAL_STRUCTURAL_ORIGIN,
    LOCAL_WHOLESALE_ORIGIN
]);
