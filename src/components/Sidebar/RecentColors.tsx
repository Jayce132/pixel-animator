import React from 'react';
import { useEditor } from '../../contexts/EditorContext';

const MAX_SLOTS = 8;

export const RecentColors: React.FC = () => {
    const { recentColors, setCurrentColor, currentTool, setTool, currentColor } = useEditor();

    // Loop to create 8 slots
    // Slot 0 is always Clear
    // Slots 1-7 are recent colors
    const slots = Array.from({ length: MAX_SLOTS });

    return (
        <div className="recent-colors-section">
            <h3>Recent</h3>
            <div className="recent-colors-grid">
                {slots.map((_, index) => {
                    if (index === 0) {
                        return (
                            <div
                                key="clear"
                                className={`palette-color clear-swatch ${currentTool === 'eraser' || (currentTool === 'fill' && currentColor === null) ? 'active' : ''}`}
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

                    const colorIndex = index - 1;
                    const color = recentColors[colorIndex];

                    if (color) {
                        return (
                            <div
                                key={color}
                                className={`palette-color ${color === currentColor && currentTool !== 'eraser' && currentTool !== 'select' ? 'active' : ''}`}
                                style={{ backgroundColor: color }}
                                onClick={() => setCurrentColor(color)}
                                title={color}
                            />
                        );
                    }

                    // Empty slot
                    return <div key={`empty-${index}`} className="palette-color empty" style={{ opacity: 0.1, background: '#333' }} />;
                })}
            </div>
        </div>
    );
};
