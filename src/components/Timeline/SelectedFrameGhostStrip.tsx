import React from 'react';
import { TimelineFrame } from './TimelineFrame';
import { getSelectedSpritesInTimelineOrder } from './timelineSelection';
import type { Palette, PixelData, Sprite } from '../../types';

interface SelectedFrameGhostStripProps {
    getPreviewPixels: (sprite: Sprite) => PixelData;
    onDuplicate: () => void;
    palette: Palette;
    selectedSpriteIds: Set<string>;
    sprites: Sprite[];
}

export const SelectedFrameGhostStrip: React.FC<SelectedFrameGhostStripProps> = ({
    getPreviewPixels,
    onDuplicate,
    palette,
    selectedSpriteIds,
    sprites
}) => {
    const selectedSprites = getSelectedSpritesInTimelineOrder(sprites, selectedSpriteIds);

    return (
        <div className="timeline-ghost-strip">
            {/* Render ghosts of selected sprites */}
            {selectedSprites.map((sprite, index) => (
                <TimelineFrame
                    key={`ghost-${sprite.id}`}
                    sprite={sprite}
                    palette={palette}
                    previewPixels={getPreviewPixels(sprite)}
                    isAdd={index === 0} // Only first one has +
                    index={sprites.length + index} // Virtual index
                    isActive={false}
                    isGhost={true}
                    onMouseDown={index === 0 ? onDuplicate : () => { }} // Only first one clicks
                />
            ))}
        </div>
    );
};
