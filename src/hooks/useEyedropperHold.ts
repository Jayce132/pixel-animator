import { useCallback, useEffect, useRef, useState } from 'react';
import type { MutableRefObject, RefObject } from 'react';
import { GRID_SIZE } from '../types';
import type { Palette, PixelData, Tool } from '../types';
import { getPixelColor } from '../utils/pixelData';

const EYEDROPPER_HOLD_START_DELAY_MS = 120;
export const EYEDROPPER_HOLD_ANIMATION_MS = 480;
export const EYEDROPPER_HOLD_MS = EYEDROPPER_HOLD_START_DELAY_MS + EYEDROPPER_HOLD_ANIMATION_MS;
const HOLD_CANCEL_DISTANCE_PX = 5;

interface PointerCoords {
    clientX: number;
    clientY: number;
}

export type DropperHoldOverlay =
    | { kind: 'cells'; indices: number[]; baseColors: Record<number, string | null>; progress: number }
    | { kind: 'block'; x: number; y: number; w: number; h: number; baseColor: string | null; progress: number };

interface UseEyedropperHoldOptions {
    activeLayerPixels: PixelData;
    brushSize: 1 | 2;
    cancelStroke: () => void;
    currentColor: string | null;
    currentTool: Tool;
    editorContainerRef: RefObject<HTMLDivElement | null>;
    isPointerDownRef: MutableRefObject<boolean>;
    palette: Palette;
    setIsDrawing: (drawing: boolean) => void;
}

export const useEyedropperHold = ({
    activeLayerPixels,
    brushSize,
    cancelStroke,
    currentColor,
    currentTool,
    editorContainerRef,
    isPointerDownRef,
    palette,
    setIsDrawing
}: UseEyedropperHoldOptions) => {
    const [isEyedropperActive, setIsEyedropperActive] = useState(false);
    const [pointerPos, setPointerPos] = useState<{ x: number, y: number } | null>(null);
    const [eyedropperTargetIndex, setEyedropperTargetIndex] = useState<number | null>(null);
    const [showDropperHint, setShowDropperHint] = useState(false);
    const [dropperHoldOverlay, setDropperHoldOverlay] = useState<DropperHoldOverlay | null>(null);
    const eyedropperTargetIndexRef = useRef<number | null>(null);
    const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const holdAnimationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const pointerStartPosRef = useRef<{ x: number, y: number } | null>(null);

    const getBrushFootprint = useCallback((index: number): number[] => {
        const x = index % GRID_SIZE;
        const y = Math.floor(index / GRID_SIZE);
        const points = [index];
        if (brushSize === 2 && (currentTool === 'brush' || currentTool === 'eraser')) {
            if (x + 1 < GRID_SIZE) points.push(index + 1);
            if (y + 1 < GRID_SIZE) points.push(index + GRID_SIZE);
            if (x + 1 < GRID_SIZE && y + 1 < GRID_SIZE) points.push(index + GRID_SIZE + 1);
        }
        return points;
    }, [brushSize, currentTool]);

    const setEyedropperTarget = useCallback((index: number | null) => {
        eyedropperTargetIndexRef.current = index;
        setEyedropperTargetIndex(index);
    }, []);

    const setEyedropperPointerPosition = useCallback((point: PointerCoords) => {
        setPointerPos({ x: point.clientX, y: point.clientY });
    }, []);

    const clearEyedropperPointerState = useCallback(() => {
        setEyedropperTarget(null);
        setPointerPos(null);
    }, [setEyedropperTarget]);

    const clearPendingHold = useCallback((options?: { clearPointerStart?: boolean }) => {
        if (longPressTimerRef.current) {
            clearTimeout(longPressTimerRef.current);
            longPressTimerRef.current = null;
        }
        if (holdAnimationTimerRef.current) {
            clearTimeout(holdAnimationTimerRef.current);
            holdAnimationTimerRef.current = null;
        }
        if (options?.clearPointerStart) {
            pointerStartPosRef.current = null;
        }
        setShowDropperHint(false);
        setDropperHoldOverlay(null);
    }, []);

    const finishEyedropper = useCallback(() => {
        setIsEyedropperActive(false);
        clearEyedropperPointerState();
        editorContainerRef.current?.classList.remove('hide-cursor');
    }, [clearEyedropperPointerState, editorContainerRef]);

    const beginEyedropperHold = useCallback((
        index: number,
        point: PointerCoords,
        pointerType: 'mouse' | 'touch' | 'pen'
    ) => {
        pointerStartPosRef.current = { x: point.clientX, y: point.clientY };
        clearPendingHold();

        const supportsHoldEyedropper = pointerType !== 'touch';
        if (!supportsHoldEyedropper || (currentTool !== 'brush' && currentTool !== 'fill' && currentTool !== 'eraser')) {
            return false;
        }

        holdAnimationTimerRef.current = setTimeout(() => {
            holdAnimationTimerRef.current = null;
            setShowDropperHint(true);
            if (brushSize === 2 && (currentTool === 'brush' || currentTool === 'eraser')) {
                const x = index % GRID_SIZE;
                const y = Math.floor(index / GRID_SIZE);
                setDropperHoldOverlay({
                    kind: 'block',
                    x,
                    y,
                    w: x + 1 < GRID_SIZE ? 2 : 1,
                    h: y + 1 < GRID_SIZE ? 2 : 1,
                    baseColor: getPixelColor(activeLayerPixels, index, palette),
                    progress: 0
                });
            } else {
                const holdIndices = getBrushFootprint(index);
                const baseColors: Record<number, string | null> = {};
                holdIndices.forEach((idx) => {
                    baseColors[idx] = currentTool === 'fill'
                        ? (currentColor ?? getPixelColor(activeLayerPixels, idx, palette))
                        : getPixelColor(activeLayerPixels, idx, palette);
                });
                setDropperHoldOverlay({ kind: 'cells', indices: holdIndices, baseColors, progress: 0 });
            }

            requestAnimationFrame(() => {
                setDropperHoldOverlay(prev => prev ? { ...prev, progress: 1 } : prev);
            });
        }, EYEDROPPER_HOLD_START_DELAY_MS);

        longPressTimerRef.current = setTimeout(() => {
            if (!isPointerDownRef.current) return;

            if (currentTool !== 'fill') {
                cancelStroke();
            }

            setIsEyedropperActive(true);
            setIsDrawing(false);
            editorContainerRef.current?.classList.add('hide-cursor');
            setEyedropperPointerPosition(point);
            setEyedropperTarget(index);
            setShowDropperHint(false);
            setDropperHoldOverlay(null);
        }, EYEDROPPER_HOLD_MS);

        return true;
    }, [
        activeLayerPixels,
        brushSize,
        cancelStroke,
        clearPendingHold,
        currentColor,
        currentTool,
        editorContainerRef,
        getBrushFootprint,
        isPointerDownRef,
        palette,
        setEyedropperPointerPosition,
        setEyedropperTarget,
        setIsDrawing
    ]);

    const cancelPendingHoldForMovement = useCallback((point: PointerCoords) => {
        if (!longPressTimerRef.current || !pointerStartPosRef.current) return false;

        const dist = Math.hypot(
            point.clientX - pointerStartPosRef.current.x,
            point.clientY - pointerStartPosRef.current.y
        );
        if (dist <= HOLD_CANCEL_DISTANCE_PX) return false;

        clearPendingHold();
        return true;
    }, [clearPendingHold]);

    useEffect(() => {
        return () => {
            if (longPressTimerRef.current) {
                clearTimeout(longPressTimerRef.current);
            }
            if (holdAnimationTimerRef.current) {
                clearTimeout(holdAnimationTimerRef.current);
            }
        };
    }, []);

    return {
        beginEyedropperHold,
        cancelPendingHoldForMovement,
        clearEyedropperPointerState,
        clearPendingHold,
        dropperHoldOverlay,
        eyedropperTargetIndex,
        eyedropperTargetIndexRef,
        finishEyedropper,
        isEyedropperActive,
        pointerPos,
        setEyedropperPointerPosition,
        setEyedropperTarget,
        showDropperHint
    };
};
