import React, { useRef, useEffect, useState } from 'react';
import { Settings } from 'lucide-react';
import { useEditorUiStore } from '../../stores/editorStore';
import { selectCanClear, selectCanRedo, selectCanUndo } from '../../stores/editorSelectors';
import { PaletteSelector } from '../Sidebar/PaletteSelector';

const MAX_RECENT = 8;
type SwatchVars = React.CSSProperties & Record<'--swatch-color', string>;

export const TopBar: React.FC = () => {
    const undo = useEditorUiStore(state => state.undo);
    const redo = useEditorUiStore(state => state.redo);
    const clearCanvas = useEditorUiStore(state => state.clearCanvas);
    const canUndo = useEditorUiStore(selectCanUndo);
    const canRedo = useEditorUiStore(selectCanRedo);
    const canClear = useEditorUiStore(selectCanClear);
    const selectedPixels = useEditorUiStore(state => state.selectedPixels);
    const clearSelection = useEditorUiStore(state => state.clearSelection);
    const currentTool = useEditorUiStore(state => state.currentTool);
    const setTool = useEditorUiStore(state => state.setTool);
    const brushSize = useEditorUiStore(state => state.brushSize);
    const setBrushSize = useEditorUiStore(state => state.setBrushSize);
    const currentColor = useEditorUiStore(state => state.currentColor);
    const setCurrentColor = useEditorUiStore(state => state.setCurrentColor);
    const recentColors = useEditorUiStore(state => state.recentColors);
    const palette = useEditorUiStore(state => state.palette);
    const presetCount = useEditorUiStore(state => state.presetCount);
    const isPlaying = useEditorUiStore(state => state.isPlaying);
    const [isSelectorOpen, setIsSelectorOpen] = useState(false);

    const presetColors = palette.slice(0, presetCount);

    const topBarRef = useRef<HTMLDivElement>(null);
    const animationAbortedRef = useRef(false);

    useEffect(() => {
        const hintScroll = async () => {
            if (!topBarRef.current || animationAbortedRef.current) return;
            try {
                topBarRef.current.scrollTo({ left: 120, behavior: 'smooth' });
                await new Promise(r => setTimeout(r, 450));
                if (animationAbortedRef.current) return;
                topBarRef.current.scrollTo({ left: 0, behavior: 'smooth' });
                await new Promise(r => setTimeout(r, 450));
                if (animationAbortedRef.current) return;
                topBarRef.current.scrollTo({ left: 120, behavior: 'smooth' });
                await new Promise(r => setTimeout(r, 450));
                if (animationAbortedRef.current) return;
                topBarRef.current.scrollTo({ left: 0, behavior: 'smooth' });
            } catch {
                // Ignore fallback issues
            }
        };
        hintScroll();
    }, []);

    const displaySlots = recentColors.length >= 4 ? MAX_RECENT : 4;
    const recentSlots = Array.from({ length: displaySlots });

    const handleInteraction = () => {
        animationAbortedRef.current = true;
    };

    return (
        <div
            className="top-bar"
            ref={topBarRef}
            onPointerDown={handleInteraction}
            onWheel={handleInteraction}
            onTouchStart={handleInteraction}
        >
            {recentColors.length > 0 && (
                <div className="top-bar-group">
                    <button
                        className={`top-bar-btn ${currentTool === 'fill' ? 'active' : ''}`}
                        onClick={() => setTool(currentTool === 'fill' ? 'brush' : 'fill')}
                    >
                        Fill
                    </button>
                    <button
                        className={`top-bar-btn ${currentTool === 'select' || selectedPixels.size > 0 ? 'active' : ''}`}
                        disabled={isPlaying && selectedPixels.size === 0}
                        onClick={() => {
                            if (selectedPixels.size > 0) {
                                clearSelection();
                                setTool('brush');
                            } else {
                                setTool(currentTool === 'select' ? 'brush' : 'select');
                            }
                        }}
                    >
                        {selectedPixels.size > 0 ? 'Deselect' : 'Select'}
                    </button>
                </div>
            )}

            {/* Brush Size */}
            {recentColors.length > 0 && (currentTool === 'brush' || currentTool === 'eraser') && (
                <div className="top-bar-group">
                    <button
                        className={`top-bar-btn ${brushSize === 1 ? 'active' : ''}`}
                        onClick={() => setBrushSize(1)}
                    >
                        1×
                    </button>
                    <button
                        className={`top-bar-btn ${brushSize === 2 ? 'active' : ''}`}
                        onClick={() => setBrushSize(2)}
                    >
                        2×
                    </button>
                </div>
            )}

            {/* Actions */}
            {(canUndo || canRedo || canClear) && (
                <div className="top-bar-group">
                    <button className="top-bar-btn" disabled={!canUndo} onClick={undo}>Undo</button>
                    <button className="top-bar-btn" disabled={!canRedo} onClick={redo}>Redo</button>
                    <button className="top-bar-btn" disabled={!canClear} onClick={clearCanvas}>Clear</button>
                </div>
            )}

            {recentColors.length > 0 && (
                <>
                    {/* Divider */}
                    <div className="top-bar-divider" />

                    {/* Recent Colors */}
                    <div className="top-bar-colors">
                        {recentSlots.map((_, index) => {
                            if (index === 0) {
                                return (
                                    <div
                                        key="clear"
                                        className={`top-bar-swatch clear-swatch ${currentTool === 'eraser' || (currentTool === 'fill' && currentColor === null) ? 'active' : ''}`}
                                        onClick={() => {
                                            if (currentTool === 'fill') {
                                                setCurrentColor(null);
                                            } else {
                                                setTool('eraser');
                                            }
                                        }}
                                        title="Transparent / Eraser"
                                    />
                                );
                            }
                            const color = recentColors[index - 1];
                            if (color) {
                                return (
                                    <div
                                        key={color}
                                        className={`top-bar-swatch has-color ${color === currentColor && currentTool !== 'eraser' && currentTool !== 'select' ? 'active' : ''}`}
                                        style={{ '--swatch-color': color } as SwatchVars}
                                        onClick={() => setCurrentColor(color)}
                                        title={color}
                                    />
                                );
                            }
                            return <div key={`empty-${index}`} className="top-bar-swatch empty" />;
                        })}
                    </div>
                </>
            )}

            {/* Divider */}
            <div className="top-bar-divider" />

            {/* Palette Colors — gear opens the palette selector */}
            <div className="top-bar-colors">
                <button
                    type="button"
                    className="top-bar-swatch palette-gear"
                    onClick={() => setIsSelectorOpen(true)}
                    title="Open palette selector"
                    aria-label="Open palette selector"
                >
                    <Settings size={14} />
                </button>
                {presetColors.map((color, index) => (
                    <div
                        key={`${index}-${color}`}
                        className={`top-bar-swatch has-color ${color === currentColor && currentTool !== 'eraser' && currentTool !== 'select' ? 'active' : ''}`}
                        style={{ '--swatch-color': color } as SwatchVars}
                        onClick={() => setCurrentColor(color)}
                        title={color}
                    />
                ))}
            </div>

            {isSelectorOpen && <PaletteSelector onClose={() => setIsSelectorOpen(false)} />}
        </div>
    );
};
