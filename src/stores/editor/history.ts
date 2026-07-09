import type { Layer, Sprite } from '../../types';
import type { SpriteLayerKey } from './types';
import { MAX_HISTORY_ENTRIES } from './constants';
import { clonePixelData, createBlankPixelData, pixelDataEquals } from '../../utils/pixelData';

export const createEmptySprite = (): Sprite => ({
    id: 0,
    name: 'Sprite 0',
    pixelData: createBlankPixelData(),
    overlayPixelData: createBlankPixelData(),
    history: [createBlankPixelData()],
    redoHistory: [],
    overlayHistory: [createBlankPixelData()],
    overlayRedoHistory: []
});

export const getLayerKey = (layer: Layer): SpriteLayerKey => (
    layer === 'base' ? 'pixelData' : 'overlayPixelData'
);

export const pushHistoryForSprite = (sprite: Sprite): Sprite => {
    const lastBaseHistory = sprite.history[sprite.history.length - 1];
    const lastOverlayHistory = sprite.overlayHistory[sprite.overlayHistory.length - 1];
    if (
        pixelDataEquals(lastBaseHistory, sprite.pixelData) &&
        pixelDataEquals(lastOverlayHistory, sprite.overlayPixelData)
    ) {
        return sprite;
    }

    const newHistory = [...sprite.history];
    const newOverlayHistory = [...sprite.overlayHistory];
    if (newHistory.length >= MAX_HISTORY_ENTRIES) newHistory.shift();
    if (newOverlayHistory.length >= MAX_HISTORY_ENTRIES) newOverlayHistory.shift();
    newHistory.push(clonePixelData(sprite.pixelData)); // Save COPY of pixelData
    newOverlayHistory.push(clonePixelData(sprite.overlayPixelData));

    return {
        ...sprite,
        history: newHistory,
        overlayHistory: newOverlayHistory,
        redoHistory: [], // Clear redo on new action
        overlayRedoHistory: []
    };
};

export const reorderSpriteSelection = (
    sprites: Sprite[],
    indices: number[],
    insertAtIndex: number,
    activeIndex: number = indices[0] ?? insertAtIndex
): Sprite[] => {
    const selectedIndices = [...new Set(indices)]
        .filter(index => index >= 0 && index < sprites.length)
        .sort((a, b) => a - b);

    if (selectedIndices.length === 0) return sprites;

    const selectedIndexSet = new Set(selectedIndices);
    if (selectedIndexSet.has(insertAtIndex)) return sprites;

    const pickedSprites = selectedIndices.map(index => sprites[index]);
    const remainingSprites = sprites.filter((_, index) => !selectedIndexSet.has(index));
    const removedBeforeTarget = selectedIndices.filter(index => index < insertAtIndex).length;
    let adjustedInsertIndex = insertAtIndex - removedBeforeTarget;

    // Match dnd-kit's arrayMove semantics: moving downward inserts after the
    // original target item because the target shifts left when picked items leave.
    if (activeIndex < insertAtIndex) {
        adjustedInsertIndex++;
    }

    adjustedInsertIndex = Math.max(0, Math.min(adjustedInsertIndex, remainingSprites.length));
    const nextSprites = [...remainingSprites];
    nextSprites.splice(adjustedInsertIndex, 0, ...pickedSprites);

    return nextSprites;
};
