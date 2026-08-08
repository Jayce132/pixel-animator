import type { StoreApi } from 'zustand/vanilla';
import * as Y from 'yjs';
import type { PixelData, Sprite } from '../types';
import type { EditorUiState } from '../stores/editor/types';
import {
    pixelDataEquals,
    pixelDataToColorArray
} from '../utils/pixelData';
import { getCollabActionOrigin, getCollabWholesaleMarker } from './actionContext';
import {
    collabDocToProject,
    getCollabDocHandles,
    MAX_COLLAB_FRAMES,
    normalizeCollabHex,
    repairEmptyFrames,
    spriteToYFrame,
    validateDoc
} from './doc';
import type { ValidatedCollabDoc } from './doc';
import {
    LOCAL_COLLAB_ORIGINS,
    LOCAL_PALETTE_ORIGIN,
    LOCAL_PIXEL_ORIGIN,
    LOCAL_STRUCTURAL_ORIGIN
} from './origins';
import { positionsForDesiredOrder } from './positions';
import type { CollabUndoController } from './undoRuntime';

type EditorStoreApi = Pick<StoreApi<EditorUiState>, 'getState' | 'setState' | 'subscribe'>;

interface ShadowFrame {
    id: string;
    name: string;
    position: string;
    base: (string | null)[];
    top: (string | null)[];
}

interface BridgeShadow {
    name: string;
    fps: number;
    presetCount: number;
    presetColors: string[];
    lastWholesaleId: string | null;
    order: string[];
    frames: Map<string, ShadowFrame>;
}

export interface CollabBridge {
    destroy: () => void;
    reconcileFromDoc: () => boolean;
    reconcileToDoc: () => boolean;
}

export interface CollabBridgeOptions {
    undo?: CollabUndoController;
}

const mapsEqual = (left: (string | null)[], right: (string | null)[]): boolean => {
    if (left.length !== right.length) return false;
    return left.every((color, index) => color === right[index]);
};

const validatedLayerToArray = (pixels: Map<number, string>): (string | null)[] => {
    const colors = Array<string | null>(1024).fill(null);
    pixels.forEach((color, index) => {
        colors[index] = color;
    });
    return colors;
};

const shadowFromValidated = (validated: ValidatedCollabDoc): BridgeShadow => ({
    name: validated.name,
    fps: validated.fps,
    presetCount: validated.presetCount,
    presetColors: [...validated.presetColors],
    lastWholesaleId: validated.lastWholesale?.id ?? null,
    order: validated.frames.map(frame => frame.id),
    frames: new Map(validated.frames.map(frame => [frame.id, {
        id: frame.id,
        name: frame.name,
        position: frame.position,
        base: validatedLayerToArray(frame.base),
        top: validatedLayerToArray(frame.top)
    }]))
});

const normalizeLocalLayer = (
    pixelData: PixelData,
    palette: string[],
    frameId: string
): (string | null)[] => pixelDataToColorArray(pixelData, palette).map((color, index) => {
    if (color === null) {
        if (pixelData[index] !== 0) {
            throw new Error(`Frame ${frameId} references an unmapped palette color`);
        }
        return null;
    }
    const normalized = normalizeCollabHex(color);
    if (!normalized) throw new Error(`Frame ${frameId} contains an invalid color`);
    return normalized;
});

const localFrameSnapshot = (
    sprite: Sprite,
    palette: string[],
    position: string
): ShadowFrame => ({
    id: sprite.id,
    name: sprite.name,
    position,
    base: normalizeLocalLayer(sprite.pixelData, palette, sprite.id),
    top: normalizeLocalLayer(sprite.overlayPixelData, palette, sprite.id)
});

const syncYLayer = (
    layer: Y.Map<unknown>,
    before: (string | null)[],
    after: (string | null)[]
): boolean => {
    let changed = false;
    after.forEach((color, index) => {
        if (color === before[index]) return;
        changed = true;
        const key = String(index);
        if (color === null) layer.delete(key);
        else layer.set(key, color);
    });
    return changed;
};

const getYLayer = (frame: Y.Map<unknown>, key: 'base' | 'top'): Y.Map<unknown> => {
    const layer = frame.get(key);
    if (!(layer instanceof Y.Map)) throw new Error(`Frame has an invalid ${key} layer`);
    return layer as Y.Map<unknown>;
};

const usedAdvisoryTail = (state: EditorUiState): string[] => {
    const usedValues = new Set<number>();
    state.sprites.forEach(sprite => {
        sprite.pixelData.forEach(value => usedValues.add(value));
        sprite.overlayPixelData.forEach(value => usedValues.add(value));
    });
    return state.palette.slice(state.presetCount).filter((color, tailIndex) => (
        usedValues.has(state.presetCount + tailIndex + 1)
        && normalizeCollabHex(color) === color
    ));
};

const preserveSpriteIdentity = (current: Sprite | undefined, incoming: Sprite): Sprite => {
    if (
        current
        && current.name === incoming.name
        && pixelDataEquals(current.pixelData, incoming.pixelData)
        && pixelDataEquals(current.overlayPixelData, incoming.overlayPixelData)
    ) {
        return current;
    }
    return incoming;
};

const pickActiveFrameAfterReconcile = (
    current: EditorUiState,
    nextSprites: Sprite[]
): string => {
    if (nextSprites.some(sprite => sprite.id === current.activeSpriteId)) {
        return current.activeSpriteId;
    }
    const deletedIndex = current.sprites.findIndex(sprite => sprite.id === current.activeSpriteId);
    for (let index = deletedIndex - 1; index >= 0; index--) {
        const previousId = current.sprites[index].id;
        if (nextSprites.some(sprite => sprite.id === previousId)) return previousId;
    }
    return nextSprites[0].id;
};

export const createCollabBridge = (
    doc: Y.Doc,
    store: EditorStoreApi,
    options: CollabBridgeOptions = {}
): CollabBridge => {
    let destroyed = false;
    let isApplyingRemote = false;
    let shadow = shadowFromValidated(validateDoc(doc));
    const handles = getCollabDocHandles(doc);

    const reportError = (message: string): void => {
        isApplyingRemote = true;
        try {
            store.getState().notify(message, 'error');
        } finally {
            isApplyingRemote = false;
        }
    };

    const reconcileFromDoc = (): boolean => {
        if (destroyed) return false;
        try {
            const current = store.getState();
            const validated = validateDoc(doc);
            const paletteChanged = validated.presetCount !== shadow.presetCount
                || validated.presetColors.some((color, index) => color !== shadow.presetColors[index]);
            const wholesaleChanged = (validated.lastWholesale?.id ?? null) !== shadow.lastWholesaleId;
            const semanticPixelsChanged = validated.frames.length !== shadow.frames.size
                || validated.frames.some(frame => {
                    const previous = shadow.frames.get(frame.id);
                    return !previous
                        || !mapsEqual(previous.base, validatedLayerToArray(frame.base))
                        || !mapsEqual(previous.top, validatedLayerToArray(frame.top));
                });
            if (
                paletteChanged
                || wholesaleChanged
            ) {
                options.undo?.clearAll();
            }
            const project = collabDocToProject(validated, usedAdvisoryTail(current));
            const currentById = new Map(current.sprites.map(sprite => [sprite.id, sprite]));
            const sprites = project.sprites.map(sprite => (
                preserveSpriteIdentity(currentById.get(sprite.id), sprite)
            ));
            const activeSpriteId = pickActiveFrameAfterReconcile(current, sprites);
            shadow = shadowFromValidated(validated);
            options.undo?.retainFrames(project.sprites.map(sprite => sprite.id));

            isApplyingRemote = true;
            store.setState({
                activeSpriteId,
                fps: project.fps,
                palette: project.palette,
                presetCount: project.presetCount,
                projectName: project.projectName,
                sprites
            });
            if (sprites.length > 64) {
                store.getState().notify(
                    `Collaboration merged ${sprites.length} frames — delete frames before adding more`,
                    'info'
                );
            }
            if (paletteChanged && !semanticPixelsChanged && !wholesaleChanged) {
                store.getState().notify('Collaborator switched the palette — art unchanged', 'info');
            }
            return true;
        } catch (error) {
            reportError(error instanceof Error
                ? `Collaboration update rejected: ${error.message}`
                : 'Collaboration update rejected');
            return false;
        } finally {
            isApplyingRemote = false;
        }
    };

    const reconcileToDoc = (): boolean => {
        if (destroyed || isApplyingRemote) return false;
        const state = store.getState();
        try {
            if (state.sprites.length < 1 || state.sprites.length > MAX_COLLAB_FRAMES) {
                throw new Error(`Collaboration supports 1–${MAX_COLLAB_FRAMES} frames`);
            }
            const desiredOrder = state.sprites.map(sprite => sprite.id);
            if (new Set(desiredOrder).size !== desiredOrder.length) {
                throw new Error('Frame ids must be unique');
            }

            const assignedPositions = positionsForDesiredOrder(
                [...shadow.frames.values()].map(frame => ({
                    id: frame.id,
                    position: frame.position
                })),
                desiredOrder
            );
            const positions = new Map<string, string>();
            desiredOrder.forEach(id => {
                const position = assignedPositions.get(id) ?? shadow.frames.get(id)?.position;
                if (!position) throw new Error(`Could not position frame ${id}`);
                positions.set(id, position);
            });

            const localFrames = new Map(state.sprites.map(sprite => [
                sprite.id,
                localFrameSnapshot(sprite, state.palette, positions.get(sprite.id)!)
            ]));
            const presetColors = Array.from({ length: state.presetCount }, (_, index) => {
                const color = normalizeCollabHex(state.palette[index]);
                if (!color) throw new Error(`Preset slot ${index} has an invalid color`);
                return color;
            });

            const structuralChanged = desiredOrder.some((id, index) => shadow.order[index] !== id)
                || desiredOrder.length !== shadow.order.length
                || state.projectName !== shadow.name
                || state.fps !== shadow.fps;
            const paletteChanged = state.presetCount !== shadow.presetCount
                || presetColors.some((color, index) => color !== shadow.presetColors[index]);
            let pixelChanged = false;
            const pixelChangedIds = new Set<string>();
            localFrames.forEach((frame, id) => {
                const previous = shadow.frames.get(id);
                if (previous && (
                    !mapsEqual(previous.base, frame.base)
                    || !mapsEqual(previous.top, frame.top)
                )) {
                    pixelChanged = true;
                    pixelChangedIds.add(id);
                }
            });
            const namesChanged = [...localFrames].some(([id, frame]) => (
                shadow.frames.get(id)?.name !== frame.name
            ));
            const wholesaleMarker = getCollabWholesaleMarker();
            if (!structuralChanged && !paletteChanged && !pixelChanged && !namesChanged && !wholesaleMarker) {
                return false;
            }

            const explicitOrigin = getCollabActionOrigin();
            const origin = explicitOrigin ?? (
                paletteChanged
                    ? LOCAL_PALETTE_ORIGIN
                    : pixelChanged
                        ? LOCAL_PIXEL_ORIGIN
                        : LOCAL_STRUCTURAL_ORIGIN
            );

            const trackPixelUndo = origin === LOCAL_PIXEL_ORIGIN && pixelChangedIds.size > 0;
            if (trackPixelUndo) options.undo?.preparePixelTransaction(pixelChangedIds);
            try {
                doc.transact(() => {
                    if (wholesaleMarker) handles.meta.set('lastWholesale', wholesaleMarker);
                    shadow.order.forEach(id => {
                        if (!localFrames.has(id)) handles.frames.delete(id);
                    });

                    state.sprites.forEach(sprite => {
                        const localFrame = localFrames.get(sprite.id)!;
                        const previous = shadow.frames.get(sprite.id);
                        const yFrame = handles.frames.get(sprite.id);
                        if (!previous || !(yFrame instanceof Y.Map)) {
                            handles.frames.set(
                                sprite.id,
                                spriteToYFrame(sprite, state.palette, localFrame.position)
                            );
                            return;
                        }
                        if (previous.name !== localFrame.name) yFrame.set('name', localFrame.name);
                        if (previous.position !== localFrame.position) {
                            yFrame.set('position', localFrame.position);
                        }
                        syncYLayer(getYLayer(yFrame, 'base'), previous.base, localFrame.base);
                        syncYLayer(getYLayer(yFrame, 'top'), previous.top, localFrame.top);
                    });

                    if (state.projectName !== shadow.name) handles.meta.set('name', state.projectName);
                    if (state.fps !== shadow.fps) handles.meta.set('fps', state.fps);
                    if (state.presetCount !== shadow.presetCount) {
                        handles.meta.set('presetCount', state.presetCount);
                    }
                    [...handles.palette.keys()].forEach(key => {
                        const index = Number(key);
                        if (!Number.isInteger(index) || index < 0 || index >= presetColors.length) {
                            handles.palette.delete(key);
                        }
                    });
                    presetColors.forEach((color, index) => {
                        if (shadow.presetColors[index] !== color) {
                            handles.palette.set(String(index), color);
                        }
                    });
                }, origin);
            } finally {
                if (trackPixelUndo) options.undo?.finishPixelTransaction(pixelChangedIds);
            }
            if (paletteChanged || wholesaleMarker) options.undo?.clearAll();

            shadow = shadowFromValidated(validateDoc(doc));
            options.undo?.retainFrames(desiredOrder);
            return true;
        } catch (error) {
            reportError(error instanceof Error
                ? `Local collaboration edit rejected: ${error.message}`
                : 'Local collaboration edit rejected');
            return false;
        }
    };

    const unsubscribe = store.subscribe((state, previous) => {
        if (
            destroyed
            || isApplyingRemote
            || (
                state.sprites === previous.sprites
                && state.palette === previous.palette
                && state.projectName === previous.projectName
                && state.fps === previous.fps
                && state.presetCount === previous.presetCount
            )
        ) {
            return;
        }
        reconcileToDoc();
    });

    const afterTransaction = (transaction: Y.Transaction): void => {
        if (destroyed || LOCAL_COLLAB_ORIGINS.has(transaction.origin)) return;
        // Publish queued rAF pixels as a later local transaction before the
        // remote snapshot is installed, so they cannot resurrect stale bytes.
        store.getState().flushPendingPixelUpdates();
        if (handles.frames.size === 0 && repairEmptyFrames(doc)) return;
        reconcileFromDoc();
    };
    doc.on('afterTransaction', afterTransaction);

    return {
        destroy: () => {
            if (destroyed) return;
            destroyed = true;
            unsubscribe();
            doc.off('afterTransaction', afterTransaction);
        },
        reconcileFromDoc,
        reconcileToDoc
    };
};
