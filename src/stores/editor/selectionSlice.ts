import { GRID_SIZE } from '../../types';
import type { FloatingLayerPixel } from '../../types';
import {
    flipHorizontalIndex,
    flipVerticalIndex,
    rotateLeftIndex,
    rotateRightIndex,
    transformSelection
} from '../../utils/geometry';
import type { SelectionIndexMapper } from '../../utils/geometry';
import {
    clonePixelData,
    ensurePaletteColor,
    getPixelColor,
    TRANSPARENT_PIXEL
} from '../../utils/pixelData';
import { STAMP_ANIMATION_MS } from './constants';
import { getLayerKey, pushHistoryForSprite } from './history';
import { markFrameDirty } from './sessionState';
import type { EditorStoreGet, EditorStoreSet, EditorUiState } from './types';

export type SelectionSlice = Pick<
    EditorUiState,
    | 'addSelectionBatch'
    | 'addToSelection'
    | 'clearSelection'
    | 'fill'
    | 'flipSelectionHorizontal'
    | 'flipSelectionVertical'
    | 'liftSelection'
    | 'nudgeSelection'
    | 'rotateSelectionLeft'
    | 'rotateSelectionRight'
    | 'stamp'
>;

const getSelectionTransformUpdate = (
    selectedPixels: Set<number>,
    floatingLayer: Map<number, FloatingLayerPixel>,
    mapIndex: SelectionIndexMapper
): Partial<Pick<EditorUiState, 'selectedPixels' | 'floatingLayer'>> => {
    if (floatingLayer.size === 0 && selectedPixels.size === 0) return {};

    const transformed = transformSelection(selectedPixels, floatingLayer, mapIndex);
    if (!transformed.didTransform) return {};

    return {
        selectedPixels: transformed.selectedPixels,
        floatingLayer: transformed.floatingLayer
    };
};

export const createSelectionSlice = (
    set: EditorStoreSet,
    get: EditorStoreGet
): SelectionSlice => ({
    addSelectionBatch: (indices) => {
        set((state) => {
            const newSet = new Set(state.selectedPixels);
            let changed = false;
            indices.forEach(idx => {
                if (!newSet.has(idx)) {
                    newSet.add(idx);
                    changed = true;
                }
            });
            return changed ? { selectedPixels: newSet } : {};
        });
    },
    addToSelection: (index) => {
        set((state) => {
            const newSet = new Set(state.selectedPixels);
            newSet.add(index);
            return { selectedPixels: newSet };
        });
    },
    clearSelection: () => {
        get().flushPendingPixelUpdates();
        set((state) => {
            const layerKey = getLayerKey(state.activeLayer);
            const updates: Partial<EditorUiState> = {
                selectedPixels: new Set()
            };
            let nextPalette = state.palette;

            // Commits current floating layer and clears selection
            if (state.floatingLayer.size > 0) {
                updates.sprites = state.sprites.map(sprite => {
                    if (sprite.id !== state.activeSpriteId) return sprite;

                    const newPixelData = clonePixelData(sprite[layerKey]);
                    state.floatingLayer.forEach((color, idx) => {
                        if (color === null) {
                            newPixelData[idx] = TRANSPARENT_PIXEL;
                            return;
                        }
                        const encoded = ensurePaletteColor(nextPalette, color);
                        nextPalette = encoded.palette;
                        newPixelData[idx] = encoded.value;
                    });

                    return pushHistoryForSprite({ ...sprite, [layerKey]: newPixelData });
                });
                updates.floatingLayer = new Map();
                if (nextPalette !== state.palette) {
                    updates.palette = nextPalette;
                }
            }

            return updates;
        });
    },
    fill: (startIndex) => {
        get().flushPendingPixelUpdates();
        const {
            activeLayer,
            activeSpriteId,
            currentColor,
            floatingLayer,
            palette,
            selectedPixels,
            sprites
        } = get();
        const layerKey = getLayerKey(activeLayer);
        const activeSprite = sprites.find(sprite => sprite.id === activeSpriteId);

        // Floating Layer Fill
        if (selectedPixels.has(startIndex)) {
            // Calculate starting target color (Composite: Float > Base)
            const baseStartColor = activeSprite ? getPixelColor(activeSprite[layerKey], startIndex, palette) : null;
            const targetColor = floatingLayer.has(startIndex) ? floatingLayer.get(startIndex) ?? null : baseStartColor;
            const replacementColor = currentColor;

            if (targetColor === replacementColor) return;

            // Determine the pixels first so the floating stamp update stays atomic.

            const pixelsToChange: number[] = [];
            const queue = [startIndex];
            const visited = new Set<number>();

            // 1. Find all connected pixels matching targetColor
            while (queue.length > 0) {
                const currentIndex = queue.shift()!;
                if (visited.has(currentIndex)) continue;
                visited.add(currentIndex);

                if (!selectedPixels.has(currentIndex)) continue;

                const baseAtIdx = activeSprite ? getPixelColor(activeSprite[layerKey], currentIndex, palette) : null;
                const currentComposite = floatingLayer.has(currentIndex) ? floatingLayer.get(currentIndex) ?? null : baseAtIdx;

                if (currentComposite === targetColor) {
                    pixelsToChange.push(currentIndex);

                    const x = currentIndex % GRID_SIZE;
                    const y = Math.floor(currentIndex / GRID_SIZE);
                    if (y > 0) queue.push(currentIndex - GRID_SIZE);
                    if (y < GRID_SIZE - 1) queue.push(currentIndex + GRID_SIZE);
                    if (x > 0) queue.push(currentIndex - 1);
                    if (x < GRID_SIZE - 1) queue.push(currentIndex + 1);
                }
            }

            const updates: Partial<EditorUiState> = {
                // Legacy behavior: switch back to brush after fill
                currentTool: 'brush'
            };

            // 2. Apply changes
            if (pixelsToChange.length > 0) {
                // Update Floating Layer
                const newLayer = new Map(floatingLayer);
                pixelsToChange.forEach(idx => {
                    if (replacementColor) {
                        newLayer.set(idx, replacementColor);
                    } else {
                        newLayer.set(idx, null);
                    }
                });
                updates.floatingLayer = newLayer;
            }

            set(updates);
            return;
        }

        // Standard Sprite Fill
        set((state) => {
            let changedAny = false;
            let nextPalette = state.palette;
            const encodedReplacement = ensurePaletteColor(nextPalette, state.currentColor);
            nextPalette = encodedReplacement.palette;
            const replacementValue = encodedReplacement.value;

            const nextSprites = state.sprites.map(sprite => {
                if (sprite.id !== state.activeSpriteId) return sprite;

                const targetValue = sprite[layerKey][startIndex] ?? TRANSPARENT_PIXEL;

                if (targetValue === replacementValue) return sprite;

                const newPixelData = clonePixelData(sprite[layerKey]);
                const queue = [startIndex];
                const visited = new Set<number>();

                while (queue.length > 0) {
                    const currentIndex = queue.shift()!;
                    if (visited.has(currentIndex)) continue;
                    visited.add(currentIndex);

                    // Masking Check for Fill: Don't fill INTO the selection if we are outside
                    if (state.selectedPixels.size > 0 && state.selectedPixels.has(currentIndex)) {
                        continue;
                    }

                    const x = currentIndex % GRID_SIZE;
                    const y = Math.floor(currentIndex / GRID_SIZE);

                    if (newPixelData[currentIndex] === targetValue) {
                        newPixelData[currentIndex] = replacementValue;
                        changedAny = true;

                        // Check neighbors
                        if (y > 0) queue.push(currentIndex - GRID_SIZE); // Up
                        if (y < GRID_SIZE - 1) queue.push(currentIndex + GRID_SIZE); // Down
                        if (x > 0) queue.push(currentIndex - 1); // Left
                        if (x < GRID_SIZE - 1) queue.push(currentIndex + 1); // Right
                    }
                }

                return { ...sprite, [layerKey]: newPixelData };
            });

            // Save history explicitly after fill
            const updates: Partial<EditorUiState> = {
                sprites: changedAny
                    ? nextSprites.map(sprite => (
                        sprite.id === state.activeSpriteId ? pushHistoryForSprite(sprite) : sprite
                    ))
                    : state.sprites,
                // Legacy behavior: switch back to brush after fill
                currentTool: 'brush'
            };
            if (nextPalette !== state.palette) {
                updates.palette = nextPalette;
            }
            return updates;
        });
    },
    flipSelectionHorizontal: () => {
        get().flushPendingPixelUpdates();
        set((state) => getSelectionTransformUpdate(
            state.selectedPixels,
            state.floatingLayer,
            flipHorizontalIndex
        ));
    },
    flipSelectionVertical: () => {
        get().flushPendingPixelUpdates();
        set((state) => getSelectionTransformUpdate(
            state.selectedPixels,
            state.floatingLayer,
            flipVerticalIndex
        ));
    },
    liftSelection: (pixelsOverride) => {
        get().flushPendingPixelUpdates();

        set((state) => {
            const layerKey = getLayerKey(state.activeLayer);
            const pixelsToLift = pixelsOverride || state.selectedPixels;
            const newFloatingLayer = new Map<number, FloatingLayerPixel>();

            const nextSprites = state.sprites.map(sprite => {
                if (sprite.id !== state.activeSpriteId) return sprite;

                const newPixelData = clonePixelData(sprite[layerKey]);
                pixelsToLift.forEach(idx => {
                    const color = getPixelColor(sprite[layerKey], idx, state.palette);
                    if (color) {
                        newFloatingLayer.set(idx, color);
                        newPixelData[idx] = TRANSPARENT_PIXEL; // Clear from canvas
                    }
                });

                return pushHistoryForSprite({ ...sprite, [layerKey]: newPixelData });
            });

            return {
                sprites: nextSprites,
                floatingLayer: newFloatingLayer
            };
        });
    },
    nudgeSelection: (dx, dy) => {
        get().flushPendingPixelUpdates();
        set((state) => {
            // Boundary checks use fresh store state so repeated key ticks cannot
            // move a selection based on stale closure values.
            if (state.selectedPixels.size === 0) return {};

            // 1. Boundary Check based on FRESH state
            for (const idx of state.selectedPixels) {
                const x = idx % GRID_SIZE;
                const y = Math.floor(idx / GRID_SIZE);
                const newX = x + dx;
                const newY = y + dy;
                if (newX < 0 || newX >= GRID_SIZE || newY < 0 || newY >= GRID_SIZE) {
                    return {};
                }
            }

            // 2. Move Selection Mask
            const newSelection = new Set<number>();
            for (const idx of state.selectedPixels) {
                const x = idx % GRID_SIZE;
                const y = Math.floor(idx / GRID_SIZE);
                const newIdx = (y + dy) * GRID_SIZE + (x + dx);
                newSelection.add(newIdx);
            }

            if (state.floatingLayer.size === 0) {
                return { selectedPixels: newSelection };
            }

            const newLayer = new Map<number, FloatingLayerPixel>();
            for (const [idx, color] of state.floatingLayer.entries()) {
                const x = idx % GRID_SIZE;
                const y = Math.floor(idx / GRID_SIZE);
                const newIdx = (y + dy) * GRID_SIZE + (x + dx);
                newLayer.set(newIdx, color);
            }

            return {
                selectedPixels: newSelection,
                floatingLayer: newLayer
            };
        });
    },
    rotateSelectionLeft: () => {
        get().flushPendingPixelUpdates();
        set((state) => getSelectionTransformUpdate(
            state.selectedPixels,
            state.floatingLayer,
            rotateLeftIndex
        ));
    },
    rotateSelectionRight: () => {
        get().flushPendingPixelUpdates();
        set((state) => getSelectionTransformUpdate(
            state.selectedPixels,
            state.floatingLayer,
            rotateRightIndex
        ));
    },
    stamp: (commit = true, animate = true) => {
        get().flushPendingPixelUpdates();
        const {
            activeLayer,
            activeSpriteId,
            floatingLayer
        } = get();

        if (floatingLayer.size === 0) return;

        // Trigger stamp feedback for explicit stamps. Continuous smudge-style
        // stamping opts out so the floating selection stays visually steady.
        if (animate) {
            set({ isStamping: true });
            window.setTimeout(() => set({ isStamping: false }), STAMP_ANIMATION_MS);
        }

        const layerKey = getLayerKey(activeLayer);
        const currentFloatingLayer = new Map(floatingLayer);
        if (!commit) {
            markFrameDirty(activeSpriteId);
        }

        // Stamp to background (commit COPY)
        set((state) => {
            let nextPalette = state.palette;
            const nextSprites = state.sprites.map(sprite => {
                if (sprite.id !== activeSpriteId) return sprite;

                const newPixelData = clonePixelData(sprite[layerKey]);
                currentFloatingLayer.forEach((color, idx) => {
                    if (color === null) {
                        newPixelData[idx] = TRANSPARENT_PIXEL;
                        return;
                    }
                    const encoded = ensurePaletteColor(nextPalette, color);
                    nextPalette = encoded.palette;
                    newPixelData[idx] = encoded.value;
                });

                const stampedSprite = { ...sprite, [layerKey]: newPixelData };
                return commit ? pushHistoryForSprite(stampedSprite) : stampedSprite;
            });

            const updates: Partial<EditorUiState> = { sprites: nextSprites };
            if (nextPalette !== state.palette) {
                updates.palette = nextPalette;
            }
            return updates;
        });
        // DO NOT Clear floating layer (Stay floating)
    }
});
