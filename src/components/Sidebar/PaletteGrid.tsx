import React from 'react';
import { useEditorUiStore } from '../../stores/editorStore';
import { PRESET_COLORS } from '../../types';

type SwatchVars = React.CSSProperties & Record<'--swatch-color', string>;

export const PaletteGrid: React.FC = () => {
    const currentColor = useEditorUiStore(state => state.currentColor);
    const setCurrentColor = useEditorUiStore(state => state.setCurrentColor);
    const currentTool = useEditorUiStore(state => state.currentTool);

    return (
        <div className="palette-section">
            <h3>Palette</h3>
            <div className="palette-grid">
                {PRESET_COLORS.map((color) => (
                    <div
                        key={color}
                        className={`palette-color has-color ${color === currentColor && currentTool !== 'eraser' && currentTool !== 'select' ? 'active' : ''}`}
                        style={{ '--swatch-color': color } as SwatchVars}
                        onClick={() => setCurrentColor(color)}
                        title={color}
                    />
                ))}
            </div>
        </div>
    );
};
