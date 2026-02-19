import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { TimelineFrame } from './TimelineFrame';
import type { Sprite } from '../../types';

interface SortableFrameProps {
    id: number; // The unique ID of the sprite (for dnd-kit)
    sprite: Sprite;
    index: number;
    isActive: boolean;
    isDeletePending?: boolean;
    isSelected?: boolean;
    forceDragging?: boolean;
    onMouseDown: (e: React.MouseEvent, index: number, sprite: Sprite) => void;
    onClick?: (e: React.MouseEvent, index: number, sprite: Sprite) => void;
    onPointerDown?: (e: React.PointerEvent, index: number, sprite: Sprite) => void;
    onPointerUp?: (e: React.PointerEvent, index: number, sprite: Sprite) => void;
    onPointerEnter?: (e: React.PointerEvent, index: number, sprite: Sprite) => void;
    disabled?: boolean;
    previewPixels?: (string | null)[];
}

export const SortableFrame: React.FC<SortableFrameProps> = ({
    id,
    sprite,
    index,
    isActive,
    isDeletePending,
    isSelected,
    forceDragging,
    onMouseDown,
    onClick,
    onPointerDown,
    onPointerUp,
    onPointerEnter,
    disabled = false,
    previewPixels
}) => {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({
        id,
        data: { sprite, index },
        disabled
    });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        display: 'inline-block',
        position: 'relative' as const,
        zIndex: isDragging ? 100 : 'auto',
        opacity: isDragging || forceDragging ? 0 : 1, // Hide original when dragging (overlay is shown)
    };

    return (
        <div
            ref={setNodeRef}
            style={style}
            className="timeline-frame-wrapper"
            id={`frame-${index}`}
            {...attributes}
            {...listeners}
        >
            <TimelineFrame
                sprite={sprite}
                previewPixels={previewPixels}
                index={index}
                isActive={isActive}
                isDeletePending={isDeletePending}
                isSelected={isSelected}
                onMouseDown={onMouseDown}
                onClick={onClick}
                onPointerDown={onPointerDown}
                onPointerUp={onPointerUp}
                onPointerEnter={onPointerEnter}
            // Native handlers not needed
            />
            {isDeletePending && (
                <div className="delete-overlay" style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'white',
                    fontWeight: 'bold',
                    fontSize: '0.8rem',
                    pointerEvents: 'none',
                    zIndex: 999
                }}>
                    <span>Delete?</span>
                </div>
            )}
        </div>
    );
};
