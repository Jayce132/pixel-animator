import type { Sprite } from '../../types';

export const getSelectedSpritesInTimelineOrder = (
    sprites: Sprite[],
    selectedSpriteIds: Set<number>
) => (
    // The sprites array is the timeline order, so filtering preserves selected-frame order.
    sprites.filter(sprite => selectedSpriteIds.has(sprite.id))
);
