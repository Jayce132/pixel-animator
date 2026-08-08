import React from 'react';
import type { Sprite } from '../../types';

// Touch interaction constants
export const TIMELINE_SELECTION_LONG_PRESS_DELAY_MS = 500;
const LONG_PRESS_DELAY = TIMELINE_SELECTION_LONG_PRESS_DELAY_MS;
const INITIAL_MOVE_THRESHOLD = 5;
const UP_DIRECTION_THRESHOLD = -3;
const MOVE_THRESHOLD = 10;
const EDGE_ZONE = 40;
const SCROLL_SPEED = 6;

interface UseTimelineTouchOptions {
    sprites: Sprite[];
    timelineContainerRef: React.RefObject<HTMLDivElement | null>;
    timelineRef: React.RefObject<HTMLDivElement | null>;
    onFrameFocus?: (spriteId: string) => void;
}

export function useTimelineTouch({ sprites, timelineContainerRef, timelineRef, onFrameFocus }: UseTimelineTouchOptions) {
    // ── Selection state ──
    const [isSelectionMode, setIsSelectionMode] = React.useState(false);
    const [selectedSpriteIds, setSelectedSpriteIds] = React.useState<Set<string>>(new Set());
    const [touchDragBlocked, setTouchDragBlocked] = React.useState(false);
    const [isPaintSelecting, setIsPaintSelecting] = React.useState(false);
    const [isFramePointerDown, setIsFramePointerDown] = React.useState(false);
    // Visual-only affordance for the long-press timer; actual selection still happens in the timeout below.
    const [selectionPendingSpriteId, setSelectionPendingSpriteId] = React.useState<string | null>(null);

    // ── Refs ──
    const longPressTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
    const longPressStartPosRef = React.useRef<{ x: number; y: number } | null>(null);
    const pointerDownPosRef = React.useRef<{ x: number; y: number } | null>(null);
    const firstMoveUpRef = React.useRef<boolean | null>(null);
    const latestPointerPosRef = React.useRef<{ x: number; y: number } | null>(null);
    const isPointerDownRef = React.useRef(false);
    const isPaintSelectingRef = React.useRef(false);
    const dragStartSpriteIdRef = React.useRef<string | null>(null);
    const initialSelectedIdsRef = React.useRef<Set<string>>(new Set());
    const targetSelectionStateRef = React.useRef<boolean>(true);
    const wasPaintSelectingRef = React.useRef(false);

    // ── Cancel long press (exposed for dnd-kit coordination) ──
    const cancelLongPress = React.useCallback(() => {
        if (longPressTimerRef.current) {
            clearTimeout(longPressTimerRef.current);
            longPressTimerRef.current = null;
        }
        setSelectionPendingSpriteId(null);
        longPressStartPosRef.current = null;
    }, []);

    // ── Frame pointer handlers ──

    const handleFramePointerDown = React.useCallback((e: React.PointerEvent, index: number, sprite: Sprite) => {
        void index;
        isPointerDownRef.current = true;
        setIsFramePointerDown(true);
        const pointerId = e.pointerId;
        const currentTarget = e.currentTarget;
        longPressStartPosRef.current = { x: e.clientX, y: e.clientY };
        pointerDownPosRef.current = { x: e.clientX, y: e.clientY };
        firstMoveUpRef.current = null;
        setSelectionPendingSpriteId(sprite.id);

        longPressTimerRef.current = setTimeout(() => {
            if (isPointerDownRef.current) {
                setSelectionPendingSpriteId(null);
                isPaintSelectingRef.current = true;
                setIsPaintSelecting(true);
                setIsSelectionMode(true);

                dragStartSpriteIdRef.current = sprite.id;
                onFrameFocus?.(sprite.id);
                initialSelectedIdsRef.current = new Set(selectedSpriteIds);
                const targetState = !selectedSpriteIds.has(sprite.id);
                targetSelectionStateRef.current = targetState;

                setSelectedSpriteIds(prev => {
                    const next = new Set(prev);
                    if (targetState) next.add(sprite.id);
                    else next.delete(sprite.id);
                    return next;
                });

                // Dispatch synthetic events to cancel any in-flight dnd-kit drag.
                // PointerSensor listens for pointerup on window/document.
                const cancelEvent = { bubbles: true, cancelable: true };
                window.dispatchEvent(new PointerEvent('pointerup', cancelEvent));
                window.dispatchEvent(new MouseEvent('mouseup', cancelEvent));
                document.dispatchEvent(new PointerEvent('pointerup', cancelEvent));
                document.dispatchEvent(new MouseEvent('mouseup', cancelEvent));

                // Release pointer capture so that onPointerEnter fires on other
                // frames during paint-select drag.
                if (currentTarget instanceof Element) {
                    try {
                        currentTarget.releasePointerCapture(pointerId);
                    } catch {
                        // Element may not have captured pointer
                    }
                }
            }
            longPressTimerRef.current = null;
            setSelectionPendingSpriteId(null);
            longPressStartPosRef.current = null;
        }, LONG_PRESS_DELAY);
    }, [selectedSpriteIds, onFrameFocus]);

    const handleFramePointerUp = React.useCallback((e: React.PointerEvent) => {
        // Ignore synthetic events from the dnd-kit cancel logic above
        if (e.nativeEvent && e.nativeEvent.isTrusted === false) return;

        isPointerDownRef.current = false;
        setIsFramePointerDown(false);

        if (longPressTimerRef.current) {
            clearTimeout(longPressTimerRef.current);
            longPressTimerRef.current = null;
        }
        setSelectionPendingSpriteId(null);
        longPressStartPosRef.current = null;

        if (isPaintSelecting) {
            wasPaintSelectingRef.current = true;
            setIsPaintSelecting(false);
            isPaintSelectingRef.current = false;
            dragStartSpriteIdRef.current = null;
            initialSelectedIdsRef.current = new Set();
            // Reset after a tick so downstream click handlers can check it
            setTimeout(() => { wasPaintSelectingRef.current = false; }, 100);
        }
    }, [isPaintSelecting]);

    const handleFramePointerEnter = React.useCallback((_e: React.PointerEvent, _index: number, sprite: Sprite) => {
        if (isPaintSelecting && isPointerDownRef.current) {
            setSelectedSpriteIds(prev => {
                if (prev.has(sprite.id)) return prev;
                const newSet = new Set(prev);
                newSet.add(sprite.id);
                return newSet;
            });
        }
    }, [isPaintSelecting]);

    // ── Global pointer tracking (direction detection + long-press cancel) ──

    React.useEffect(() => {
        const handlePointerMove = (e: PointerEvent) => {
            latestPointerPosRef.current = { x: e.clientX, y: e.clientY };

            // Detect initial movement direction (up vs down)
            if (pointerDownPosRef.current && firstMoveUpRef.current === null) {
                const dx = e.clientX - pointerDownPosRef.current.x;
                const dy = e.clientY - pointerDownPosRef.current.y;
                if (Math.hypot(dx, dy) > INITIAL_MOVE_THRESHOLD) {
                    firstMoveUpRef.current = dy < UP_DIRECTION_THRESHOLD;
                }
            }

            // Cancel long press if pointer moved too far
            if (!longPressStartPosRef.current || !longPressTimerRef.current) return;

            const dx = e.clientX - longPressStartPosRef.current.x;
            const dy = e.clientY - longPressStartPosRef.current.y;
            const distance = Math.hypot(dx, dy);

            if (distance > MOVE_THRESHOLD) {
                cancelLongPress();
                // Block dnd-kit drag if initial movement was downward
                if (firstMoveUpRef.current === false) {
                    setTouchDragBlocked(true);
                }
            }
        };

        const handlePointerUp = (e: PointerEvent) => {
            // Synthetic pointerups only cancel dnd-kit; the real pointer is still down for paint-select.
            if (e.isTrusted === false) return;

            cancelLongPress();
            isPointerDownRef.current = false;
            setIsFramePointerDown(false);
            longPressStartPosRef.current = null;
            pointerDownPosRef.current = null;
            firstMoveUpRef.current = null;
            setTouchDragBlocked(false);
        };

        const handlePointerCancel = () => {
            cancelLongPress();
            isPointerDownRef.current = false;
            setIsFramePointerDown(false);
            setSelectionPendingSpriteId(null);
            pointerDownPosRef.current = null;
            firstMoveUpRef.current = null;
            setTouchDragBlocked(false);
        };

        window.addEventListener('pointermove', handlePointerMove);
        window.addEventListener('pointerup', handlePointerUp);
        window.addEventListener('pointercancel', handlePointerCancel);
        return () => {
            window.removeEventListener('pointermove', handlePointerMove);
            window.removeEventListener('pointerup', handlePointerUp);
            window.removeEventListener('pointercancel', handlePointerCancel);
        };
    }, [cancelLongPress]);

    // ── Prevent scroll during paint-select ──

    React.useEffect(() => {
        if (!isPaintSelecting) return;

        const preventScroll = (e: TouchEvent) => {
            e.preventDefault();
        };

        document.addEventListener('touchmove', preventScroll, { passive: false, capture: true });
        return () => {
            document.removeEventListener('touchmove', preventScroll, true);
        };
    }, [isPaintSelecting]);

    // ── Paint-select: auto-scroll + range selection via hit-testing ──

    React.useEffect(() => {
        if (!isPaintSelecting) return;

        let scrollRafId: number | null = null;
        let scrollDirection = 0;

        const autoScrollTick = () => {
            const container = timelineContainerRef.current;
            if (container && scrollDirection !== 0) {
                container.scrollLeft += scrollDirection * SCROLL_SPEED;
            }
            scrollRafId = requestAnimationFrame(autoScrollTick);
        };

        scrollRafId = requestAnimationFrame(autoScrollTick);

        const handleGlobalPointerMove = (e: PointerEvent) => {
            // Edge-zone auto-scroll
            const container = timelineContainerRef.current;
            if (container) {
                const rect = container.getBoundingClientRect();
                if (e.clientX < rect.left + EDGE_ZONE) {
                    scrollDirection = -1;
                } else if (e.clientX > rect.right - EDGE_ZONE) {
                    scrollDirection = 1;
                } else {
                    scrollDirection = 0;
                }
            }

            // Hit-test to find frame under pointer and compute range selection
            const element = document.elementFromPoint(e.clientX, e.clientY);
            if (!element) return;

            const frame = element.closest('[data-selectable-id]');
            if (frame) {
                const idStr = frame.getAttribute('data-selectable-id');
                if (idStr && dragStartSpriteIdRef.current !== null) {
                    const currentId = idStr;
                    const targetSprite = sprites.find(s => s.id === currentId);
                    if (!targetSprite) return;

                    const startIdx = sprites.findIndex(s => s.id === dragStartSpriteIdRef.current);
                    const endIdx = sprites.indexOf(targetSprite);

                    if (startIdx !== -1 && endIdx !== -1) {
                        const min = Math.min(startIdx, endIdx);
                        const max = Math.max(startIdx, endIdx);
                        const rangeIds = sprites.slice(min, max + 1).map(s => s.id);

                        const nextSelection = new Set(initialSelectedIdsRef.current);

                        if (targetSelectionStateRef.current) {
                            rangeIds.forEach(id => nextSelection.add(id));
                        } else {
                            rangeIds.forEach(id => nextSelection.delete(id));
                        }

                        if (nextSelection.size !== selectedSpriteIds.size ||
                            ![...nextSelection].every(id => selectedSpriteIds.has(id))) {
                            setSelectedSpriteIds(nextSelection);
                        }
                    }
                }
            }
        };

        window.addEventListener('pointermove', handleGlobalPointerMove);
        return () => {
            window.removeEventListener('pointermove', handleGlobalPointerMove);
            if (scrollRafId !== null) cancelAnimationFrame(scrollRafId);
            scrollDirection = 0;
        };
    }, [isPaintSelecting, sprites, selectedSpriteIds, timelineContainerRef]);

    // ── Auto-exit selection mode when selection becomes empty ──

    React.useEffect(() => {
        if (isSelectionMode && selectedSpriteIds.size === 0) {
            setIsSelectionMode(false);
        }
    }, [isSelectionMode, selectedSpriteIds.size]);

    // ── Click outside timeline clears selection ──

    React.useEffect(() => {
        if (selectedSpriteIds.size === 0) return;

        const handleClickOutside = (e: MouseEvent) => {
            if (timelineRef.current && !timelineRef.current.contains(e.target as Node)) {
                setSelectedSpriteIds(new Set());
                setIsSelectionMode(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [selectedSpriteIds.size, timelineRef]);

    return {
        // State
        isSelectionMode,
        setIsSelectionMode,
        selectedSpriteIds,
        setSelectedSpriteIds,
        isPaintSelecting,
        isFramePointerDown,
        selectionPendingSpriteId,
        touchDragBlocked,

        // Frame event handlers
        handleFramePointerDown,
        handleFramePointerUp,
        handleFramePointerEnter,

        // For dnd-kit coordination
        cancelLongPress,

        // Ref needed by scroll-into-view effect in Timeline
        isPointerDownRef,
    };
}
