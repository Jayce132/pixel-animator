import React from 'react';
import type { Sprite } from '../../types';

const DRAG_HINT_HOVER_DELAY_MS = 220;

interface TimelineDragHintPosition {
    left: number;
    top: number;
}

interface UseTimelineDragHintOptions {
    activeDragId: string | null;
    isPaintSelecting: boolean;
    isPlaying: boolean;
    selectedSpriteIds: Set<string>;
    sprites: Sprite[];
    timelineContainerRef: React.RefObject<HTMLDivElement | null>;
    timelineRef: React.RefObject<HTMLDivElement | null>;
}

export const useTimelineDragHint = ({
    activeDragId,
    isPaintSelecting,
    isPlaying,
    selectedSpriteIds,
    sprites,
    timelineContainerRef,
    timelineRef
}: UseTimelineDragHintOptions) => {
    const [hoveredTimelineSpriteId, setHoveredTimelineSpriteId] = React.useState<string | null>(null);
    const [dragHintPosition, setDragHintPosition] = React.useState<TimelineDragHintPosition | null>(null);
    const [isDragHintTimedOut, setIsDragHintTimedOut] = React.useState(false);
    const pendingHoverSpriteIdRef = React.useRef<string | null>(null);
    const hoverDelayTimeoutRef = React.useRef<number | null>(null);

    const clearHoverDelay = React.useCallback(() => {
        if (hoverDelayTimeoutRef.current !== null) {
            window.clearTimeout(hoverDelayTimeoutRef.current);
            hoverDelayTimeoutRef.current = null;
        }
        pendingHoverSpriteIdRef.current = null;
    }, []);

    const firstSelectedSpriteId = React.useMemo(() => {
        return sprites.find(sprite => selectedSpriteIds.has(sprite.id))?.id ?? null;
    }, [sprites, selectedSpriteIds]);

    const dragHintSpriteId = React.useMemo(() => {
        if (
            sprites.length <= 1 ||
            activeDragId !== null ||
            isPlaying ||
            isPaintSelecting ||
            hoveredTimelineSpriteId === null ||
            isDragHintTimedOut
        ) return null;

        if (
            firstSelectedSpriteId !== null &&
            selectedSpriteIds.has(hoveredTimelineSpriteId)
        ) {
            return firstSelectedSpriteId;
        }

        return hoveredTimelineSpriteId;
    }, [activeDragId, firstSelectedSpriteId, hoveredTimelineSpriteId, isDragHintTimedOut, isPaintSelecting, isPlaying, selectedSpriteIds, sprites.length]);

    const dragHintDirection = React.useMemo<'left' | 'right'>(() => {
        if (dragHintSpriteId === null) return 'right';

        const frameIndex = sprites.findIndex(sprite => sprite.id === dragHintSpriteId);
        if (frameIndex === -1) return 'right';

        const centerIndex = (sprites.length - 1) / 2;
        return frameIndex > centerIndex ? 'left' : 'right';
    }, [dragHintSpriteId, sprites]);

    const handleFrameMouseEnter = React.useCallback((sprite: Sprite) => {
        clearHoverDelay();
        setIsDragHintTimedOut(false);
        setHoveredTimelineSpriteId(current => current === sprite.id ? current : null);

        pendingHoverSpriteIdRef.current = sprite.id;
        hoverDelayTimeoutRef.current = window.setTimeout(() => {
            if (pendingHoverSpriteIdRef.current === sprite.id) {
                setHoveredTimelineSpriteId(sprite.id);
                pendingHoverSpriteIdRef.current = null;
                hoverDelayTimeoutRef.current = null;
            }
        }, DRAG_HINT_HOVER_DELAY_MS);
    }, [clearHoverDelay]);

    const handleFrameMouseLeave = React.useCallback((sprite: Sprite) => {
        if (pendingHoverSpriteIdRef.current === sprite.id) {
            clearHoverDelay();
        }
        setHoveredTimelineSpriteId(prev => prev === sprite.id ? null : prev);
        setIsDragHintTimedOut(false);
    }, [clearHoverDelay]);

    React.useEffect(() => {
        if (hoveredTimelineSpriteId === null || sprites.length <= 1) return;

        setIsDragHintTimedOut(false);
        const timeoutId = window.setTimeout(() => {
            setIsDragHintTimedOut(true);
        }, 2000);

        return () => window.clearTimeout(timeoutId);
    }, [hoveredTimelineSpriteId, sprites.length]);

    React.useEffect(() => {
        if (activeDragId !== null || isPaintSelecting || isPlaying || sprites.length <= 1) {
            clearHoverDelay();
            setHoveredTimelineSpriteId(null);
            setIsDragHintTimedOut(false);
        }
    }, [activeDragId, clearHoverDelay, isPaintSelecting, isPlaying, sprites.length]);

    React.useEffect(() => clearHoverDelay, [clearHoverDelay]);

    const updateDragHintPosition = React.useCallback(() => {
        const timeline = timelineRef.current;
        if (!timeline || dragHintSpriteId === null) {
            setDragHintPosition(null);
            return;
        }

        const frame = timeline.querySelector(`[data-timeline-sprite-id="${dragHintSpriteId}"]`);
        if (!(frame instanceof HTMLElement)) {
            setDragHintPosition(null);
            return;
        }

        const timelineRect = timeline.getBoundingClientRect();
        const frameRect = frame.getBoundingClientRect();
        setDragHintPosition({
            left: frameRect.left + (frameRect.width / 2) - timelineRect.left,
            top: frameRect.top - timelineRect.top - 24
        });
    }, [dragHintSpriteId, timelineRef]);

    React.useLayoutEffect(() => {
        updateDragHintPosition();
    }, [updateDragHintPosition, sprites]);

    React.useEffect(() => {
        if (dragHintSpriteId === null) {
            setDragHintPosition(null);
            return;
        }

        const timelineContainer = timelineContainerRef.current;
        window.addEventListener('resize', updateDragHintPosition);
        timelineContainer?.addEventListener('scroll', updateDragHintPosition, { passive: true });

        return () => {
            window.removeEventListener('resize', updateDragHintPosition);
            timelineContainer?.removeEventListener('scroll', updateDragHintPosition);
        };
    }, [dragHintSpriteId, timelineContainerRef, updateDragHintPosition]);

    return {
        dragHintDirection,
        dragHintPosition,
        handleFrameMouseEnter,
        handleFrameMouseLeave
    };
};
