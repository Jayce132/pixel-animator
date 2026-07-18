import React, { useState } from 'react';
import { Settings } from 'lucide-react';
import { useEditorUiStore } from '../../stores/editorStore';
import { PaletteSelector } from './PaletteSelector';

type SwatchVars = React.CSSProperties & Record<'--swatch-color', string>;

export const PaletteGrid: React.FC = () => {
    const currentColor = useEditorUiStore(state => state.currentColor);
    const setCurrentColor = useEditorUiStore(state => state.setCurrentColor);
    const currentTool = useEditorUiStore(state => state.currentTool);
    const palette = useEditorUiStore(state => state.palette);
    const presetCount = useEditorUiStore(state => state.presetCount);
    const [isSelectorOpen, setIsSelectorOpen] = useState(false);

    // Colors picked while drawing are appended after the preset slots and stay
    // managed by the color picker instead.
    const presetColors = palette.slice(0, presetCount);

    return (
        <div className="palette-section">
            <div className="palette-header">
                <h3>Palette</h3>
                <button
                    type="button"
                    className={`palette-settings-btn ${isSelectorOpen ? 'active' : ''}`}
                    onClick={() => setIsSelectorOpen(true)}
                    title="Open palette selector"
                    aria-label="Open palette selector"
                >
                    <Settings size={12} />
                </button>
            </div>
            <div className="palette-grid">
                {presetColors.map((color, index) => (
                    <div
                        key={`${index}-${color}`}
                        className={`palette-color has-color ${color === currentColor && currentTool !== 'eraser' && currentTool !== 'select' ? 'active' : ''}`}
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
