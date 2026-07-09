import { TOTAL_PIXELS } from '../../types';
import type { FloatingLayerUpdate } from '../../types';
import { clonePixelData } from '../../utils/pixelData';
import type { EditorUiState, SpriteLayerKey } from './types';

interface PendingLayerPixelBatch {
    spriteId: number;
    layerKey: SpriteLayerKey;
    updates: Map<number, number>;
}

const pendingLayerPixelBatches = new Map<string, PendingLayerPixelBatch>();
const pendingFloatingPixelUpdates = new Map<number, FloatingLayerUpdate>();
let pendingPixelFlushRaf: number | null = null;

export const cancelQueuedPixelFlush = () => {
    if (pendingPixelFlushRaf !== null) {
        if (typeof cancelAnimationFrame === 'function') {
            cancelAnimationFrame(pendingPixelFlushRaf);
        }
        pendingPixelFlushRaf = null;
    }
};

export const getPendingPixelUpdatesState = (
    state: EditorUiState
): Partial<Pick<EditorUiState, 'floatingLayer' | 'sprites'>> => {
    if (pendingLayerPixelBatches.size === 0 && pendingFloatingPixelUpdates.size === 0) {
        return {};
    }

    const layerBatches = Array.from(pendingLayerPixelBatches.values()).map(batch => ({
        spriteId: batch.spriteId,
        layerKey: batch.layerKey,
        updates: new Map(batch.updates)
    }));
    const floatingUpdates = new Map(pendingFloatingPixelUpdates);

    pendingLayerPixelBatches.clear();
    pendingFloatingPixelUpdates.clear();

    const updates: Partial<Pick<EditorUiState, 'floatingLayer' | 'sprites'>> = {};

    if (floatingUpdates.size > 0) {
        const nextFloatingLayer = new Map(state.floatingLayer);
        let changed = false;

        floatingUpdates.forEach((color, index) => {
            if (color === undefined) {
                if (nextFloatingLayer.delete(index)) changed = true;
                return;
            }

            if (nextFloatingLayer.get(index) !== color) {
                nextFloatingLayer.set(index, color);
                changed = true;
            }
        });

        if (changed) {
            updates.floatingLayer = nextFloatingLayer;
        }
    }

    if (layerBatches.length > 0) {
        const batchesBySprite = new Map<number, PendingLayerPixelBatch[]>();
        layerBatches.forEach(batch => {
            const batches = batchesBySprite.get(batch.spriteId) ?? [];
            batches.push(batch);
            batchesBySprite.set(batch.spriteId, batches);
        });

        let changedAny = false;
        const nextSprites = state.sprites.map(sprite => {
            const spriteBatches = batchesBySprite.get(sprite.id);
            if (!spriteBatches) return sprite;

            let nextSprite = sprite;
            spriteBatches.forEach(batch => {
                const nextLayerData = clonePixelData(nextSprite[batch.layerKey]);
                let changed = false;

                batch.updates.forEach((value, index) => {
                    if (index < 0 || index >= TOTAL_PIXELS) return;
                    if (nextLayerData[index] !== value) {
                        nextLayerData[index] = value;
                        changed = true;
                    }
                });

                if (changed) {
                    nextSprite = { ...nextSprite, [batch.layerKey]: nextLayerData };
                    changedAny = true;
                }
            });

            return nextSprite;
        });

        if (changedAny) {
            updates.sprites = nextSprites;
        }
    }

    return updates;
};

export const discardQueuedPixelUpdates = () => {
    cancelQueuedPixelFlush();
    pendingLayerPixelBatches.clear();
    pendingFloatingPixelUpdates.clear();
};

export const queuePixelUpdates = (
    spriteId: number,
    layerKey: SpriteLayerKey,
    layerUpdates: Map<number, number>,
    floatingUpdates: Map<number, FloatingLayerUpdate> | undefined,
    flushPendingPixelUpdates: () => void
) => {
    if (layerUpdates.size > 0) {
        const batchKey = `${spriteId}:${layerKey}`;
        let batch = pendingLayerPixelBatches.get(batchKey);
        if (!batch) {
            batch = { spriteId, layerKey, updates: new Map() };
            pendingLayerPixelBatches.set(batchKey, batch);
        }
        layerUpdates.forEach((color, index) => {
            batch.updates.set(index, color);
        });
    }

    if (floatingUpdates && floatingUpdates.size > 0) {
        floatingUpdates.forEach((color, index) => {
            pendingFloatingPixelUpdates.set(index, color);
        });
    }

    if (
        pendingPixelFlushRaf === null &&
        (pendingLayerPixelBatches.size > 0 || pendingFloatingPixelUpdates.size > 0)
    ) {
        if (typeof requestAnimationFrame === 'function') {
            pendingPixelFlushRaf = requestAnimationFrame(() => {
                pendingPixelFlushRaf = null;
                flushPendingPixelUpdates();
            });
        } else {
            flushPendingPixelUpdates();
        }
    }
};
