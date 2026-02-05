import React from 'react';
import { GRID_SIZE } from '../../types';
import type { Sprite } from '../../types';

interface TimelineFrameProps {
    sprite: Sprite;
    isActive: boolean;
    onMouseDown: (e: React.MouseEvent, index: number, sprite: Sprite) => void;
    onClick?: (e: React.MouseEvent, index: number, sprite: Sprite) => void;
    onPointerDown?: (e: React.PointerEvent, index: number, sprite: Sprite) => void;
    onPointerUp?: (e: React.PointerEvent, index: number, sprite: Sprite) => void;
    onPointerEnter?: (e: React.PointerEvent, index: number, sprite: Sprite) => void;
    index: number;
    isAdd?: boolean;
    isDeletePending?: boolean;
    isSelected?: boolean;
    isGhost?: boolean;
}

export const TimelineFrame: React.FC<TimelineFrameProps> = React.memo(({
    sprite,
    isActive,
    onMouseDown,
    onClick,
    onPointerDown,
    onPointerUp,
    onPointerEnter,
    index,
    isAdd,
    isDeletePending,
    isSelected = false,
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

        sprite.pixelData.forEach((color, i) => {
            if (color) {
                const x = (i % GRID_SIZE);
                const y = Math.floor(i / GRID_SIZE);
                ctx.fillStyle = color;
                ctx.fillRect(x, y, 1, 1);
            }
        });

    }, [sprite.pixelData]);

    const handleMouseDown = (e: React.MouseEvent) => {
        // We shouldn't stop propagation here as it might interfere with dnd-kit which listens on parent
        // But if dnd-kit uses PointerEvents, it might be fine.
        // However, removing stopPropagation is generally safer for dnd-kit context.
        // e.stopPropagation(); 
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
                ${isDeletePending ? 'delete-pending' : ''}
                ${isSelected ? 'selected' : ''}
                ${isGhost ? 'ghost' : ''}
            `}
            onMouseDown={handleMouseDown}
            onClick={handleClick}
            onPointerDown={handlePointerDown}
            onPointerUp={handlePointerUp}
            onPointerEnter={handlePointerEnter}
            data-selectable-id={sprite.id}
            style={{
                position: 'relative', // For overlay positioning
                touchAction: 'none'
            }}
        >
            <canvas
                ref={canvasRef}
                width={GRID_SIZE}
                height={GRID_SIZE}
                style={{
                    width: '100%',
                    height: '100%',
                    imageRendering: 'pixelated',
                    pointerEvents: 'none', // Let clicks pass through to div
                    opacity: isAdd ? 0.5 : 1 // Dim the preview if it's the "Add" button
                }}
            />

            {isAdd ? (
                <div style={{
                    position: 'absolute',
                    inset: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    pointerEvents: 'none'
                }}>
                    <span className="add-icon" style={{
                        fontSize: '2rem',
                        fontWeight: 'bold',
                        color: 'white',
                        textShadow: '0 0 4px rgba(0,0,0,0.8)'
                    }}>+</span>
                </div>
            ) : (
                <div className="frame-number">{index + 1}</div>
            )}

        </div>
    );
});
