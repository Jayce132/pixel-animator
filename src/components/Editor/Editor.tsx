import React, { useRef, useEffect } from 'react';
import { useEditor } from '../../contexts/EditorContext';
import { calculateLassoSelection } from '../../utils/lasso';
import { getLinePixels } from '../../utils/draw';

export const Editor: React.FC = () => {
    const editorContainerRef = useRef<HTMLDivElement>(null);
    // Track if drag started inside or outside selection to mask cursor visibility
    const [dragOrigin, setDragOrigin] = React.useState<'inside' | 'outside' | null>(null);

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
        isStamping
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

    const styles = React.useMemo(() => {
        const sideSize = 24;

        if (currentTool === 'brush') {
            const containerSize = sideSize + 4;
            const half = containerSize / 2;
            const svg = `
                <svg width="${containerSize}" height="${containerSize}" viewBox="0 0 ${containerSize} ${containerSize}" xmlns="http://www.w3.org/2000/svg">
                    <rect x="2" y="2" width="${sideSize}" height="${sideSize}" fill="${currentColor}" stroke="white" stroke-width="1" />
                </svg>
            `;
            // Faint version for masked areas (out of bounds)
            const faintSvg = `
                <svg width="${containerSize}" height="${containerSize}" viewBox="0 0 ${containerSize} ${containerSize}" xmlns="http://www.w3.org/2000/svg">
                    <rect x="2" y="2" width="${sideSize}" height="${sideSize}" fill="${currentColor}" stroke="white" stroke-width="1" opacity="0.3" />
                </svg>
            `;
            // Glowing version for selection hover
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
                    <rect x="4" y="4" width="${sideSize - 4}" height="${sideSize - 4}" fill="${currentColor}" stroke="white" stroke-width="2" filter="url(#glow)" />
                </svg>
            `;
            return {
                cursorStyle: { cursor: `url('data:image/svg+xml;utf8,${encodeURIComponent(svg)}') ${half} ${half}, auto` },
                faintCursorStyle: `url('data:image/svg+xml;utf8,${encodeURIComponent(faintSvg)}') ${half} ${half}, auto`,
                selectionCursorStyle: { cursor: `url('data:image/svg+xml;utf8,${encodeURIComponent(glowSvg)}') ${half} ${half}, auto` }
            };
        }

        if (currentTool === 'fill') {
            // Single square matching brush sideSize (24px) but rotated 45 degrees
            const containerSize = 40; // Room for rotation + border
            const center = containerSize / 2;
            const offset = (containerSize - sideSize) / 2;

            const svg = `
                <svg width="${containerSize}" height="${containerSize}" viewBox="0 0 ${containerSize} ${containerSize}" xmlns="http://www.w3.org/2000/svg">
                    <rect x="${offset}" y="${offset}" width="${sideSize}" height="${sideSize}" fill="${currentColor}" stroke="white" stroke-width="1" transform="rotate(45, ${center}, ${center})" />
                </svg>
            `;
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
                    <rect x="${offset + 2}" y="${offset + 2}" width="${sideSize - 4}" height="${sideSize - 4}" fill="${currentColor}" stroke="white" stroke-width="2" filter="url(#glow)" transform="rotate(45, ${center}, ${center})" />
                </svg>
            `;
            return {
                cursorStyle: { cursor: `url('data:image/svg+xml;utf8,${encodeURIComponent(svg)}') ${center} ${center}, auto` },
                faintCursorStyle: `url('data:image/svg+xml;utf8,${encodeURIComponent(svg)}') ${center} ${center}, auto`, // Fill doesn't fade
                selectionCursorStyle: { cursor: `url('data:image/svg+xml;utf8,${encodeURIComponent(glowSvg)}') ${center} ${center}, auto` }
            };
        }

        if (currentTool === 'eraser') {
            const containerSize = sideSize + 4;
            const half = containerSize / 2;
            // Match .clear-swatch: #2d2d2d bg, #ff3333 diagonal
            const svg = `
                <svg width="${containerSize}" height="${containerSize}" viewBox="0 0 ${containerSize} ${containerSize}" xmlns="http://www.w3.org/2000/svg">
                    <rect x="3" y="3" width="${sideSize - 2}" height="${sideSize - 2}" fill="#2d2d2d" stroke="#3e3e3e" stroke-width="1" />
                    <line x1="${sideSize}" y1="4" x2="4" y2="${sideSize}" stroke="#ff3333" stroke-width="2" />
                </svg>
            `;
            // Faint Eraser
            const faintSvg = `
                <svg width="${containerSize}" height="${containerSize}" viewBox="0 0 ${containerSize} ${containerSize}" xmlns="http://www.w3.org/2000/svg">
                    <g opacity="0.3">
                        <rect x="3" y="3" width="${sideSize - 2}" height="${sideSize - 2}" fill="#2d2d2d" stroke="#3e3e3e" stroke-width="1" />
                        <line x1="${sideSize}" y1="4" x2="4" y2="${sideSize}" stroke="#ff3333" stroke-width="2" />
                    </g>
                </svg>
            `;
            return {
                cursorStyle: { cursor: `url('data:image/svg+xml;utf8,${encodeURIComponent(svg)}') ${half} ${half}, auto` },
                faintCursorStyle: `url('data:image/svg+xml;utf8,${encodeURIComponent(faintSvg)}') ${half} ${half}, auto`,
                selectionCursorStyle: { cursor: 'default' }
            };
        }

        if (currentTool === 'select') {
            const containerSize = sideSize + 4;
            const half = containerSize / 2;
            // Glowing square
            const svg = `
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
                    <rect x="4" y="4" width="${sideSize - 4}" height="${sideSize - 4}" fill="none" stroke="white" stroke-width="2" filter="url(#glow)" />
                </svg>
            `;
            return { cursorStyle: { cursor: `url('data:image/svg+xml;utf8,${encodeURIComponent(svg)}') ${half} ${half}, auto` }, faintCursorStyle: 'default', selectionCursorStyle: { cursor: 'default' } };
        }

        return { cursorStyle: { cursor: 'default' }, faintCursorStyle: 'default', selectionCursorStyle: { cursor: 'default' } };
    }, [currentTool, currentColor]);

    // Deconstruct styles
    const { cursorStyle, faintCursorStyle, selectionCursorStyle } = styles;

    if (!activeSprite) return null;

    const handleMouseDown = (index: number) => {
        // Reset last pixel on new stroke
        lastPixelIndexRef.current = index;

        // Check where drag started (Masking only for Brush/Eraser to Faint, not Select or Fill)
        if (currentTool === 'brush' || currentTool === 'eraser') {
            const region = selectedPixels.has(index) ? 'inside' : 'outside';
            setDragOrigin(region);
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
        updatePixel(index);
    };

    const handleMouseEnter = (index: number) => {
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
                if (dragOrigin === 'inside') return selectedPixels.has(idx);
                if (dragOrigin === 'outside') return !selectedPixels.has(idx);
                return true;
            };

            if (currentTool === 'select') {
                if (lastPixelIndexRef.current !== null && lastPixelIndexRef.current !== index) {
                    const pixels = getLinePixels(lastPixelIndexRef.current, index);
                    pixels.forEach(idx => addToSelection(idx));
                } else {
                    addToSelection(index);
                }
                lastPixelIndexRef.current = index;
                return;
            }

            // Interpolate line from last pixel to current
            if (lastPixelIndexRef.current !== null && lastPixelIndexRef.current !== index) {
                const pixels = getLinePixels(lastPixelIndexRef.current, index);
                pixels.forEach(idx => {
                    if (canPaint(idx)) updatePixel(idx);
                });
            } else {
                if (canPaint(index)) updatePixel(index);
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

    const handleMouseLeave = () => {
        setIsDrawing(false);
        isLassoingRef.current = false;
        lastPixelIndexRef.current = null;
        setDragOrigin(null);
        if (editorContainerRef.current) editorContainerRef.current.classList.remove('cursor-masked');
    };

    return (
        <div className="main-editor-container" onMouseLeave={handleMouseLeave} onMouseUp={handleMouseUp}>
            <div
                ref={editorContainerRef}
                className={`main-sprite-editor tool-${currentTool} ${selectedPixels.size > 0 ? 'has-selection' : ''} ${isPlaying ? 'playing' : ''} ${isOnionSkinning ? 'onion-on' : ''} ${isDrawing ? 'is-drawing' : ''} ${isDrawing && dragOrigin ? `drag-start-${dragOrigin}` : ''}`}
                style={{
                    ...cursorStyle,
                    '--cursor-normal': cursorStyle.cursor,
                    '--cursor-faint': faintCursorStyle,
                    '--selection-cursor': selectionCursorStyle.cursor
                } as any}
            >

                {/* Main Sprite Layer */}
                {activeSprite.pixelData.map((baseColor, index) => {
                    const color = floatingLayer.has(index) ? floatingLayer.get(index)! : baseColor;
                    const isFloating = floatingLayer.has(index);
                    return (
                        <div
                            key={index}
                            className={`pixel ${color ? 'has-color' : ''} ${selectedPixels.has(index) ? 'is-selected' : ''} ${isFloating ? 'is-floating' : ''} ${isStamping && isFloating ? 'stamping' : ''}`}
                            style={color ? { backgroundColor: color, '--pixel-color': color } as React.CSSProperties : undefined}
                            onMouseDown={() => handleMouseDown(index)}
                            onMouseEnter={() => handleMouseEnter(index)}
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
                        gridTemplateColumns: 'repeat(16, 1fr)',
                        gridTemplateRows: 'repeat(16, 1fr)',
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
