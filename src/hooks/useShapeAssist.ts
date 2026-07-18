import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { MutableRefObject } from 'react';
import { getLinePixels } from '../utils/draw';
import { GRID_SIZE } from '../types';
import type { Tool } from '../types';
import { EYEDROPPER_HOLD_MS } from './useEyedropperHold';

// Holding still mid-stroke auto-activates shape assist (works on touch, where a
// modifier key isn't available): a closed loop back to the start becomes a
// circle, anything else becomes a straight line. Same delay as the eyedropper
// hold so both hold-to-activate gestures feel identical.
const SHAPE_HOLD_MS = EYEDROPPER_HOLD_MS;
// Countdown ring visuals mirror the dropper hold pacing: a short grace period
// so brief pauses while sketching don't flash the ring, then the sweep fills
// the remainder of the hold.
export const SHAPE_HOLD_RING_DELAY_MS = 120;
export const SHAPE_HOLD_RING_SWEEP_MS = SHAPE_HOLD_MS - SHAPE_HOLD_RING_DELAY_MS;

// A hold only offers a shape when the stroke plausibly IS that shape, so
// scribble-filling or long sketch strokes never snap no matter how long the
// pointer pauses. Lines: every path point within LINE_MAX_DEVIATION cells of
// the start→end chord. Circles: closed loop whose points sit in a consistent
// radius band around the centroid.
const LINE_MAX_DEVIATION = 1.8;
const CIRCLE_MIN_RADIUS = 1.5;
const CIRCLE_MIN_PATH_CELLS = 8;

const toXY = (idx: number) => ({ x: idx % GRID_SIZE, y: Math.floor(idx / GRID_SIZE) });

const isStraightishPath = (path: number[]): boolean => {
    if (path.length < 2) return false;
    const s = toXY(path[0]);
    const e = toXY(path[path.length - 1]);
    const chord = Math.hypot(e.x - s.x, e.y - s.y);
    if (chord < 1) return false;

    return path.every((idx) => {
        const p = toXY(idx);
        const deviation = Math.abs((e.x - s.x) * (s.y - p.y) - (s.x - p.x) * (e.y - s.y)) / chord;
        return deviation <= LINE_MAX_DEVIATION;
    });
};

const isRoundishPath = (path: number[]): boolean => {
    if (path.length < CIRCLE_MIN_PATH_CELLS) return false;

    let sumX = 0;
    let sumY = 0;
    path.forEach((idx) => {
        const p = toXY(idx);
        sumX += p.x;
        sumY += p.y;
    });
    const cx = sumX / path.length;
    const cy = sumY / path.length;

    const dists = path.map((idx) => {
        const p = toXY(idx);
        return Math.hypot(p.x - cx, p.y - cy);
    });
    const meanR = dists.reduce((sum, d) => sum + d, 0) / dists.length;
    if (meanR < CIRCLE_MIN_RADIUS) return false;

    const tolerance = Math.max(2, meanR * 0.35);
    return dists.every((d) => Math.abs(d - meanR) <= tolerance);
};

type DragOrigin = 'inside' | 'outside' | null;
type ShapeHintMode = 'line' | 'circle';

interface UseShapeAssistOptions {
    brushSize: 1 | 2;
    cancelStroke: () => void;
    currentTool: Tool;
    dragOriginRef: MutableRefObject<DragOrigin>;
    isDrawing: boolean;
    isPointerDownRef: MutableRefObject<boolean>;
    selectedPixels: Set<number>;
}

export const useShapeAssist = ({
    brushSize,
    cancelStroke,
    currentTool,
    dragOriginRef,
    isDrawing,
    isPointerDownRef,
    selectedPixels
}: UseShapeAssistOptions) => {
    const [linePreviewPixels, setLinePreviewPixels] = useState<number[]>([]);
    const [circlePreviewPixels, setCirclePreviewPixels] = useState<number[]>([]);
    const [shapeHintMode, setShapeHintMode] = useState<ShapeHintMode | null>(null);
    const strokeStartIndexRef = useRef<number | null>(null);
    const strokeEndIndexRef = useRef<number | null>(null);
    const strokePathRef = useRef<number[]>([]);
    const hasMovedInStrokeRef = useRef(false);
    const hasLeftCircleDetonatorRef = useRef(false);
    const isLineModeActiveRef = useRef(false);
    const isCircleModeActiveRef = useRef(false);
    const shapeHintModeRef = useRef<ShapeHintMode | null>(null);
    const shapeHoldTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    // Grid cell the shape hold is armed on; drives the countdown ring.
    const [shapeHoldIndex, setShapeHoldIndex] = useState<number | null>(null);

    const clearShapeHoldTimer = useCallback(() => {
        if (shapeHoldTimerRef.current !== null) {
            clearTimeout(shapeHoldTimerRef.current);
            shapeHoldTimerRef.current = null;
        }
        setShapeHoldIndex(null);
    }, []);

    const getCirclePixelsFromDiameter = useCallback((startIndex: number, endIndex: number): number[] => {
        const sx = startIndex % GRID_SIZE;
        const sy = Math.floor(startIndex / GRID_SIZE);
        const ex = endIndex % GRID_SIZE;
        const ey = Math.floor(endIndex / GRID_SIZE);

        // Start and current point are opposite points on the circumference (diameter endpoints).
        const cx = (sx + ex) / 2;
        const cy = (sy + ey) / 2;
        const radius = Math.hypot(ex - sx, ey - sy) / 2;

        if (radius <= 0) return [startIndex];

        const points = new Set<number>();
        const ringThickness = 0.6; // Pixel-friendly ring threshold

        for (let py = 0; py < GRID_SIZE; py++) {
            for (let px = 0; px < GRID_SIZE; px++) {
                const d = Math.hypot(px - cx, py - cy);
                if (Math.abs(d - radius) <= ringThickness) {
                    points.add(py * GRID_SIZE + px);
                }
            }
        }

        points.add(startIndex);
        points.add(endIndex);
        return Array.from(points);
    }, []);

    const isWithinCircleDetonator = useCallback((startIndex: number, currentIndex: number): boolean => {
        const sx = startIndex % GRID_SIZE;
        const sy = Math.floor(startIndex / GRID_SIZE);
        const cx = currentIndex % GRID_SIZE;
        const cy = Math.floor(currentIndex / GRID_SIZE);
        return Math.abs(cx - sx) <= 2 && Math.abs(cy - sy) <= 2;
    }, []);

    const filterByDragOrigin = useCallback((pixels: number[]) => {
        return pixels.filter((idx) => {
            if (dragOriginRef.current === 'inside') return selectedPixels.has(idx);
            if (dragOriginRef.current === 'outside') return !selectedPixels.has(idx);
            return true;
        });
    }, [dragOriginRef, selectedPixels]);

    const clearShapeHint = useCallback(() => {
        setShapeHintMode(null);
        shapeHintModeRef.current = null;
    }, []);

    const resetShapeAssist = useCallback(() => {
        isLineModeActiveRef.current = false;
        isCircleModeActiveRef.current = false;
        setLinePreviewPixels([]);
        setCirclePreviewPixels([]);
        clearShapeHint();
        clearShapeHoldTimer();
        strokeStartIndexRef.current = null;
        strokeEndIndexRef.current = null;
        strokePathRef.current = [];
        hasMovedInStrokeRef.current = false;
        hasLeftCircleDetonatorRef.current = false;
    }, [clearShapeHint, clearShapeHoldTimer]);

    const beginShapeStroke = useCallback((index: number) => {
        isLineModeActiveRef.current = false;
        isCircleModeActiveRef.current = false;
        setLinePreviewPixels([]);
        setCirclePreviewPixels([]);
        clearShapeHint();
        clearShapeHoldTimer();
        strokeStartIndexRef.current = index;
        strokeEndIndexRef.current = index;
        strokePathRef.current = [index];
        hasMovedInStrokeRef.current = false;
        hasLeftCircleDetonatorRef.current = false;
    }, [clearShapeHint, clearShapeHoldTimer]);

    const handleShapePointerTargetChange = useCallback((index: number, onStrokeMoved: () => void) => {
        if (isCircleModeActiveRef.current) {
            if (strokeEndIndexRef.current !== index) {
                strokeEndIndexRef.current = index;
                const circleStart = strokeStartIndexRef.current;
                if (circleStart !== null) {
                    setCirclePreviewPixels(filterByDragOrigin(getCirclePixelsFromDiameter(circleStart, index)));
                }
            }
            return true;
        }

        if (isLineModeActiveRef.current) {
            if (strokeEndIndexRef.current !== index) {
                strokeEndIndexRef.current = index;
                const lineStart = strokeStartIndexRef.current;
                if (lineStart !== null) {
                    setLinePreviewPixels(filterByDragOrigin(getLinePixels(lineStart, index)));
                }
            }
            return true;
        }

        if (!isDrawing || (currentTool !== 'brush' && currentTool !== 'eraser')) {
            return false;
        }

        if (strokeEndIndexRef.current !== null && strokeEndIndexRef.current !== index) {
            hasMovedInStrokeRef.current = true;
            onStrokeMoved();
        }

        strokeEndIndexRef.current = index;
        const strokePath = strokePathRef.current;
        if (strokePath[strokePath.length - 1] !== index) {
            strokePath.push(index);
        }
        const strokeStart = strokeStartIndexRef.current;
        if (strokeStart !== null && !isWithinCircleDetonator(strokeStart, index)) {
            hasLeftCircleDetonatorRef.current = true;
        }

        // Shape hold: staying on the same grid cell for SHAPE_HOLD_MS activates
        // shape assist, but only when the stroke plausibly is that shape — a
        // near-round closed loop offers a circle, a near-straight stroke offers
        // a line, and anything else (scribble fills, long sketch strokes) offers
        // nothing. Any move to another cell lands back here and restarts the
        // timer; the hint mirrors what a hold would produce.
        let holdShape: ShapeHintMode | null = null;
        if (currentTool === 'brush' && hasMovedInStrokeRef.current && strokeStart !== null) {
            const isLoopClosed = hasLeftCircleDetonatorRef.current && isWithinCircleDetonator(strokeStart, index);
            if (isLoopClosed) {
                holdShape = isRoundishPath(strokePath) ? 'circle' : null;
            } else {
                holdShape = isStraightishPath(strokePath) ? 'line' : null;
            }
        }
        if (shapeHintModeRef.current !== holdShape) {
            shapeHintModeRef.current = holdShape;
            setShapeHintMode(holdShape);
        }

        clearShapeHoldTimer();
        if (holdShape !== null) {
            const shapeToActivate = holdShape;
            shapeHoldTimerRef.current = setTimeout(() => {
                shapeHoldTimerRef.current = null;
                setShapeHoldIndex(null);
                if (!isPointerDownRef.current) return;
                if (isLineModeActiveRef.current || isCircleModeActiveRef.current) return;
                const start = strokeStartIndexRef.current;
                const end = strokeEndIndexRef.current;
                if (start === null || end === null) return;

                cancelStroke();
                if (shapeToActivate === 'circle') {
                    isCircleModeActiveRef.current = true;
                    setLinePreviewPixels([]);
                    setCirclePreviewPixels(filterByDragOrigin(getCirclePixelsFromDiameter(start, end)));
                } else {
                    isLineModeActiveRef.current = true;
                    setCirclePreviewPixels([]);
                    setLinePreviewPixels(filterByDragOrigin(getLinePixels(start, end)));
                }
            }, SHAPE_HOLD_MS);
            setShapeHoldIndex(index);
        }

        return false;
    }, [
        cancelStroke,
        clearShapeHoldTimer,
        currentTool,
        filterByDragOrigin,
        getCirclePixelsFromDiameter,
        isDrawing,
        isPointerDownRef,
        isWithinCircleDetonator
    ]);

    const commitActiveShape = useCallback((paintPixel: (index: number) => void, onCommitted: () => void) => {
        const canCommitShape = currentTool === 'brush' || currentTool === 'eraser';

        if (isLineModeActiveRef.current && canCommitShape) {
            const lineStart = strokeStartIndexRef.current;
            const lineEnd = strokeEndIndexRef.current;
            if (lineStart !== null && lineEnd !== null) {
                filterByDragOrigin(getLinePixels(lineStart, lineEnd)).forEach(paintPixel);
            }
            isLineModeActiveRef.current = false;
            setLinePreviewPixels([]);
            clearShapeHint();
            onCommitted();
            return true;
        }

        if (isCircleModeActiveRef.current && canCommitShape) {
            const circleStart = strokeStartIndexRef.current;
            const circleEnd = strokeEndIndexRef.current;
            if (circleStart !== null && circleEnd !== null) {
                filterByDragOrigin(getCirclePixelsFromDiameter(circleStart, circleEnd)).forEach(paintPixel);
            }
            isCircleModeActiveRef.current = false;
            setCirclePreviewPixels([]);
            clearShapeHint();
            onCommitted();
            return true;
        }

        return false;
    }, [clearShapeHint, currentTool, filterByDragOrigin, getCirclePixelsFromDiameter]);

    // Clear any pending shape hold timer on unmount.
    useEffect(() => clearShapeHoldTimer, [clearShapeHoldTimer]);

    const linePreviewSet = useMemo(() => {
        const preview = new Set<number>();
        linePreviewPixels.forEach((idx) => {
            const x = idx % GRID_SIZE;
            const y = Math.floor(idx / GRID_SIZE);
            preview.add(idx);

            if (brushSize === 2 && (currentTool === 'brush' || currentTool === 'eraser')) {
                if (x + 1 < GRID_SIZE) preview.add(idx + 1);
                if (y + 1 < GRID_SIZE) preview.add(idx + GRID_SIZE);
                if (x + 1 < GRID_SIZE && y + 1 < GRID_SIZE) preview.add(idx + GRID_SIZE + 1);
            }
        });
        return preview;
    }, [linePreviewPixels, brushSize, currentTool]);

    const circlePreviewSet = useMemo(() => {
        const preview = new Set<number>();
        circlePreviewPixels.forEach((idx) => {
            const x = idx % GRID_SIZE;
            const y = Math.floor(idx / GRID_SIZE);
            preview.add(idx);

            if (brushSize === 2 && (currentTool === 'brush' || currentTool === 'eraser')) {
                if (x + 1 < GRID_SIZE) preview.add(idx + 1);
                if (y + 1 < GRID_SIZE) preview.add(idx + GRID_SIZE);
                if (x + 1 < GRID_SIZE && y + 1 < GRID_SIZE) preview.add(idx + GRID_SIZE + 1);
            }
        });
        return preview;
    }, [circlePreviewPixels, brushSize, currentTool]);

    return {
        beginShapeStroke,
        circlePreviewSet,
        shapeHoldIndex,
        clearShapeHint,
        commitActiveShape,
        handleShapePointerTargetChange,
        linePreviewSet,
        resetShapeAssist,
        shapeHintMode
    };
};
