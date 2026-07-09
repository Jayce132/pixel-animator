import { useCallback, useEffect, useRef, useState } from 'react';
import type { MutableRefObject, RefObject } from 'react';

interface Point {
    x: number;
    y: number;
}

interface GestureTransform {
    startDistance: number;
    startCenter: Point;
    startPan: Point;
    startZoom: number;
}

interface PanStart {
    x: number;
    y: number;
    offsetX: number;
    offsetY: number;
}

interface UsePanZoomOptions {
    minZoom: number;
    maxZoom: number;
    workspaceRef: RefObject<HTMLDivElement | null>;
    stackButtonRef: RefObject<HTMLButtonElement | null>;
    cancelActiveInteractionRef: MutableRefObject<() => void>;
}

export const usePanZoom = ({
    minZoom,
    maxZoom,
    workspaceRef,
    stackButtonRef,
    cancelActiveInteractionRef
}: UsePanZoomOptions) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
    const [viewZoom, setViewZoom] = useState(1);
    const panOffsetRef = useRef(panOffset);
    const viewZoomRef = useRef(viewZoom);
    const activeTouchPointerIdsRef = useRef<Set<number>>(new Set());
    const activeTouchPointsRef = useRef<Map<number, Point>>(new Map());
    const isGestureZoomingRef = useRef(false);
    const gestureTransformRef = useRef<GestureTransform | null>(null);
    const isPanningRef = useRef(false);
    const panStartRef = useRef<PanStart | null>(null);

    useEffect(() => {
        panOffsetRef.current = panOffset;
    }, [panOffset]);

    useEffect(() => {
        viewZoomRef.current = viewZoom;
    }, [viewZoom]);

    const clampPanOffset = useCallback((nextX: number, nextY: number) => {
        const container = containerRef.current;
        const workspace = workspaceRef.current;
        if (!container || !workspace) {
            return { x: nextX, y: nextY };
        }

        const minVisible = 48;
        const containerW = container.clientWidth;
        const containerH = container.clientHeight;
        const workspaceW = workspace.offsetWidth;
        let workspaceH = workspace.offsetHeight;

        if (stackButtonRef.current) {
            const btnParent = stackButtonRef.current.offsetParent as HTMLElement | null;
            if (btnParent) {
                const protrusion = Math.max(
                    0,
                    stackButtonRef.current.offsetTop + stackButtonRef.current.offsetHeight - btnParent.offsetHeight
                );
                workspaceH += protrusion;
            }
        }

        const maxX = (containerW + workspaceW) / 2 - minVisible;
        const minX = -(containerW + workspaceW) / 2 + minVisible;
        const maxY = (containerH + workspaceH) / 2 - minVisible;
        const minY = -(containerH + workspaceH) / 2 + minVisible;

        return {
            x: Math.max(minX, Math.min(maxX, nextX)),
            y: Math.max(minY, Math.min(maxY, nextY))
        };
    }, [stackButtonRef, workspaceRef]);

    const getTouchGestureMetrics = useCallback(() => {
        const points = Array.from(activeTouchPointsRef.current.values());
        if (points.length < 2) return null;

        const [first, second] = points;
        return {
            center: {
                x: (first.x + second.x) / 2,
                y: (first.y + second.y) / 2
            },
            distance: Math.hypot(second.x - first.x, second.y - first.y)
        };
    }, []);

    const startTouchGestureTransform = useCallback(() => {
        const metrics = getTouchGestureMetrics();
        if (!metrics) return;

        gestureTransformRef.current = {
            startDistance: Math.max(metrics.distance, 1),
            startCenter: metrics.center,
            startPan: panOffsetRef.current,
            startZoom: viewZoomRef.current
        };
    }, [getTouchGestureMetrics]);

    const trackTouchPointer = useCallback((pointerId: number, point: Point) => {
        activeTouchPointerIdsRef.current.add(pointerId);
        activeTouchPointsRef.current.set(pointerId, point);
    }, []);

    const updateTouchPointer = useCallback((pointerId: number, point: Point) => {
        if (activeTouchPointerIdsRef.current.has(pointerId)) {
            activeTouchPointsRef.current.set(pointerId, point);
        }
    }, []);

    const removeTouchPointer = useCallback((pointerId: number) => {
        activeTouchPointerIdsRef.current.delete(pointerId);
        activeTouchPointsRef.current.delete(pointerId);
    }, []);

    const getTouchPointerCount = useCallback(() => activeTouchPointerIdsRef.current.size, []);

    const beginTouchGesture = useCallback(() => {
        isGestureZoomingRef.current = true;
        startTouchGestureTransform();
    }, [startTouchGestureTransform]);

    const isGestureZooming = useCallback(() => isGestureZoomingRef.current, []);

    const clearGestureTransform = useCallback(() => {
        gestureTransformRef.current = null;
    }, []);

    const stopGestureZooming = useCallback(() => {
        isGestureZoomingRef.current = false;
    }, []);

    const updateTouchGestureZoom = useCallback(() => {
        const metrics = getTouchGestureMetrics();
        const gesture = gestureTransformRef.current;
        if (!metrics || !gesture) return false;

        const nextZoom = Math.max(
            minZoom,
            Math.min(maxZoom, gesture.startZoom * (metrics.distance / gesture.startDistance))
        );
        setViewZoom(nextZoom);
        setPanOffset(clampPanOffset(
            gesture.startPan.x + (metrics.center.x - gesture.startCenter.x),
            gesture.startPan.y + (metrics.center.y - gesture.startCenter.y)
        ));
        return true;
    }, [clampPanOffset, getTouchGestureMetrics, maxZoom, minZoom]);

    const beginPan = useCallback((clientX: number, clientY: number) => {
        isPanningRef.current = true;
        panStartRef.current = {
            x: clientX,
            y: clientY,
            offsetX: panOffsetRef.current.x,
            offsetY: panOffsetRef.current.y
        };
        if (containerRef.current) containerRef.current.style.cursor = 'grabbing';
    }, []);

    const updatePan = useCallback((clientX: number, clientY: number) => {
        if (!isPanningRef.current || !panStartRef.current || !containerRef.current) return false;

        const dx = clientX - panStartRef.current.x;
        const dy = clientY - panStartRef.current.y;
        setPanOffset(clampPanOffset(
            panStartRef.current.offsetX + dx,
            panStartRef.current.offsetY + dy
        ));
        return true;
    }, [clampPanOffset]);

    const isPanning = useCallback(() => isPanningRef.current, []);

    const endPan = useCallback(() => {
        isPanningRef.current = false;
        panStartRef.current = null;
        if (containerRef.current) containerRef.current.style.cursor = 'default';
    }, []);

    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const onWheel = (e: WheelEvent) => {
            e.preventDefault();
            // Ctrl+wheel is trackpad pinch on Chromium; plain wheel/touchpad should also zoom.
            const factor = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0025));
            setViewZoom(prev => Math.max(minZoom, Math.min(maxZoom, prev * factor)));
        };

        container.addEventListener('wheel', onWheel, { passive: false });
        return () => {
            container.removeEventListener('wheel', onWheel);
        };
    }, [maxZoom, minZoom]);

    useEffect(() => {
        let lastScale = 1;
        const onGestureStart = (event: Event) => {
            event.preventDefault();
            lastScale = 1;
            isGestureZoomingRef.current = true;
            cancelActiveInteractionRef.current();
        };
        const onGestureChange = (event: Event) => {
            event.preventDefault();
            if (gestureTransformRef.current) return;
            const e = event as Event & { scale?: number };
            const scale = typeof e.scale === 'number' ? e.scale : 1;
            const delta = scale / Math.max(lastScale, 0.0001);
            lastScale = scale;
            setViewZoom(prev => Math.max(minZoom, Math.min(maxZoom, prev * delta)));
        };
        const onGestureEnd = (event: Event) => {
            event.preventDefault();
            lastScale = 1;
            gestureTransformRef.current = null;
            if (activeTouchPointerIdsRef.current.size === 0) {
                isGestureZoomingRef.current = false;
            }
        };

        // Safari gesture events (pinch). Attach broadly to block page zoom and route to workspace zoom.
        document.addEventListener('gesturestart', onGestureStart as EventListener, { passive: false });
        document.addEventListener('gesturechange', onGestureChange as EventListener, { passive: false });
        document.addEventListener('gestureend', onGestureEnd as EventListener, { passive: false });

        return () => {
            document.removeEventListener('gesturestart', onGestureStart as EventListener);
            document.removeEventListener('gesturechange', onGestureChange as EventListener);
            document.removeEventListener('gestureend', onGestureEnd as EventListener);
        };
    }, [cancelActiveInteractionRef, maxZoom, minZoom]);

    return {
        activeTouchPointerIdsRef,
        activeTouchPointsRef,
        beginPan,
        beginTouchGesture,
        clampPanOffset,
        clearGestureTransform,
        containerRef,
        endPan,
        gestureTransformRef,
        getTouchPointerCount,
        getTouchGestureMetrics,
        isGestureZooming,
        isGestureZoomingRef,
        isPanning,
        isPanningRef,
        panOffset,
        panStartRef,
        removeTouchPointer,
        setPanOffset,
        setViewZoom,
        startTouchGestureTransform,
        stopGestureZooming,
        trackTouchPointer,
        updatePan,
        updateTouchGestureZoom,
        updateTouchPointer,
        viewZoom
    };
};
