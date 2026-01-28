import React from 'react';
import { GRID_SIZE } from '../../types';
import type { Sprite } from '../../types';

interface TimelineFrameProps {
    sprite: Sprite;
    isActive: boolean;
    onMouseDown: (e: React.MouseEvent, index: number, sprite: Sprite) => void;
    index: number;
    isAdd?: boolean;
    isDragging?: boolean;
    isDeletePending?: boolean;
    isInBatch?: boolean;
    onDragStart?: (e: React.DragEvent, index: number) => void;
    onDragEnd?: (e: React.DragEvent) => void;
    onDragOver?: (e: React.DragEvent, index: number) => void;
    onDrop?: (e: React.DragEvent) => void;
}

export const TimelineFrame: React.FC<TimelineFrameProps> = React.memo(({
    sprite,
    isActive,
    onMouseDown,
    index,
    isAdd,
    isDragging,
    isDeletePending,
    isInBatch = true,
    onDragStart,
    onDragEnd,
    onDragOver,
    onDrop
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

        // Draw pixels
        // Use standard pixel size of 1 unit on a GRID_SIZE x GRID_SIZE canvas
        // We will scale it via CSS
        const pixelSize = 1;

        sprite.pixelData.forEach((color, i) => {
            if (color) {
                const x = (i % GRID_SIZE);
                const y = Math.floor(i / GRID_SIZE);
                ctx.fillStyle = color;
                ctx.fillRect(x, y, 1, 1);
            }
        });

    }, [sprite.pixelData]);

    return (
        <div
            className={`timeline-frame ${isActive && !isAdd ? 'active' : ''} ${isAdd ? 'add-new' : ''} ${isDragging ? 'dragging' : ''} ${isDeletePending ? 'delete-pending' : ''}`}
            onMouseDown={(e) => onMouseDown(e, index, sprite)}
            title={isAdd ? 'Duplicate Selected Frame' : sprite.name}
            style={{
                position: 'relative',
                opacity: isInBatch ? 1 : 0.4,
                transition: 'opacity 0.2s'
            }}
            draggable={!isAdd}
            onDragStart={(e) => onDragStart?.(e, index)}
            onDragEnd={onDragEnd}
            onDragOver={(e) => onDragOver?.(e, index)}
            onDrop={onDrop}
        >
            {!isAdd && <div className="frame-number">{index + 1}</div>}
            {isDeletePending && <div className="delete-overlay">Delete</div>}

            <div className="frame-preview" style={isAdd ? { opacity: 0.3, filter: 'grayscale(0.5)' } : {}}>
                <canvas
                    ref={canvasRef}
                    width={GRID_SIZE}
                    height={GRID_SIZE}
                    style={{
                        width: '100%',
                        height: '100%',
                        imageRendering: 'pixelated', // crisp display
                        display: 'block'
                    }}
                />
            </div>

            {isAdd && (
                <div style={{
                    position: 'absolute',
                    inset: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '32px',
                    color: 'white',
                    textShadow: '0 0 4px rgba(0,0,0,0.8)',
                    zIndex: 2,
                    pointerEvents: 'none'
                }}>+</div>
            )}
        </div>
    );
});
