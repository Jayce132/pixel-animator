import React from 'react';
import { useEditor } from '../../contexts/EditorContext';
import { RecentColors } from './RecentColors';
import { PaletteGrid } from './PaletteGrid';
import { SelectionTools } from './SelectionTools';

export const Sidebar: React.FC = () => {
    const {
        currentTool,
        setTool,
        undo,
        redo,
        clearCanvas,
        selectedPixels,
        clearSelection
    } = useEditor();

    return (
        <aside className="panel tools-panel" style={{ width: '200px' }}>
            <div className="tool-group">
                <button
                    className={`tool-btn ${currentTool === 'fill' ? 'active' : ''}`}
                    onClick={() => setTool(currentTool === 'fill' ? 'brush' : 'fill')}
                >
                    Fill
                </button>
                <button
                    className={`tool-btn ${currentTool === 'select' || selectedPixels.size > 0 ? 'active' : ''}`}
                    onClick={() => {
                        if (selectedPixels.size > 0) {
                            // If we have a selection, this button acts as Deselect
                            clearSelection();
                        } else {
                            setTool('select');
                        }
                    }}
                >
                    {selectedPixels.size > 0 ? 'Deselect' : 'Select'}
                </button>
            </div>

            <div className="action-group">
                <button className="action-btn" onClick={undo}>Undo</button>
                <button className="action-btn" onClick={redo}>Redo</button>
                <button className="action-btn" onClick={clearCanvas}>Clear</button>
            </div>

            <div className="palette-sidebar">
                <RecentColors />
                {selectedPixels.size > 0 ? (
                    <SelectionTools />
                ) : (
                    <PaletteGrid />
                )}
            </div>
        </aside>
    );
};
