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
                {sprite.pixelData.map((color, i) => {
                    if (!color) return null;
                    const x = i % GRID_SIZE;
                    const y = Math.floor(i / GRID_SIZE);
                    return (
                        <div
                            key={i}
                            style={{
                                position: 'absolute',
                                left: `${x * 100 / GRID_SIZE}%`,
                                top: `${y * 100 / GRID_SIZE}%`,
                                width: `${100 / GRID_SIZE}%`,
                                height: `${100 / GRID_SIZE}%`,
                                backgroundColor: color
                                // No transition here for max performance
                            }}
                        />
                    );
                })}
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
