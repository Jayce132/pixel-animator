import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { TimelineFrame } from './TimelineFrame';
import type { Palette, PixelData, Sprite } from '../../types';

interface SortableFrameProps {
    id: string;
    sprite: Sprite;
    index: number;
    isActive: boolean;

    dragAccepted?: boolean;
    isSelected?: boolean;
    isSelectionPending?: boolean;
    selectionPendingDurationMs?: number;
    forceDragging?: boolean;
    onMouseDown: (e: React.MouseEvent, index: number, sprite: Sprite) => void;
    onMouseEnter?: (sprite: Sprite) => void;
    onMouseLeave?: (sprite: Sprite) => void;
    onClick?: (e: React.MouseEvent, index: number, sprite: Sprite) => void;
    onPointerDown?: (e: React.PointerEvent, index: number, sprite: Sprite) => void;
    onPointerUp?: (e: React.PointerEvent, index: number, sprite: Sprite) => void;
    onPointerEnter?: (e: React.PointerEvent, index: number, sprite: Sprite) => void;
    disabled?: boolean;
    palette: Palette;
    previewPixels?: PixelData;
}

export const SortableFrame: React.FC<SortableFrameProps> = ({
    id,
    sprite,
    index,
    isActive,

    dragAccepted = false,
    isSelected,
    isSelectionPending,
    selectionPendingDurationMs,
    forceDragging,
    onMouseDown,
    onMouseEnter,
    onMouseLeave,
    onClick,
    onPointerDown,
    onPointerUp,
    onPointerEnter,
    disabled = false,
    palette,
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

    const style: React.CSSProperties = {
        transform: dragAccepted ? CSS.Transform.toString(transform) : undefined,
        transition: dragAccepted ? transition : undefined,
        display: 'inline-block',
        position: 'relative',
        zIndex: dragAccepted && isDragging ? 100 : 'auto',
        opacity: forceDragging ? 0 : 1,
    };

    return (
        <div
            ref={setNodeRef}
            style={style}
            className="timeline-frame-wrapper"
            id={`frame-${index}`}
            data-timeline-sprite-id={sprite.id}
            onMouseEnter={() => onMouseEnter?.(sprite)}
            onMouseLeave={() => onMouseLeave?.(sprite)}
            {...attributes}
            {...listeners}
        >
            <TimelineFrame
                sprite={sprite}
                palette={palette}
                previewPixels={previewPixels}
                index={index}
                isActive={isActive}

                isSelected={isSelected}
                isSelectionPending={isSelectionPending}
                selectionPendingDurationMs={selectionPendingDurationMs}
                onMouseDown={onMouseDown}
                onClick={onClick}
                onPointerDown={onPointerDown}
                onPointerUp={onPointerUp}
                onPointerEnter={onPointerEnter}
            />

        </div>
    );
};
