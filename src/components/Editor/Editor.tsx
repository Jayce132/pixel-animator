import React, { useRef, useEffect } from 'react';
import { useEditor } from '../../contexts/EditorContext';
import { calculateLassoSelection } from '../../utils/lasso';
import { getLinePixels } from '../../utils/draw';

export const Editor: React.FC = () => {
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
        activeSpriteId
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

    if (!activeSprite) return null;

    const handleMouseDown = (index: number) => {
        // Reset last pixel on new stroke
        lastPixelIndexRef.current = index;

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
                pixels.forEach(idx => updatePixel(idx));
            } else {
                updatePixel(index);
            }

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
    };

    const handleMouseLeave = () => {
        setIsDrawing(false);
        isLassoingRef.current = false;
        lastPixelIndexRef.current = null;
    };

    return (
        <div className="main-editor-container" onMouseLeave={handleMouseLeave} onMouseUp={handleMouseUp}>
            <div className={`main-sprite-editor ${selectedPixels.size > 0 ? 'has-selection' : ''} ${isPlaying ? 'playing' : ''} ${isOnionSkinning ? 'onion-on' : ''}`}>

                {/* Main Sprite Layer */}
                {activeSprite.pixelData.map((baseColor, index) => {
                    const color = floatingLayer.has(index) ? floatingLayer.get(index)! : baseColor;
                    return (
                        <div
                            key={index}
                            className={`pixel ${color ? 'has-color' : ''} ${selectedPixels.has(index) ? 'is-selected' : ''}`}
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
