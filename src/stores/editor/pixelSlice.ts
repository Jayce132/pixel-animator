import { GRID_SIZE } from '../../types';
import type { FloatingLayerUpdate } from '../../types';
import { clonePixelData, ensurePaletteColor } from '../../utils/pixelData';
import type { EditorStoreGet, EditorStoreSet, EditorUiState } from './types';
import {
    cancelQueuedPixelFlush,
    discardQueuedPixelUpdates,
    getPendingPixelUpdatesState,
    queuePixelUpdates
} from './pixelBatching';
import { getLayerKey } from './history';
import { getActiveCollabUndoController } from '../../collab/undoRuntime';

export type PixelSlice = Pick<
    EditorUiState,
    | 'cancelStroke'
    | 'discardPendingPixelUpdates'
    | 'flushPendingPixelUpdates'
    | 'updatePixel'
>;

export const createPixelSlice = (
    set: EditorStoreSet,
    get: EditorStoreGet
): PixelSlice => ({
    cancelStroke: () => {
        get().discardPendingPixelUpdates();
        const { activeSpriteId } = get();
        const collabUndo = getActiveCollabUndoController();
        if (collabUndo) {
            collabUndo.cancelAction(activeSpriteId);
            return;
        }

        set((state) => ({
            sprites: state.sprites.map(sprite => {
                if (sprite.id !== activeSpriteId) return sprite;

                const lastHistory = sprite.history[sprite.history.length - 1];
                const lastOverlayHistory = sprite.overlayHistory[sprite.overlayHistory.length - 1];
                if (!lastHistory || !lastOverlayHistory) return sprite;

                // Revert pixels to last history state
                return {
                    ...sprite,
                    pixelData: clonePixelData(lastHistory),
                    overlayPixelData: clonePixelData(lastOverlayHistory)
                };
            })
        }));
    },
    discardPendingPixelUpdates: () => {
        discardQueuedPixelUpdates();
    },
    flushPendingPixelUpdates: () => {
        cancelQueuedPixelFlush();
        set((state) => getPendingPixelUpdatesState(state));
    },
    updatePixel: (pixelIndex, maskConstraint = null) => {
        const {
            activeLayer,
            activeSpriteId,
            brushSize,
            currentColor,
            currentTool,
            palette,
            selectedPixels
        } = get();
        const layerKey = getLayerKey(activeLayer);
        const targetColor = (currentTool === 'eraser' || currentColor === null) ? null : currentColor;
        const encodedTarget = ensurePaletteColor(palette, targetColor);
        if (encodedTarget.palette !== palette) {
            set({ palette: encodedTarget.palette });
        }
        const targetValue = encodedTarget.value;

        // Calculate pixels based on brush size
        const pixelsToUpdate: number[] = [];
        const x = pixelIndex % GRID_SIZE;
        const y = Math.floor(pixelIndex / GRID_SIZE);

        pixelsToUpdate.push(pixelIndex);

        if (brushSize === 2) {
            // 2x2 brush: Pixel + Right + Bottom + BottomRight
            if (x + 1 < GRID_SIZE) pixelsToUpdate.push(pixelIndex + 1);
            if (y + 1 < GRID_SIZE) pixelsToUpdate.push(pixelIndex + GRID_SIZE);
            if (x + 1 < GRID_SIZE && y + 1 < GRID_SIZE) pixelsToUpdate.push(pixelIndex + GRID_SIZE + 1);
        }

        // Apply strict filtering based on maskConstraint (Smart Masking)
        // This MUST happen before we check hitsSelection, to ensure we don't accidentally "hit" the selection
        // with a pixel that should have been masked out.
        const filteredPixels = pixelsToUpdate.filter(idx => {
            if (maskConstraint === 'inside') {
                return selectedPixels.has(idx);
            }
            if (maskConstraint === 'outside') {
                return !selectedPixels.has(idx);
            }
            return true;
        });

        if (filteredPixels.length === 0) return;

        // If ANY of the target pixels are in selection, we treat this as a potentially mixed operation
        const hitsSelection = filteredPixels.some(idx => selectedPixels.has(idx));
        const layerUpdates = new Map<number, number>();
        const floatingUpdates = new Map<number, FloatingLayerUpdate>();

        if (hitsSelection) {
            // Selection edits target the floating stamp. Transparent paint is
            // stored as an explicit eraser pixel, not as a missing floating cell.
            filteredPixels.forEach(idx => {
                if (!selectedPixels.has(idx)) return;
                floatingUpdates.set(idx, targetColor);
            });
            queuePixelUpdates(activeSpriteId, layerKey, layerUpdates, floatingUpdates, get().flushPendingPixelUpdates);
            return;
        }

        filteredPixels.forEach(idx => {
            layerUpdates.set(idx, targetValue);
        });
        queuePixelUpdates(activeSpriteId, layerKey, layerUpdates, undefined, get().flushPendingPixelUpdates);
    }
});
