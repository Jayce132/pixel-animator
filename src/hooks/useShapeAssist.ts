import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { MutableRefObject } from 'react';
import { getLinePixels } from '../utils/draw';
import { GRID_SIZE } from '../types';
import type { Tool } from '../types';

type DragOrigin = 'inside' | 'outside' | null;
type ShapeHintMode = 'line' | 'circle';

interface UseShapeAssistOptions {
    brushSize: 1 | 2;
    cancelStroke: () => void;
    currentTool: Tool;
    dragOriginRef: MutableRefObject<DragOrigin>;
    isDrawing: boolean;
    isEyedropperActive: boolean;
    isPointerDownRef: MutableRefObject<boolean>;
    selectedPixels: Set<number>;
}

export const useShapeAssist = ({
    brushSize,
    cancelStroke,
    currentTool,
    dragOriginRef,
    isDrawing,
    isEyedropperActive,
    isPointerDownRef,
    selectedPixels
}: UseShapeAssistOptions) => {
    const [linePreviewPixels, setLinePreviewPixels] = useState<number[]>([]);
    const [circlePreviewPixels, setCirclePreviewPixels] = useState<number[]>([]);
    const [shapeHintMode, setShapeHintMode] = useState<ShapeHintMode | null>(null);
    const strokeStartIndexRef = useRef<number | null>(null);
    const strokeEndIndexRef = useRef<number | null>(null);
    const hasMovedInStrokeRef = useRef(false);
    const hasLeftCircleDetonatorRef = useRef(false);
    const isLineModeActiveRef = useRef(false);
    const isCircleModeActiveRef = useRef(false);
    const isAltPressedRef = useRef(false);
    const shapeHintModeRef = useRef<ShapeHintMode | null>(null);

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
        strokeStartIndexRef.current = null;
        strokeEndIndexRef.current = null;
        hasMovedInStrokeRef.current = false;
        hasLeftCircleDetonatorRef.current = false;
    }, [clearShapeHint]);

    const beginShapeStroke = useCallback((index: number) => {
        isLineModeActiveRef.current = false;
        isCircleModeActiveRef.current = false;
        setLinePreviewPixels([]);
        setCirclePreviewPixels([]);
        clearShapeHint();
        strokeStartIndexRef.current = index;
        strokeEndIndexRef.current = index;
        hasMovedInStrokeRef.current = false;
        hasLeftCircleDetonatorRef.current = false;
    }, [clearShapeHint]);

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
        const strokeStart = strokeStartIndexRef.current;
        if (strokeStart !== null && !isWithinCircleDetonator(strokeStart, index)) {
            hasLeftCircleDetonatorRef.current = true;
        }

        if (currentTool === 'brush' && hasMovedInStrokeRef.current && strokeStart !== null) {
            const mode: ShapeHintMode =
                hasLeftCircleDetonatorRef.current && isWithinCircleDetonator(strokeStart, index)
                    ? 'circle'
                    : 'line';
            if (shapeHintModeRef.current !== mode) {
                shapeHintModeRef.current = mode;
                setShapeHintMode(mode);
            }
        }

        if (isAltPressedRef.current && hasMovedInStrokeRef.current && currentTool === 'brush') {
            if (!isLineModeActiveRef.current && !isCircleModeActiveRef.current) {
                cancelStroke();
            }

            if (strokeStart !== null && hasLeftCircleDetonatorRef.current && isWithinCircleDetonator(strokeStart, index)) {
                isLineModeActiveRef.current = false;
                isCircleModeActiveRef.current = true;
                setLinePreviewPixels([]);
                setCirclePreviewPixels(filterByDragOrigin(getCirclePixelsFromDiameter(strokeStart, index)));
                return true;
            }

            if (strokeStart !== null) {
                isCircleModeActiveRef.current = false;
                isLineModeActiveRef.current = true;
                setCirclePreviewPixels([]);
                setLinePreviewPixels(filterByDragOrigin(getLinePixels(strokeStart, index)));
                return true;
            }
        }

        return false;
    }, [
        cancelStroke,
        currentTool,
        filterByDragOrigin,
        getCirclePixelsFromDiameter,
        isDrawing,
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

    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key !== 'Alt') return;
            isAltPressedRef.current = true;

            if (!isPointerDownRef.current || !isDrawing || isEyedropperActive || currentTool !== 'brush') return;
            const strokeStart = strokeStartIndexRef.current;
            const strokeEnd = strokeEndIndexRef.current;
            if (strokeStart === null || strokeEnd === null || !hasMovedInStrokeRef.current) return;

            if (!isLineModeActiveRef.current && !isCircleModeActiveRef.current) {
                cancelStroke();
            }

            if (hasLeftCircleDetonatorRef.current && isWithinCircleDetonator(strokeStart, strokeEnd)) {
                isLineModeActiveRef.current = false;
                isCircleModeActiveRef.current = true;
                setLinePreviewPixels([]);
                setCirclePreviewPixels(filterByDragOrigin(getCirclePixelsFromDiameter(strokeStart, strokeEnd)));
                return;
            }

            isCircleModeActiveRef.current = false;
            isLineModeActiveRef.current = true;
            setCirclePreviewPixels([]);
            setLinePreviewPixels(filterByDragOrigin(getLinePixels(strokeStart, strokeEnd)));
        };

        const onKeyUp = (e: KeyboardEvent) => {
            if (e.key === 'Alt') isAltPressedRef.current = false;
        };

        window.addEventListener('keydown', onKeyDown);
        window.addEventListener('keyup', onKeyUp);
        return () => {
            window.removeEventListener('keydown', onKeyDown);
            window.removeEventListener('keyup', onKeyUp);
        };
    }, [
        cancelStroke,
        currentTool,
        filterByDragOrigin,
        getCirclePixelsFromDiameter,
        isDrawing,
        isEyedropperActive,
        isPointerDownRef,
        isWithinCircleDetonator
    ]);

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
        clearShapeHint,
        commitActiveShape,
        handleShapePointerTargetChange,
        linePreviewSet,
        resetShapeAssist,
        shapeHintMode
    };
};
