import React, { useRef, useEffect, useState, useCallback } from 'react';
import { useEditor } from '../../contexts/EditorContext';
import { calculateLassoSelection } from '../../utils/lasso';
import { getLinePixels } from '../../utils/draw';
import { MagnifyingGlass } from '../MagnifyingGlass';
import { GRID_SIZE } from '../../types';

interface PixelProps {
    index: number;
    color: string | null;
    isSelected: boolean;
    isFloating: boolean;
    isStamping: boolean;
    onMouseDown: (index: number, e: React.MouseEvent<HTMLDivElement>) => void;
    onMouseEnter: (index: number) => void;
    onMouseUp: () => void;
}

const MemoizedPixel: React.FC<PixelProps> = React.memo(({
    index,
    color,
    isSelected,
    isFloating,
    isStamping,
    onMouseDown,
    onMouseEnter,
    onMouseUp
}) => (
    <div
        className={`pixel ${color ? 'has-color' : ''} ${isSelected ? 'is-selected' : ''} ${isFloating ? 'is-floating' : ''} ${isStamping && isFloating ? 'stamping' : ''}`}
        style={color ? { backgroundColor: color, '--pixel-color': color } as React.CSSProperties : undefined}
        onMouseDown={(e) => onMouseDown(index, e)}
        onMouseEnter={() => onMouseEnter(index)}
        onMouseUp={onMouseUp}
    />
));

export const Editor: React.FC = () => {
    const EYEDROPPER_HOLD_MS = 2000;
    const MIN_VIEW_ZOOM = 0.5;
    const MAX_VIEW_ZOOM = 4;
    const editorContainerRef = useRef<HTMLDivElement>(null);
    // Track if drag started inside or outside selection to mask cursor visibility
    const [dragOrigin, setDragOrigin] = React.useState<'inside' | 'outside' | null>(null);
    const dragOriginRef = useRef<'inside' | 'outside' | null>(null);

    const {
        activeSprite,
        updatePixel,
        isDrawing,
        setIsDrawing,
        currentTool,
        fill,
        selectedPixels,
        addToSelection,
        setSelectedPixels,
        clearSelection,
        // nudgeSelection, // Removed unused
        liftSelection,
        floatingLayer,
        isPlaying,
        isOnionSkinning,
        sprites,
        activeSpriteId,
        currentColor,
        setCurrentColor,
        isStamping,
        brushSize,
        addSelectionBatch,
        cancelStroke,
        setTool,
        activeLayer,
        setActiveLayer,
        isOverlayStacked,
        setIsOverlayStacked
    } = useEditor();

    const activeSpriteIndex = sprites.findIndex(s => s.id === activeSpriteId);
    const prevSprite = activeSpriteIndex > 0 ? sprites[activeSpriteIndex - 1] : null;

    // Use a ref to track if we stamped/ lasso-ed on this specific interaction
    const isLassoingRef = useRef(false);
    // Track last pixel for interpolation
    const lastPixelIndexRef = useRef<number | null>(null);
    const strokeStartIndexRef = useRef<number | null>(null);
    const strokeEndIndexRef = useRef<number | null>(null);
    const hasMovedInStrokeRef = useRef(false);
    const hasLeftCircleDetonatorRef = useRef(false);
    const isLineModeActiveRef = useRef(false);
    const isCircleModeActiveRef = useRef(false);
    const isAltPressedRef = useRef(false);

    // Nudge Selection Keyboard Listener REMOVED (Moved to Global Hook)
    // useEffect(() => {
    //     // ... logic moved to useKeyboardShortcuts
    // }, []);

    // Track zoom state for 1x brush
    const [isZoomed, setIsZoomed] = React.useState(false);
    const zoomFocusRef = useRef<{ x: number, y: number } | null>(null);

    // Eyedropper State
    const [isEyedropperActive, setIsEyedropperActive] = useState(false);
    const [pointerPos, setPointerPos] = useState<{ x: number, y: number } | null>(null);
    const [hoveredGridIndex, setHoveredGridIndex] = useState<number | null>(null);
    const hoveredGridIndexRef = useRef<number | null>(null);
    const [linePreviewPixels, setLinePreviewPixels] = useState<number[]>([]);
    const [circlePreviewPixels, setCirclePreviewPixels] = useState<number[]>([]);
    const [showDropperHint, setShowDropperHint] = useState(false);
    const [shapeHintMode, setShapeHintMode] = useState<'line' | 'circle' | null>(null);
    const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
    const [viewZoom, setViewZoom] = useState(1);
    const [dropperHoldOverlay, setDropperHoldOverlay] = useState<
        | { kind: 'cells'; indices: number[]; baseColors: Record<number, string | null>; progress: number }
        | { kind: 'block'; x: number; y: number; w: number; h: number; baseColor: string | null; progress: number }
        | null
    >(null);

    // Refs for Long Press Logic
    const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const pointerStartPosRef = useRef<{ x: number, y: number } | null>(null);
    const isPointerDownRef = useRef(false);
    const pendingFillPixelRef = useRef<number | null>(null);
    const isPanningRef = useRef(false);
    const panStartRef = useRef<{ x: number; y: number; offsetX: number; offsetY: number } | null>(null);
    const shapeHintModeRef = useRef<'line' | 'circle' | null>(null);
    const workspaceRef = useRef<HTMLDivElement>(null);
    const stackButtonRef = useRef<HTMLButtonElement>(null);

    // Reset zoom when switching brushes
    useEffect(() => {
        if (brushSize === 2) {
            setIsZoomed(false);
        } else {
            // Suggest zooming by not being zoomed yet?
            // User requested: "clicking on 1x before it zooms in" -> Start un-zoomed.
            setIsZoomed(false);
        }
    }, [brushSize]);

    useEffect(() => {
        if (isOverlayStacked && activeLayer !== 'top') {
            setActiveLayer('top');
        }
    }, [isOverlayStacked, activeLayer, setActiveLayer]);

    // Handle Scroll on Zoom
    const containerRef = useRef<HTMLDivElement>(null);
    React.useLayoutEffect(() => {
        if (isZoomed && zoomFocusRef.current && containerRef.current) {
            const { x, y } = zoomFocusRef.current;
            const container = containerRef.current;

            // Editor is now 926px wide.
            // 32 units. Each unit is ~28.9px
            const pixelSize = (463 * 2) / 32;

            // Calculate center scroll
            const scrollLeft = (x * pixelSize) - (container.clientWidth / 2) + (pixelSize / 2);
            const scrollTop = (y * pixelSize) - (container.clientHeight / 2) + (pixelSize / 2);

            container.scrollTo({
                left: scrollLeft,
                top: scrollTop,
                behavior: 'smooth'
            });
        }
    }, [isZoomed]);

    const highlightRef = useRef<HTMLDivElement>(null);

    const styles = React.useMemo(() => {
        // Precise Pixel Calculation
        // Editor Base Width: 463px
        // Grid Size: 32
        const BASE_PIXEL = 463 / 32; // ~14.46875px

        // Target Container Size (The actual visual footprint)
        // 1x Unzoomed: 1 cell (~14.47px)
        // 1x Zoomed / 2x: 2 cells worth (~28.94px) - representing 1 scaled pixel or 2x2 real pixels
        const containerSize = (brushSize === 1 && !isZoomed) ? BASE_PIXEL : (BASE_PIXEL * 2);

        // Inner drawing size (smaller than pixel as requested)
        // Previous pad was 1 (border). New pad:
        // Try to make it ~10-15% smaller visually.
        // For ~14px, pad 3px -> 8px box.
        // For ~29px, pad 6px -> 17px box.
        const pad = (brushSize === 1 && !isZoomed) ? 3 : 6;
        const drawSize = containerSize - (pad * 2);

        if (currentTool === 'brush') {
            const half = containerSize / 2;
            const hotspotX = brushSize === 2 ? 0 : half;
            const hotspotY = brushSize === 2 ? 0 : half;

            const svg = `
                <svg width="${containerSize}" height="${containerSize}" viewBox="0 0 ${containerSize} ${containerSize}" xmlns="http://www.w3.org/2000/svg">
                    <rect x="${pad}" y="${pad}" width="${drawSize}" height="${drawSize}" fill="${currentColor}" stroke="white" stroke-width="1" />
                </svg>
            `;
            // Faint cursor for mask
            const faintSvg = `
                <svg width="${containerSize}" height="${containerSize}" viewBox="0 0 ${containerSize} ${containerSize}" xmlns="http://www.w3.org/2000/svg">
                    <rect x="${pad}" y="${pad}" width="${drawSize}" height="${drawSize}" fill="${currentColor}" stroke="white" stroke-width="1" opacity="0.3" />
                </svg>
            `;
            // Keep selection cursor standard (or maybe remove it if we have highlight?)
            // Let's keep distinct 'glow' for selection
            const glowSvg = `
                <svg width="${containerSize}" height="${containerSize}" viewBox="0 0 ${containerSize} ${containerSize}" xmlns="http://www.w3.org/2000/svg">
                     <defs>
                        <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
                            <feGaussianBlur stdDeviation="2" result="coloredBlur"/>
                            <feMerge>
                                <feMergeNode in="coloredBlur"/>
                                <feMergeNode in="SourceGraphic"/>
                            </feMerge>
                        </filter>
                    </defs>
                    <rect x="${pad}" y="${pad}" width="${drawSize}" height="${drawSize}" fill="${currentColor || 'none'}" stroke="white" stroke-width="2" filter="url(#glow)" />
                </svg>
            `;

            return {
                cursorStyle: { cursor: `url('data:image/svg+xml;utf8,${encodeURIComponent(svg)}') ${hotspotX} ${hotspotY}, auto` },
                faintCursorStyle: `url('data:image/svg+xml;utf8,${encodeURIComponent(faintSvg)}') ${hotspotX} ${hotspotY}, auto`,
                selectionCursorStyle: { cursor: `url('data:image/svg+xml;utf8,${encodeURIComponent(glowSvg)}') ${hotspotX} ${hotspotY}, auto` }
            };
        }

        // ... (Keep other tools same, maybe adjust padding too if needed, but primarily brush was requested)
        // Logic for others remains similar to previous step, keeping brevity here for replacement
        if (currentTool === 'eraser') {
            const half = containerSize / 2;
            const hotspotX = brushSize === 2 ? 0 : half;
            const hotspotY = brushSize === 2 ? 0 : half;
            const svg = `
                <svg width="${containerSize}" height="${containerSize}" viewBox="0 0 ${containerSize} ${containerSize}" xmlns="http://www.w3.org/2000/svg">
                    <rect x="${pad}" y="${pad}" width="${drawSize}" height="${drawSize}" fill="#2d2d2d" stroke="#3e3e3e" stroke-width="1" />
                    <line x1="${containerSize - pad}" y1="${pad}" x2="${pad}" y2="${containerSize - pad}" stroke="#ff3333" stroke-width="2" />
                </svg>
            `;
            const faintSvg = `
                <svg width="${containerSize}" height="${containerSize}" viewBox="0 0 ${containerSize} ${containerSize}" xmlns="http://www.w3.org/2000/svg">
                     <g opacity="0.3">
                        <rect x="${pad}" y="${pad}" width="${drawSize}" height="${drawSize}" fill="#2d2d2d" stroke="#3e3e3e" stroke-width="1" />
                        <line x1="${containerSize - pad}" y1="${pad}" x2="${pad}" y2="${containerSize - pad}" stroke="#ff3333" stroke-width="2" />
                    </g>
                </svg>
            `;
            return {
                cursorStyle: { cursor: `url('data:image/svg+xml;utf8,${encodeURIComponent(svg)}') ${hotspotX} ${hotspotY}, auto` },
                faintCursorStyle: `url('data:image/svg+xml;utf8,${encodeURIComponent(faintSvg)}') ${hotspotX} ${hotspotY}, auto`,
                selectionCursorStyle: { cursor: 'default' }
            };
        }

        // Keep Select/Fill logic standard but refreshed with new params
        if (currentTool === 'select') {
            const svgSize = BASE_PIXEL; // Always 1x
            const half = svgSize / 2;
            const svg = `
                <svg width="${svgSize}" height="${svgSize}" viewBox="0 0 ${svgSize} ${svgSize}" xmlns="http://www.w3.org/2000/svg">
                   <defs>
                        <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
                            <feGaussianBlur stdDeviation="2" result="coloredBlur"/>
                            <feMerge>
                                <feMergeNode in="coloredBlur"/>
                                <feMergeNode in="SourceGraphic"/>
                            </feMerge>
                        </filter>
                    </defs>
                    <rect x="2" y="2" width="${svgSize - 4}" height="${svgSize - 4}" fill="none" stroke="white" stroke-width="2" filter="url(#glow)" />
                </svg>
            `;
            return { cursorStyle: { cursor: `url('data:image/svg+xml;utf8,${encodeURIComponent(svg)}') ${half} ${half}, auto` }, faintCursorStyle: 'default', selectionCursorStyle: { cursor: 'default' } };
        }
        if (currentTool === 'fill') {
            // Fill should also feel like "1px" precision
            const iconSize = BASE_PIXEL * 2; // Container needs to be big enough to rotate
            const baseSide = BASE_PIXEL; // The bucket itself matches the grid cell size (~14.5px)

            const center = iconSize / 2;
            const offset = (iconSize - baseSide) / 2;

            const svg = `
                <svg width="${iconSize}" height="${iconSize}" viewBox="0 0 ${iconSize} ${iconSize}" xmlns="http://www.w3.org/2000/svg">
                    <rect x="${offset}" y="${offset}" width="${baseSide}" height="${baseSide}" fill="${currentColor || 'none'}" stroke="white" stroke-width="1" transform="rotate(45, ${center}, ${center})" />
                </svg>
            `;
            const glowSvg = `
                <svg width="${iconSize}" height="${iconSize}" viewBox="0 0 ${iconSize} ${iconSize}" xmlns="http://www.w3.org/2000/svg">
                     <defs>
                        <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
                            <feGaussianBlur stdDeviation="2" result="coloredBlur"/>
                            <feMerge>
                                <feMergeNode in="coloredBlur"/>
                                <feMergeNode in="SourceGraphic"/>
                            </feMerge>
                        </filter>
                    </defs>
                    <rect x="${offset + 2}" y="${offset + 2}" width="${baseSide - 4}" height="${baseSide - 4}" fill="${currentColor || 'none'}" stroke="white" stroke-width="2" filter="url(#glow)" transform="rotate(45, ${center}, ${center})" />
                </svg>
            `;
            return {
                cursorStyle: { cursor: `url('data:image/svg+xml;utf8,${encodeURIComponent(svg)}') ${center} ${center}, auto` },
                faintCursorStyle: `url('data:image/svg+xml;utf8,${encodeURIComponent(svg)}') ${center} ${center}, auto`,
                selectionCursorStyle: { cursor: `url('data:image/svg+xml;utf8,${encodeURIComponent(glowSvg)}') ${center} ${center}, auto` }
            };
        }
        return { cursorStyle: { cursor: 'default' }, faintCursorStyle: 'default', selectionCursorStyle: { cursor: 'default' } };
    }, [currentTool, currentColor, brushSize, isZoomed]);

    // Deconstruct styles
    const { cursorStyle, faintCursorStyle, selectionCursorStyle } = styles;

    const workingSprite = activeSprite ?? sprites[0] ?? {
        pixelData: new Array(GRID_SIZE * GRID_SIZE).fill(null),
        overlayPixelData: new Array(GRID_SIZE * GRID_SIZE).fill(null)
    };
    const editingLayer: 'base' | 'top' = isOverlayStacked ? 'top' : activeLayer;
    const activeLayerPixels = editingLayer === 'base' ? workingSprite.pixelData : workingSprite.overlayPixelData;
    const inactiveLayerPixels = editingLayer === 'base' ? workingSprite.overlayPixelData : workingSprite.pixelData;
    const showTopOnlyWhileSelecting = isOverlayStacked && currentTool === 'select' && isDrawing;
    const displayPixels = isOverlayStacked
        ? (showTopOnlyWhileSelecting
            ? workingSprite.overlayPixelData
            : workingSprite.pixelData.map((base, i) => workingSprite.overlayPixelData[i] ?? base))
        : activeLayerPixels;

    const getCirclePixelsFromDiameter = (startIndex: number, endIndex: number): number[] => {
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
    };

    const getBrushFootprint = (index: number): number[] => {
        const x = index % GRID_SIZE;
        const y = Math.floor(index / GRID_SIZE);
        const points = [index];
        if (brushSize === 2 && (currentTool === 'brush' || currentTool === 'eraser')) {
            if (x + 1 < GRID_SIZE) points.push(index + 1);
            if (y + 1 < GRID_SIZE) points.push(index + GRID_SIZE);
            if (x + 1 < GRID_SIZE && y + 1 < GRID_SIZE) points.push(index + GRID_SIZE + 1);
        }
        return points;
    };

    const isWithinCircleDetonator = (startIndex: number, currentIndex: number): boolean => {
        const sx = startIndex % GRID_SIZE;
        const sy = Math.floor(startIndex / GRID_SIZE);
        const cx = currentIndex % GRID_SIZE;
        const cy = Math.floor(currentIndex / GRID_SIZE);
        // 5x5 activation zone around start pixel.
        return Math.abs(cx - sx) <= 2 && Math.abs(cy - sy) <= 2;
    };

    const handleMouseDown = (index: number, e: React.MouseEvent<HTMLDivElement>) => {
        if (isEyedropperActive) return;

        hoveredGridIndexRef.current = index;
        setHoveredGridIndex(index);

        isPointerDownRef.current = true;
        pointerStartPosRef.current = { x: e.clientX, y: e.clientY };
        if (longPressTimerRef.current) {
            clearTimeout(longPressTimerRef.current);
            longPressTimerRef.current = null;
        }

        if (currentTool === 'brush' || currentTool === 'fill' || currentTool === 'eraser') {
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
                    baseColor: activeLayerPixels[index],
                    progress: 0
                });
            } else {
                const holdIndices = getBrushFootprint(index);
                const baseColors: Record<number, string | null> = {};
                holdIndices.forEach((idx) => {
                    baseColors[idx] = currentTool === 'fill'
                        ? (currentColor ?? activeLayerPixels[idx])
                        : activeLayerPixels[idx];
                });
                setDropperHoldOverlay({ kind: 'cells', indices: holdIndices, baseColors, progress: 0 });
            }
            requestAnimationFrame(() => {
                setDropperHoldOverlay(prev => prev ? { ...prev, progress: 1 } : prev);
            });
            longPressTimerRef.current = setTimeout(() => {
                if (isPointerDownRef.current) {
                    if (currentTool !== 'fill') {
                        cancelStroke();
                    }

                    setIsEyedropperActive(true);
                    setIsDrawing(false);
                    if (editorContainerRef.current) editorContainerRef.current.classList.add('hide-cursor');
                    setPointerPos({ x: e.clientX, y: e.clientY });
                    hoveredGridIndexRef.current = index;
                    setHoveredGridIndex(index);
                    setShowDropperHint(false);
                    setDropperHoldOverlay(null);
                }
            }, EYEDROPPER_HOLD_MS);
        }

        isLineModeActiveRef.current = false;
        isCircleModeActiveRef.current = false;
        setLinePreviewPixels([]);
        setCirclePreviewPixels([]);
        setShapeHintMode(null);
        shapeHintModeRef.current = null;
        strokeStartIndexRef.current = index;
        strokeEndIndexRef.current = index;
        hasMovedInStrokeRef.current = false;
        hasLeftCircleDetonatorRef.current = false;

        // Reset last pixel on new stroke
        lastPixelIndexRef.current = index;

        // Check where drag started (Masking only for Brush/Eraser to Faint, not Select or Fill)
        if (currentTool === 'brush' || currentTool === 'eraser') {
            const region = selectedPixels.has(index) ? 'inside' : 'outside';
            setDragOrigin(region);
            dragOriginRef.current = region;
        }

        if (currentTool === 'fill') {
            pendingFillPixelRef.current = index;
            // fill(index); // Deferred until Pointer Up (Safety Catch)
            return;
        }

        if (currentTool === 'select') {
            if (!selectedPixels.has(index)) {
                if (selectedPixels.size > 0) {
                    clearSelection();
                }
                isLassoingRef.current = true;
                setIsDrawing(true);
                addToSelection(index);
            }
            return;
        }

        setIsDrawing(true);
        updatePixel(index, dragOriginRef.current);
    };

    const handleMouseEnter = (index: number) => {
        hoveredGridIndexRef.current = index;
        if (isEyedropperActive) {
            setHoveredGridIndex(index);
        }
        if (isEyedropperActive) return;

        if (isCircleModeActiveRef.current) {
            if (strokeEndIndexRef.current !== index) {
                strokeEndIndexRef.current = index;
                const circleStart = strokeStartIndexRef.current;
                if (circleStart !== null) {
                    const circlePixels = getCirclePixelsFromDiameter(circleStart, index).filter((idx) => {
                        if (dragOriginRef.current === 'inside') return selectedPixels.has(idx);
                        if (dragOriginRef.current === 'outside') return !selectedPixels.has(idx);
                        return true;
                    });
                    setCirclePreviewPixels(circlePixels);
                }
            }
            return;
        }

        if (isLineModeActiveRef.current) {
            if (strokeEndIndexRef.current !== index) {
                strokeEndIndexRef.current = index;
                const lineStart = strokeStartIndexRef.current;
                if (lineStart !== null) {
                    const linePixels = getLinePixels(lineStart, index).filter((idx) => {
                        if (dragOriginRef.current === 'inside') return selectedPixels.has(idx);
                        if (dragOriginRef.current === 'outside') return !selectedPixels.has(idx);
                        return true;
                    });
                    setLinePreviewPixels(linePixels);
                }
            }
            return;
        }

        // Update Highlight Div
        if (highlightRef.current) {
            const col = index % 32;
            const row = Math.floor(index / 32);

            // Use percentages for perfect scaling compatibility
            const cellPercent = 100 / 32; // ~3.125% per cell

            // Brush/Eraser use brushSize. Fill/Select always use 1x.
            const isLarge = brushSize === 2 && (currentTool === 'brush' || currentTool === 'eraser');
            const size = isLarge ? 2 : 1;

            highlightRef.current.style.left = `${col * cellPercent}%`;
            highlightRef.current.style.top = `${row * cellPercent}%`;
            highlightRef.current.style.width = `${size * cellPercent}%`;
            highlightRef.current.style.height = `${size * cellPercent}%`;

            // Dynamic color/border for feedback?
            // Use a solid border that contrasts well
            highlightRef.current.style.borderColor = 'rgba(255, 255, 255, 0.5)';
            highlightRef.current.style.display = 'block';
        }

        if (isDrawing) {
            if (currentTool === 'brush' || currentTool === 'eraser') {
                if (strokeEndIndexRef.current !== null && strokeEndIndexRef.current !== index) {
                    hasMovedInStrokeRef.current = true;
                    setShowDropperHint(false);
                    if (longPressTimerRef.current) {
                        clearTimeout(longPressTimerRef.current);
                        longPressTimerRef.current = null;
                    }
                    setDropperHoldOverlay(null);
                }
                strokeEndIndexRef.current = index;
                const strokeStart = strokeStartIndexRef.current;
                if (strokeStart !== null && !isWithinCircleDetonator(strokeStart, index)) {
                    hasLeftCircleDetonatorRef.current = true;
                }
                if (currentTool === 'brush' && hasMovedInStrokeRef.current && strokeStart !== null) {
                    const mode: 'line' | 'circle' =
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
                        const circlePixels = getCirclePixelsFromDiameter(strokeStart, index).filter((idx) => {
                            if (dragOriginRef.current === 'inside') return selectedPixels.has(idx);
                            if (dragOriginRef.current === 'outside') return !selectedPixels.has(idx);
                            return true;
                        });
                        setCirclePreviewPixels(circlePixels);
                        return;
                    }

                    if (strokeStart !== null) {
                        isCircleModeActiveRef.current = false;
                        isLineModeActiveRef.current = true;
                        setCirclePreviewPixels([]);
                        const linePixels = getLinePixels(strokeStart, index).filter((idx) => {
                            if (dragOriginRef.current === 'inside') return selectedPixels.has(idx);
                            if (dragOriginRef.current === 'outside') return !selectedPixels.has(idx);
                            return true;
                        });
                        setLinePreviewPixels(linePixels);
                        return;
                    }
                }
            }

            // Optimization & Constraint:
            // If masked (drag started 'inside' but now 'outside', or vice-versa),
            // update cursor visuals.
            const isMasked = (dragOrigin === 'inside' && !selectedPixels.has(index)) ||
                (dragOrigin === 'outside' && selectedPixels.has(index));

            if (isMasked) {
                if (editorContainerRef.current) editorContainerRef.current.classList.add('cursor-masked');
            } else {
                if (editorContainerRef.current) editorContainerRef.current.classList.remove('cursor-masked');
            }

            // Helper to check if a specific pixel can be painted based on start origin
            const canPaint = (idx: number) => {
                if (dragOriginRef.current === 'inside') return selectedPixels.has(idx);
                if (dragOriginRef.current === 'outside') return !selectedPixels.has(idx);
                return true;
            };

            if (currentTool === 'select') {
                if (lastPixelIndexRef.current !== null && lastPixelIndexRef.current !== index) {
                    const pixels = getLinePixels(lastPixelIndexRef.current, index);
                    // Batch update for performance
                    addSelectionBatch(pixels);
                } else {
                    addSelectionBatch([index]);
                }
                lastPixelIndexRef.current = index;
                return;
            }

            // Interpolate line from last pixel to current
            if (lastPixelIndexRef.current !== null && lastPixelIndexRef.current !== index) {
                const pixels = getLinePixels(lastPixelIndexRef.current, index);
                pixels.forEach(idx => {
                    if (canPaint(idx)) updatePixel(idx, dragOriginRef.current);
                });
            } else {
                if (canPaint(index)) updatePixel(index, dragOriginRef.current);
            }

            // Always update last position so the line 'follows' even through masks
            // This prevents "slashing" artifacts if you exit and re-enter a valid zone
            lastPixelIndexRef.current = index;
        }
    };

    const handleMouseUp = () => {
        isPointerDownRef.current = false;
        if (longPressTimerRef.current) {
            clearTimeout(longPressTimerRef.current);
            longPressTimerRef.current = null;
        }
        if (isLineModeActiveRef.current && (currentTool === 'brush' || currentTool === 'eraser')) {
            const lineStart = strokeStartIndexRef.current;
            const lineEnd = strokeEndIndexRef.current;
            if (lineStart !== null && lineEnd !== null) {
                const linePixels = getLinePixels(lineStart, lineEnd).filter((idx) => {
                    if (dragOriginRef.current === 'inside') return selectedPixels.has(idx);
                    if (dragOriginRef.current === 'outside') return !selectedPixels.has(idx);
                    return true;
                });
                linePixels.forEach((idx) => {
                    updatePixel(idx, dragOriginRef.current);
                });
            }
            isLineModeActiveRef.current = false;
            setLinePreviewPixels([]);
            setTool('brush');
            setShowDropperHint(false);
            setDropperHoldOverlay(null);
            setShapeHintMode(null);
            shapeHintModeRef.current = null;
        }
        if (isCircleModeActiveRef.current && (currentTool === 'brush' || currentTool === 'eraser')) {
            const circleStart = strokeStartIndexRef.current;
            const circleEnd = strokeEndIndexRef.current;
            if (circleStart !== null && circleEnd !== null) {
                const circlePixels = getCirclePixelsFromDiameter(circleStart, circleEnd).filter((idx) => {
                    if (dragOriginRef.current === 'inside') return selectedPixels.has(idx);
                    if (dragOriginRef.current === 'outside') return !selectedPixels.has(idx);
                    return true;
                });
                circlePixels.forEach((idx) => {
                    updatePixel(idx, dragOriginRef.current);
                });
            }
            isCircleModeActiveRef.current = false;
            setCirclePreviewPixels([]);
            setTool('brush');
            setShowDropperHint(false);
            setDropperHoldOverlay(null);
            setShapeHintMode(null);
            shapeHintModeRef.current = null;
        }

        if (currentTool === 'select' && isLassoingRef.current) {
            // Lasso Release Logic
            const fullSelection = calculateLassoSelection(selectedPixels);

            // Auto-Trim: Filter selection to only pixels that have content
            const trimmedSelection = new Set<number>();
            fullSelection.forEach(idx => {
                if (activeLayerPixels[idx]) {
                    trimmedSelection.add(idx);
                }
            });

            // Use trimmed selection if it has content, otherwise (e.g. selecting empty space) keep the full shape
            let finalSelection = fullSelection;
            if (trimmedSelection.size > 0) {
                finalSelection = trimmedSelection;
            }

            setSelectedPixels(finalSelection);
            liftSelection(finalSelection);

            isLassoingRef.current = false;
        }

        setIsDrawing(false);
        lastPixelIndexRef.current = null;
        strokeStartIndexRef.current = null;
        strokeEndIndexRef.current = null;
        hasMovedInStrokeRef.current = false;
        hasLeftCircleDetonatorRef.current = false;
        setShowDropperHint(false);
        setDropperHoldOverlay(null);
        setShapeHintMode(null);
        shapeHintModeRef.current = null;
        setDragOrigin(null);
        if (editorContainerRef.current) editorContainerRef.current.classList.remove('cursor-masked');
    };

    // Add MouseLeave to hide highlight
    const handleMouseLeave = () => {
        isPointerDownRef.current = false;
        if (longPressTimerRef.current) {
            clearTimeout(longPressTimerRef.current);
            longPressTimerRef.current = null;
        }
        isLineModeActiveRef.current = false;
        isCircleModeActiveRef.current = false;
        setLinePreviewPixels([]);
        setCirclePreviewPixels([]);
        setShowDropperHint(false);
        setDropperHoldOverlay(null);
        setShapeHintMode(null);
        shapeHintModeRef.current = null;

        if (highlightRef.current) {
            highlightRef.current.style.display = 'none';
        }
        // ... rest of logic
        setIsDrawing(false);
        isLassoingRef.current = false;
        lastPixelIndexRef.current = null;
        strokeStartIndexRef.current = null;
        strokeEndIndexRef.current = null;
        hasMovedInStrokeRef.current = false;
        hasLeftCircleDetonatorRef.current = false;
        setDragOrigin(null);
        if (editorContainerRef.current) editorContainerRef.current.classList.remove('cursor-masked');
    };

    const handleContainerMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
        const target = e.target as HTMLElement;
        const overEditor = !!target.closest('.main-sprite-editor');
        if (!overEditor && highlightRef.current) {
            highlightRef.current.style.display = 'none';
        }
    };

    // Canvas Playback Logic
    // We can move the ref inside the component scope properly
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        if (!isPlaying || !canvasRef.current) return;

        const ctx = canvasRef.current.getContext('2d');
        if (!ctx) return;

        // Use standard pixel size of 1 unit on a 32x32 canvas
        ctx.clearRect(0, 0, 32, 32);

        const playbackPixels = isOverlayStacked
            ? workingSprite.pixelData.map((base, i) => workingSprite.overlayPixelData[i] ?? base)
            : (editingLayer === 'base' ? workingSprite.pixelData : workingSprite.overlayPixelData);
        playbackPixels.forEach((color, i) => {
            if (color) {
                const x = i % 32;
                const y = Math.floor(i / 32);
                ctx.fillStyle = color;
                ctx.fillRect(x, y, 1, 1);
            }
        });
    }, [isPlaying, workingSprite, isOverlayStacked, editingLayer]); // Re-draw when frame/layer mode changes

    // Scale editor based on brushSize (1x = 'Zoomed' 2x Scale, 2x = Normal 1x Scale)
    // Only apply scale if we are in the zoomed state
    // Pointer Events for Long Press (Container Level)
    const handlePointerDown = useCallback((e: React.PointerEvent) => {
        if (e.button !== 0) return;
        const target = e.target as HTMLElement;
        const hitEditor = !!target.closest('.main-sprite-editor');
        const hitButton = !!target.closest('button');
        if (!hitEditor) {
            if (!hitButton) {
                isPanningRef.current = true;
                panStartRef.current = {
                    x: e.clientX,
                    y: e.clientY,
                    offsetX: panOffset.x,
                    offsetY: panOffset.y
                };
                if (containerRef.current) containerRef.current.style.cursor = 'grabbing';
            }
            return;
        }
        if (target.closest('.layer-preview')) return;
        isPointerDownRef.current = true;
        pointerStartPosRef.current = { x: e.clientX, y: e.clientY };
    }, [panOffset.x, panOffset.y]);

    const handlePointerMove = useCallback((e: React.PointerEvent) => {
        if (isPanningRef.current && panStartRef.current && containerRef.current) {
            const dx = e.clientX - panStartRef.current.x;
            const dy = e.clientY - panStartRef.current.y;
            let nextX = panStartRef.current.offsetX + dx;
            let nextY = panStartRef.current.offsetY + dy;
            const minVisible = 48; // Keep at least this much workspace visible on-screen.

            // Clamp based on unscaled workspace geometry (zoomed-out logic), so zoom level doesn't distort limits.
            if (workspaceRef.current) {
                const containerW = containerRef.current.clientWidth;
                const containerH = containerRef.current.clientHeight;
                const workspaceW = workspaceRef.current.offsetWidth;
                let workspaceH = workspaceRef.current.offsetHeight;

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

                nextX = Math.max(minX, Math.min(maxX, nextX));
                nextY = Math.max(minY, Math.min(maxY, nextY));
            }

            setPanOffset({
                x: nextX,
                y: nextY
            });
            return;
        }

        if (!isPointerDownRef.current) return;

        if (isCircleModeActiveRef.current && editorContainerRef.current) {
            const rect = editorContainerRef.current.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            const col = Math.floor((x / rect.width) * GRID_SIZE);
            const row = Math.floor((y / rect.height) * GRID_SIZE);
            if (col >= 0 && col < GRID_SIZE && row >= 0 && row < GRID_SIZE) {
                const idx = row * GRID_SIZE + col;
                if (strokeEndIndexRef.current !== idx) {
                    strokeEndIndexRef.current = idx;
                    const circleStart = strokeStartIndexRef.current;
                    if (circleStart !== null) {
                        const circlePixels = getCirclePixelsFromDiameter(circleStart, idx).filter((pixelIdx) => {
                            if (dragOriginRef.current === 'inside') return selectedPixels.has(pixelIdx);
                            if (dragOriginRef.current === 'outside') return !selectedPixels.has(pixelIdx);
                            return true;
                        });
                        setCirclePreviewPixels(circlePixels);
                    }
                }
            }
            return;
        }

        if (isLineModeActiveRef.current && editorContainerRef.current) {
            const rect = editorContainerRef.current.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            const col = Math.floor((x / rect.width) * GRID_SIZE);
            const row = Math.floor((y / rect.height) * GRID_SIZE);
            if (col >= 0 && col < GRID_SIZE && row >= 0 && row < GRID_SIZE) {
                const idx = row * GRID_SIZE + col;
                if (strokeEndIndexRef.current !== idx) {
                    strokeEndIndexRef.current = idx;
                    const lineStart = strokeStartIndexRef.current;
                    if (lineStart !== null) {
                        const linePixels = getLinePixels(lineStart, idx).filter((pixelIdx) => {
                            if (dragOriginRef.current === 'inside') return selectedPixels.has(pixelIdx);
                            if (dragOriginRef.current === 'outside') return !selectedPixels.has(pixelIdx);
                            return true;
                        });
                        setLinePreviewPixels(linePixels);
                    }
                }
            }
            return;
        }

        if (isEyedropperActive) {
            setPointerPos({ x: e.clientX, y: e.clientY });
            return;
        }

        // Optimization: If timer is already cleared (started drawing), skip distance check
        if (!longPressTimerRef.current) return;

        if (pointerStartPosRef.current) {
            const dist = Math.hypot(e.clientX - pointerStartPosRef.current.x, e.clientY - pointerStartPosRef.current.y);
            if (dist > 5) {
                clearTimeout(longPressTimerRef.current);
                longPressTimerRef.current = null;
                setShowDropperHint(false);
                setDropperHoldOverlay(null);
                setShapeHintMode(null);
                shapeHintModeRef.current = null;
            }
        }
    }, [isEyedropperActive, selectedPixels]);

    const handlePointerUp = useCallback(() => {
        if (isPanningRef.current) {
            isPanningRef.current = false;
            panStartRef.current = null;
            if (containerRef.current) containerRef.current.style.cursor = 'grab';
            return;
        }

        isPointerDownRef.current = false;
        if (longPressTimerRef.current) {
            clearTimeout(longPressTimerRef.current);
            longPressTimerRef.current = null;
        }

        if (isEyedropperActive) {
            const pickedIndex = hoveredGridIndexRef.current;
            if (pickedIndex !== null && pickedIndex >= 0 && pickedIndex < GRID_SIZE * GRID_SIZE) {
                const color = floatingLayer.has(pickedIndex)
                    ? floatingLayer.get(pickedIndex)
                    : activeLayerPixels[pickedIndex];

                if (color) {
                    setCurrentColor(color);
                    if (currentTool === 'eraser') setTool('brush');
                } else {
                    setTool('eraser');
                }
            }

            setIsEyedropperActive(false);
            setHoveredGridIndex(null);
            if (editorContainerRef.current) editorContainerRef.current.classList.remove('hide-cursor');
            setIsDrawing(false);
            setDragOrigin(null);
            pendingFillPixelRef.current = null; // Discard any pending fill
            isLineModeActiveRef.current = false;
            isCircleModeActiveRef.current = false;
            setLinePreviewPixels([]);
            setCirclePreviewPixels([]);
            setShowDropperHint(false);
            setDropperHoldOverlay(null);
            setShapeHintMode(null);
            shapeHintModeRef.current = null;
        } else {
            // Normal Release
            // Check for pending fill execution (Safety Catch: User released quickly)
            if (currentTool === 'fill' && pendingFillPixelRef.current !== null) {
                fill(pendingFillPixelRef.current);
                pendingFillPixelRef.current = null;
            }
            setShowDropperHint(false);
            setDropperHoldOverlay(null);
            setShapeHintMode(null);
            shapeHintModeRef.current = null;
        }
    }, [isEyedropperActive, floatingLayer, activeLayerPixels, setCurrentColor, currentTool, setTool, fill, setIsDrawing]);

    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const onWheel = (e: WheelEvent) => {
            e.preventDefault();
            // Ctrl+wheel is trackpad pinch on Chromium; plain wheel/touchpad should also zoom.
            const factor = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0025));
            setViewZoom(prev => Math.max(MIN_VIEW_ZOOM, Math.min(MAX_VIEW_ZOOM, prev * factor)));
        };

        container.addEventListener('wheel', onWheel, { passive: false });
        return () => {
            container.removeEventListener('wheel', onWheel);
        };
    }, []);

    useEffect(() => {
        let lastScale = 1;
        const onGestureStart = (event: Event) => {
            event.preventDefault();
            lastScale = 1;
        };
        const onGestureChange = (event: Event) => {
            event.preventDefault();
            const e = event as Event & { scale?: number };
            const scale = typeof e.scale === 'number' ? e.scale : 1;
            const delta = scale / Math.max(lastScale, 0.0001);
            lastScale = scale;
            setViewZoom(prev => Math.max(MIN_VIEW_ZOOM, Math.min(MAX_VIEW_ZOOM, prev * delta)));
        };
        const onGestureEnd = (event: Event) => {
            event.preventDefault();
            lastScale = 1;
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
    }, []);

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
                const circlePixels = getCirclePixelsFromDiameter(strokeStart, strokeEnd).filter((idx) => {
                    if (dragOriginRef.current === 'inside') return selectedPixels.has(idx);
                    if (dragOriginRef.current === 'outside') return !selectedPixels.has(idx);
                    return true;
                });
                setCirclePreviewPixels(circlePixels);
                return;
            }

            isCircleModeActiveRef.current = false;
            isLineModeActiveRef.current = true;
            setCirclePreviewPixels([]);
            const linePixels = getLinePixels(strokeStart, strokeEnd).filter((idx) => {
                if (dragOriginRef.current === 'inside') return selectedPixels.has(idx);
                if (dragOriginRef.current === 'outside') return !selectedPixels.has(idx);
                return true;
            });
            setLinePreviewPixels(linePixels);
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
    }, [cancelStroke, currentTool, isDrawing, isEyedropperActive, selectedPixels]);

    const scale = (brushSize === 1 && isZoomed) ? 2 : 1;
    const editorSize = 463 * scale;

    const eyedropperColor = (isEyedropperActive && hoveredGridIndex !== null)
        ? (floatingLayer.has(hoveredGridIndex) ? floatingLayer.get(hoveredGridIndex)! : activeLayerPixels[hoveredGridIndex])
        : null;
    const linePreviewSet = React.useMemo(() => {
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
    const circlePreviewSet = React.useMemo(() => {
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
    const shapeModifierLabel = React.useMemo(() => {
        if (typeof navigator === 'undefined') return 'ALT';
        const platform = navigator.platform || '';
        const ua = navigator.userAgent || '';
        const isApple = /Mac|iPhone|iPad|iPod/i.test(platform) || /Mac|iPhone|iPad|iPod/i.test(ua);
        return isApple ? 'OPTION' : 'ALT';
    }, []);
    const topStatusText = React.useMemo(() => {
        if (isEyedropperActive) return 'DROPPER TOOL';
        if (showDropperHint) return 'KEEP HOLDING STILL';

        if (currentTool === 'select' && isDrawing) {
            return 'SELECTION MASK TOOL: RELEASE TO CREATE A FLOATING STAMP';
        }
        if (currentTool === 'select' && selectedPixels.size === 0) {
            return 'SELECTION MASK TOOL';
        }
        if (currentTool === 'select' && selectedPixels.size > 0 && !isDrawing) {
            return 'PRESS ENTER TO STAMP OR HOLD ENTER THEN ARROW KEYS TO SMUDGE';
        }

        const hasStampMask = selectedPixels.size > 0;
        const isPaintLikeTool = currentTool === 'brush' || currentTool === 'eraser' || currentTool === 'fill';
        if (hasStampMask && isPaintLikeTool) {
            if (isDrawing && dragOrigin === 'inside') {
                return 'DRAWING ON STAMP MASK: ONLY THE STAMP IS EDITED';
            }
            if (isDrawing && dragOrigin === 'outside') {
                return 'DRAWING OUTSIDE MASK: STAMP STAYS UNCHANGED';
            }
            return 'STAMP MASK ACTIVE: DRAW ON THE STAMP TO EDIT IT';
        }

        if (shapeHintMode) {
            return `PRESS ${shapeModifierLabel} TO SWITCH TO ${shapeHintMode.toUpperCase()}`;
        }
        if (brushSize === 1) return 'MOUSE WHEEL TO ZOOM';
        return isOverlayStacked ? 'CURRENTLY DRAWING ON TOP LAYER' : (editingLayer === 'base' ? 'BASE' : 'TOP');
    }, [
        isEyedropperActive,
        showDropperHint,
        currentTool,
        isDrawing,
        selectedPixels.size,
        dragOrigin,
        shapeHintMode,
        shapeModifierLabel,
        brushSize,
        isOverlayStacked,
        editingLayer
    ]);

    return (
        <div
            ref={containerRef}
            className="main-editor-container"
            onMouseLeave={handleMouseLeave}
            onMouseMove={handleContainerMouseMove}
            onMouseUp={handleMouseUp}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            style={{
                display: 'flex',
                overflow: 'auto',
                flex: 1,
                width: '100%',
                justifyContent: 'center',
                alignItems: 'center',
                touchAction: 'none',
                position: 'relative',
                cursor: 'grab'
            }}
        >
            {isEyedropperActive && pointerPos && hoveredGridIndex !== null && (
                <MagnifyingGlass
                    screenX={pointerPos.x}
                    screenY={pointerPos.y}
                    gridX={hoveredGridIndex % 32}
                    gridY={Math.floor(hoveredGridIndex / 32)}
                    pixelData={activeLayerPixels}
                    floatingLayer={floatingLayer}
                    targetColor={eyedropperColor || null}
                />
            )}
            <div
                ref={workspaceRef}
                style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${viewZoom})`,
                    transformOrigin: 'center center'
                }}
            >
            {editingLayer === 'top' && !isOverlayStacked && (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', marginRight: '16px', flexShrink: 0 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)' }}>BASE</div>
                    <div
                        className="main-sprite-editor layer-preview"
                        onMouseDown={(e) => { e.stopPropagation(); setActiveLayer('base'); }}
                        style={{
                            width: `${editorSize}px`,
                            height: `${editorSize}px`,
                            opacity: 0.68,
                            flexShrink: 0
                        }}
                    >
                        {inactiveLayerPixels.map((color, index) => (
                            <div key={`inactive-left-${index}`} className={`pixel ${color ? 'has-color' : ''}`} style={color ? { backgroundColor: color } : undefined} />
                        ))}
                    </div>
                </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', position: 'relative', flexShrink: 0 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-color)' }}>
                    {topStatusText}
                </div>
                <div
                    ref={editorContainerRef}
                    className={`main-sprite-editor tool-${currentTool} ${selectedPixels.size > 0 ? 'has-selection' : ''} ${isPlaying ? 'playing' : ''} ${isOnionSkinning ? 'onion-on' : ''} ${isDrawing ? 'is-drawing' : ''} ${isDrawing && dragOrigin ? `drag-start-${dragOrigin}` : ''}`}
                    style={{
                        ...cursorStyle,
                        '--cursor-normal': cursorStyle.cursor,
                        '--cursor-faint': faintCursorStyle,
                        '--selection-cursor': selectionCursorStyle.cursor,
                        width: `${editorSize}px`,
                        height: `${editorSize}px`,
                        flexShrink: 0,
                    } as any}
                >
                {/* Highlight Overlay - Rendered First or Last? Last to be on top of pixels but below cursor */}
                <div
                    ref={highlightRef}
                    className="pixel-highlight-guides"
                    style={{
                        position: 'absolute',
                        border: '1px solid rgba(255, 255, 255, 0.4)',
                        background: 'rgba(255, 255, 255, 0.1)',
                        pointerEvents: 'none',
                        display: 'none', // Hidden until mouse enter
                        zIndex: 20, // Above pixels (z1), above onion (z10)?
                        boxSizing: 'border-box'
                    }}
                />

                {dropperHoldOverlay && !isEyedropperActive && (
                    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 22 }}>
                        {dropperHoldOverlay.kind === 'cells' && dropperHoldOverlay.indices.map((idx) => (
                            <div
                                key={`dropper-hold-${idx}`}
                                style={{
                                    position: 'absolute',
                                    left: `${(idx % GRID_SIZE) * (100 / GRID_SIZE)}%`,
                                    top: `${Math.floor(idx / GRID_SIZE) * (100 / GRID_SIZE)}%`,
                                    width: `${100 / GRID_SIZE}%`,
                                    height: `${100 / GRID_SIZE}%`,
                                    overflow: 'hidden'
                                }}
                            >
                                <div
                                    style={{
                                        position: 'absolute',
                                        left: 0,
                                        right: 0,
                                        top: 0,
                                        height: `${dropperHoldOverlay.progress * 100}%`,
                                        background: dropperHoldOverlay.baseColors[idx] ?? 'var(--grid-bg)',
                                        transition: `height ${EYEDROPPER_HOLD_MS}ms linear`
                                    }}
                                />
                            </div>
                        ))}
                        {dropperHoldOverlay.kind === 'block' && (
                            <div
                                style={{
                                    position: 'absolute',
                                    left: `${dropperHoldOverlay.x * (100 / GRID_SIZE)}%`,
                                    top: `${dropperHoldOverlay.y * (100 / GRID_SIZE)}%`,
                                    width: `${dropperHoldOverlay.w * (100 / GRID_SIZE)}%`,
                                    height: `${dropperHoldOverlay.h * (100 / GRID_SIZE)}%`,
                                    overflow: 'hidden'
                                }}
                            >
                                <div
                                    style={{
                                        position: 'absolute',
                                        left: 0,
                                        right: 0,
                                        top: 0,
                                        height: `${dropperHoldOverlay.progress * 100}%`,
                                        background: dropperHoldOverlay.baseColor ?? 'var(--grid-bg)',
                                        transition: `height ${EYEDROPPER_HOLD_MS}ms linear`
                                    }}
                                />
                            </div>
                        )}
                    </div>
                )}

                {isPlaying && (
                    <canvas
                        ref={canvasRef}
                        width={32}
                        height={32}
                        className="playback-canvas"
                        style={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            width: '100%',
                            height: '100%',
                            imageRendering: 'pixelated',
                            zIndex: 50, // Above everything
                            pointerEvents: 'none'
                        }}
                    />
                )}

                {/* Main Sprite Layer */}
                {!isPlaying && displayPixels.map((baseColor, index) => {
                    const color = floatingLayer.has(index) ? floatingLayer.get(index)! : baseColor;
                    const isFloating = floatingLayer.has(index);
                    return (
                        <MemoizedPixel
                            key={index}
                            index={index}
                            color={color}
                            isSelected={selectedPixels.has(index)}
                            isFloating={isFloating}
                            isStamping={isStamping}
                            onMouseDown={handleMouseDown}
                            onMouseEnter={handleMouseEnter}
                            onMouseUp={handleMouseUp}
                        />
                    );
                })}

                {/* Onion Skin Layer (Rendered after for overlay effect) */}
                {isOnionSkinning && !isPlaying && prevSprite && (
                    <div className="onion-skin-layer" style={{
                        position: 'absolute',
                        inset: 0,
                        display: 'grid',
                        gridTemplateColumns: 'repeat(var(--grid-size), 1fr)',
                        gridTemplateRows: 'repeat(var(--grid-size), 1fr)',
                        gap: '1px',
                        padding: '2px',
                        pointerEvents: 'none',
                        opacity: 0.25,
                        zIndex: 10
                    }}>
                        {prevSprite.pixelData.map((baseColor, index) => {
                            const color = isOverlayStacked
                                ? (prevSprite.overlayPixelData[index] ?? baseColor)
                                : (editingLayer === 'base' ? baseColor : prevSprite.overlayPixelData[index]);
                            return (
                            <div
                                key={`onion-${index}`}
                                className="pixel-onion"
                                style={color ? { backgroundColor: color, border: 'none' } : { border: 'none' }}
                            />
                            );
                        })}
                    </div>
                )}

                {linePreviewPixels.length > 0 && (
                    <div style={{
                        position: 'absolute',
                        inset: 0,
                        display: 'grid',
                        gridTemplateColumns: 'repeat(var(--grid-size), 1fr)',
                        gridTemplateRows: 'repeat(var(--grid-size), 1fr)',
                        gap: '1px',
                        padding: '2px',
                        pointerEvents: 'none',
                        zIndex: 40
                    }}>
                        {activeLayerPixels.map((_, index) => {
                            const isPreviewPixel = linePreviewSet.has(index);
                            if (!isPreviewPixel) return <div key={`line-preview-${index}`} />;

                            if (currentTool === 'eraser') {
                                return (
                                    <div
                                        key={`line-preview-${index}`}
                                        style={{
                                            border: '1px solid #ff3333',
                                            background: 'rgba(255, 51, 51, 0.15)'
                                        }}
                                    />
                                );
                            }

                            return (
                                <div
                                    key={`line-preview-${index}`}
                                    style={{
                                        background: currentColor || 'transparent',
                                        opacity: 0.7
                                    }}
                                />
                            );
                        })}
                    </div>
                )}

                {circlePreviewPixels.length > 0 && (
                    <div style={{
                        position: 'absolute',
                        inset: 0,
                        display: 'grid',
                        gridTemplateColumns: 'repeat(var(--grid-size), 1fr)',
                        gridTemplateRows: 'repeat(var(--grid-size), 1fr)',
                        gap: '1px',
                        padding: '2px',
                        pointerEvents: 'none',
                        zIndex: 41
                    }}>
                        {activeLayerPixels.map((_, index) => {
                            const isPreviewPixel = circlePreviewSet.has(index);
                            if (!isPreviewPixel) return <div key={`circle-preview-${index}`} />;

                            if (currentTool === 'eraser') {
                                return (
                                    <div
                                        key={`circle-preview-${index}`}
                                        style={{
                                            border: '1px solid #ff3333',
                                            background: 'rgba(255, 51, 51, 0.15)'
                                        }}
                                    />
                                );
                            }

                            return (
                                <div
                                    key={`circle-preview-${index}`}
                                    style={{
                                        background: currentColor || 'transparent',
                                        opacity: 0.7
                                    }}
                                />
                            );
                        })}
                    </div>
                )}
                </div>
                <button
                    ref={stackButtonRef}
                    className="secondary-btn-small"
                    onMouseDown={(e) => {
                        e.stopPropagation();
                        setIsOverlayStacked(!isOverlayStacked);
                    }}
                    style={{
                        position: 'absolute',
                        top: 'calc(100% + 8px)',
                        left: '50%',
                        transform: 'translateX(-50%)'
                    }}
                >
                    {isOverlayStacked ? 'Unstack Layers' : 'Stack Layers'}
                </button>
            </div>
            {editingLayer === 'base' && !isOverlayStacked && (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', marginLeft: '16px', flexShrink: 0 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)' }}>TOP</div>
                    <div
                        className="main-sprite-editor layer-preview"
                        onMouseDown={(e) => { e.stopPropagation(); setActiveLayer('top'); }}
                        style={{
                            width: `${editorSize}px`,
                            height: `${editorSize}px`,
                            opacity: 0.68,
                            flexShrink: 0
                        }}
                    >
                        {inactiveLayerPixels.map((color, index) => (
                            <div key={`inactive-right-${index}`} className={`pixel ${color ? 'has-color' : ''}`} style={color ? { backgroundColor: color } : undefined} />
                        ))}
                    </div>
                </div>
            )}
            </div>
        </div>
    );
};
