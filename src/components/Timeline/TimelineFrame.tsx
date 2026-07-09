import React from 'react';
import { GRID_SIZE } from '../../types';
import type { Palette, PixelData, Sprite } from '../../types';
import { getCompositePixelData } from '../../utils/compositing';
import { getPixelColor } from '../../utils/pixelData';

interface TimelineFrameProps {
    sprite: Sprite;
    palette: Palette;
    previewPixels?: PixelData;
    isActive: boolean;
    onMouseDown: (e: React.MouseEvent, index: number, sprite: Sprite) => void;
    onClick?: (e: React.MouseEvent, index: number, sprite: Sprite) => void;
    onPointerDown?: (e: React.PointerEvent, index: number, sprite: Sprite) => void;
    onPointerUp?: (e: React.PointerEvent, index: number, sprite: Sprite) => void;
    onPointerEnter?: (e: React.PointerEvent, index: number, sprite: Sprite) => void;
    index: number;
    isAdd?: boolean;

    isSelected?: boolean;
    isSelectionPending?: boolean;
    selectionPendingDurationMs?: number;
    isGhost?: boolean;
}

export const TimelineFrame: React.FC<TimelineFrameProps> = React.memo(({
    sprite,
    palette,
    previewPixels,
    isActive,
    onMouseDown,
    onClick,
    onPointerDown,
    onPointerUp,
    onPointerEnter,
    index,
    isAdd,

    isSelected = false,
    isSelectionPending = false,
    selectionPendingDurationMs = 500,
    isGhost = false,
}) => {
    const canvasRef = React.useRef<HTMLCanvasElement>(null);

    // Efficiently draw the frame to canvas whenever pixelData changes
    React.useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Clear previous content
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        const pixels = previewPixels ?? getCompositePixelData(sprite);
        for (let i = 0; i < pixels.length; i++) {
            const color = getPixelColor(pixels, i, palette);
            if (color) {
                const x = (i % GRID_SIZE);
                const y = Math.floor(i / GRID_SIZE);
                ctx.fillStyle = color;
                ctx.fillRect(x, y, 1, 1);
            }
        }

    }, [palette, previewPixels, sprite]);

    const handleMouseDown = (e: React.MouseEvent) => {
        // Let dnd-kit receive the pointer sequence from the sortable parent.
        onMouseDown(e, index, sprite);
    };

    const handleClick = (e: React.MouseEvent) => {
        e.stopPropagation(); // Stop click propagation to prevent unexpected behavior
        if (onClick) onClick(e, index, sprite);
    };

    const handlePointerDown = (e: React.PointerEvent) => {
        if (onPointerDown) onPointerDown(e, index, sprite);
    };

    const handlePointerUp = (e: React.PointerEvent) => {
        if (onPointerUp) onPointerUp(e, index, sprite);
    };

    const handlePointerEnter = (e: React.PointerEvent) => {
        if (onPointerEnter) onPointerEnter(e, index, sprite);
    };

    return (
        <div
            className={`timeline-frame 
                ${isActive ? 'active' : ''} 
                ${isAdd ? 'add-new' : ''} 

                ${isSelected ? 'selected' : ''}
                ${isSelectionPending ? 'select-pending' : ''}
                ${isGhost ? 'ghost' : ''}
            `}
            onMouseDown={handleMouseDown}
            onClick={handleClick}
            onPointerDown={handlePointerDown}
            onPointerUp={handlePointerUp}
            onPointerEnter={handlePointerEnter}
            data-selectable-id={sprite.id}
            style={{
                '--frame-select-duration': `${selectionPendingDurationMs}ms`
            } as React.CSSProperties & Record<'--frame-select-duration', string>}
        >
            <canvas
                ref={canvasRef}
                width={GRID_SIZE}
                height={GRID_SIZE}
                className="timeline-frame-canvas"
            />

            {isAdd ? (
                <div className="timeline-add-overlay">
                    <span className="add-icon">+</span>
                </div>
            ) : (
                <div className="frame-number">{index + 1}</div>
            )}

        </div>
    );
});
