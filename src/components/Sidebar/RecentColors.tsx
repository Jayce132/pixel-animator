import React from 'react';
import { useEditorUiStore } from '../../stores/editorStore';

const MAX_SLOTS = 8;
type SwatchVars = React.CSSProperties & Record<'--swatch-color', string>;

export const RecentColors: React.FC = () => {
    const recentColors = useEditorUiStore(state => state.recentColors);
    const setCurrentColor = useEditorUiStore(state => state.setCurrentColor);
    const currentTool = useEditorUiStore(state => state.currentTool);
    const setTool = useEditorUiStore(state => state.setTool);
    const currentColor = useEditorUiStore(state => state.currentColor);

    if (recentColors.length === 0) return null;

    // If user has 3 or fewer recent colors, show 4 slots (1 clear + 3 colors).
    // If they have 4 or more, expand to show all 8 slots.
    const displaySlots = recentColors.length >= 4 ? MAX_SLOTS : 4;
    const slots = Array.from({ length: displaySlots });

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
                                className={`palette-color has-color ${color === currentColor && currentTool !== 'eraser' && currentTool !== 'select' ? 'active' : ''}`}
                                style={{ '--swatch-color': color } as SwatchVars}
                                onClick={() => setCurrentColor(color)}
                                title={color}
                            />
                        );
                    }

                    // Empty slot
                    return <div key={`empty-${index}`} className="palette-color empty" />;
                })}
            </div>
        </div>
    );
};
