import React, { useRef, useEffect } from 'react';
import { useEditor } from '../../contexts/EditorContext';
import { calculateLassoSelection } from '../../utils/lasso';
import { getLinePixels } from '../../utils/draw';

interface PixelProps {
    index: number;
    color: string | null;
    isSelected: boolean;
    isFloating: boolean;
    isStamping: boolean;
    onMouseDown: (index: number) => void;
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
        onMouseDown={() => onMouseDown(index)}
        onMouseEnter={() => onMouseEnter(index)}
        onMouseUp={onMouseUp}
    />
));

export const Editor: React.FC = () => {
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
        nudgeSelection,
        liftSelection,
        floatingLayer,
        isPlaying,
        isOnionSkinning,
        sprites,
        activeSpriteId,
        currentColor,
        isStamping,
        brushSize,
        addSelectionBatch
    } = useEditor();

    const activeSpriteIndex = sprites.findIndex(s => s.id === activeSpriteId);
    const prevSprite = activeSpriteIndex > 0 ? sprites[activeSpriteIndex - 1] : null;

    // Use a ref to track if we stamped/ lasso-ed on this specific interaction
    const isLassoingRef = useRef(false);
    // Track last pixel for interpolation
    const lastPixelIndexRef = useRef<number | null>(null);

    // Nudge Selection Keyboard Listener
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (selectedPixels.size === 0) return;

            // Only override arrows if not editing text
            let dx = 0;
            let dy = 0;

            switch (e.key) {
                case 'ArrowLeft': dx = -1; break;
                case 'ArrowRight': dx = 1; break;
                case 'ArrowUp': dy = -1; break;
                case 'ArrowDown': dy = 1; break;
                default: return; // Exit if not arrow key
            }

            e.preventDefault();
            nudgeSelection(dx, dy);
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [selectedPixels, nudgeSelection]);

    // Track zoom state for 1x brush
    const [isZoomed, setIsZoomed] = React.useState(false);
    const zoomFocusRef = useRef<{ x: number, y: number } | null>(null);

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

    if (!activeSprite) return null;

    const handleMouseDown = (index: number) => {
        // Zoom Logic for 1x Brush
        if (brushSize === 1 && !isZoomed) {
            const x = index % 32;
            const y = Math.floor(index / 32);
            zoomFocusRef.current = { x, y };
            setIsZoomed(true);
            return; // Do not paint on the click that zooms
        }

        // Reset last pixel on new stroke
        lastPixelIndexRef.current = index;

        // Check where drag started (Masking only for Brush/Eraser to Faint, not Select or Fill)
        if (currentTool === 'brush' || currentTool === 'eraser') {
            const region = selectedPixels.has(index) ? 'inside' : 'outside';
            setDragOrigin(region);
            dragOriginRef.current = region;
        }

        if (currentTool === 'fill') {
            fill(index);
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
        if (currentTool === 'select' && isLassoingRef.current) {
            // Lasso Release Logic
            const fullSelection = calculateLassoSelection(selectedPixels);

            // Auto-Trim: Filter selection to only pixels that have content
            const trimmedSelection = new Set<number>();
            fullSelection.forEach(idx => {
                if (activeSprite.pixelData[idx]) {
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
        setDragOrigin(null);
        if (editorContainerRef.current) editorContainerRef.current.classList.remove('cursor-masked');
    };

    // Add MouseLeave to hide highlight
    const handleMouseLeave = () => {
        if (highlightRef.current) {
            highlightRef.current.style.display = 'none';
        }
        // ... rest of logic
        setIsDrawing(false);
        isLassoingRef.current = false;
        lastPixelIndexRef.current = null;
        setDragOrigin(null);
        if (editorContainerRef.current) editorContainerRef.current.classList.remove('cursor-masked');
    };

    // Canvas Playback Logic
    // We can move the ref inside the component scope properly
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        if (!isPlaying || !canvasRef.current || !activeSprite) return;

        const ctx = canvasRef.current.getContext('2d');
        if (!ctx) return;

        // Use standard pixel size of 1 unit on a 32x32 canvas
        ctx.clearRect(0, 0, 32, 32);

        activeSprite.pixelData.forEach((color, i) => {
            if (color) {
                const x = i % 32;
                const y = Math.floor(i / 32);
                ctx.fillStyle = color;
                ctx.fillRect(x, y, 1, 1);
            }
        });
    }, [isPlaying, activeSprite]); // Re-draw when frame advances

    // Scale editor based on brushSize (1x = 'Zoomed' 2x Scale, 2x = Normal 1x Scale)
    // Only apply scale if we are in the zoomed state
    const scale = (brushSize === 1 && isZoomed) ? 2 : 1;
    const editorSize = 463 * scale;

    return (
        <div
            ref={containerRef}
            className="main-editor-container"
            onMouseLeave={handleMouseLeave}
            onMouseUp={handleMouseUp}
            style={{
                display: 'grid',
                placeItems: 'center',
                overflow: 'auto',
                // Ensure flex container behavior is overridden or compatible
                flex: 1,
                width: '100%',
                justifyContent: 'center',
                alignItems: 'center'
            }}
        >
            <div
                ref={editorContainerRef}
                className={`main-sprite-editor tool-${currentTool} ${selectedPixels.size > 0 ? 'has-selection' : ''} ${isPlaying ? 'playing' : ''} ${isOnionSkinning ? 'onion-on' : ''} ${isDrawing ? 'is-drawing' : ''} ${isDrawing && dragOrigin ? `drag-start-${dragOrigin}` : ''}`}
                style={{
                    ...cursorStyle,
                    '--cursor-normal': cursorStyle.cursor,
                    '--cursor-faint': faintCursorStyle,
                    '--selection-cursor': selectionCursorStyle.cursor,
                    // Dynamic Sizing
                    width: `${editorSize}px`,
                    height: `${editorSize}px`,
                    // Keep visible so canvas shows, but we'll conditionally render children
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
                {!isPlaying && activeSprite.pixelData.map((baseColor, index) => {
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
                        {prevSprite.pixelData.map((color, index) => (
                            <div
                                key={`onion-${index}`}
                                className="pixel-onion"
                                style={color ? { backgroundColor: color, border: 'none' } : { border: 'none' }}
                            />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};
