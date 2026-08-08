import React from 'react';
import { TimelineFrame } from './TimelineFrame';
import { getSelectedSpritesInTimelineOrder } from './timelineSelection';
import type { Palette, PixelData, Sprite } from '../../types';

interface TimelineDragOverlayContentProps {
    activeDragId: string | null;
    getPreviewPixels: (sprite: Sprite) => PixelData;
    isSelectionMode: boolean;
    palette: Palette;
    selectedSpriteIds: Set<string>;
    sprites: Sprite[];
}

const noop = () => { };

export const TimelineDragOverlayContent: React.FC<TimelineDragOverlayContentProps> = ({
    activeDragId,
    getPreviewPixels,
    isSelectionMode,
    palette,
    selectedSpriteIds,
    sprites
}) => {
    if (activeDragId === null) return null;

    // Check if dragging part of selection
    if (isSelectionMode && selectedSpriteIds.has(activeDragId)) {
        const selectedSprites = getSelectedSpritesInTimelineOrder(sprites, selectedSpriteIds);

        return (
            <div className="timeline-drag-overlay-strip">
                {selectedSprites.map((sprite, index) => (
                    <TimelineFrame
                        key={`overlay-${sprite.id}`}
                        sprite={sprite}
                        palette={palette}
                        previewPixels={getPreviewPixels(sprite)}
                        index={index}
                        isActive={false}
                        isSelected={true}
                        onMouseDown={noop}
                        onClick={noop}
                        onPointerDown={noop}
                        onPointerUp={noop}
                        onPointerEnter={noop}
                    />
                ))}
            </div>
        );
    }

    // Single item drag
    const sprite = sprites.find(candidate => candidate.id === activeDragId);
    if (!sprite) return null;

    return (
        <TimelineFrame
            sprite={sprite}
            palette={palette}
            previewPixels={getPreviewPixels(sprite)}
            index={0} // Index doesn't matter for overlay
            isActive={true}
            onMouseDown={noop}
            onClick={noop}
            onPointerDown={noop}
            onPointerUp={noop}
            onPointerEnter={noop}
        />
    );
};
