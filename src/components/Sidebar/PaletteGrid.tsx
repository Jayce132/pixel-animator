import React from 'react';
import { useEditor } from '../../contexts/EditorContext';
import { PRESET_COLORS } from '../../types';

export const PaletteGrid: React.FC = () => {
    const { currentColor, setCurrentColor, currentTool } = useEditor();

    return (
        <div className="palette-section">
            <h3>Palette</h3>
            <div className="palette-grid">
                {PRESET_COLORS.map((color) => (
                    <div
                        key={color}
                        className={`palette-color ${color === currentColor && currentTool !== 'eraser' && currentTool !== 'select' ? 'active' : ''}`}
                        style={{ backgroundColor: color }}
                        onClick={() => setCurrentColor(color)}
                        title={color}
                    />
                ))}
            </div>
        </div>
    );
};
