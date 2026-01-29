import React from 'react';
import { useEditor } from '../../contexts/EditorContext';

export const EditorControls: React.FC = () => {
    const {
        currentTool,
        setTool,
        undo,
        redo,
        clearCanvas,
        selectedPixels,
        clearSelection,
        brushSize,
        setBrushSize
    } = useEditor();

    return (
        <>
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
                            setTool(currentTool === 'select' ? 'brush' : 'select');
                        }
                    }}
                >
                    {selectedPixels.size > 0 ? 'Deselect' : 'Select'}
                </button>
            </div>

            {/* Brush Size Controls */}
            {(currentTool === 'brush' || currentTool === 'eraser') && (
                <div className="tool-group" style={{ flexDirection: 'row', gap: '4px' }}>
                    <button
                        className={`tool-btn ${brushSize === 1 ? 'active' : ''}`}
                        onClick={() => setBrushSize(1)}
                        style={{ fontSize: '0.8rem' }}
                    >
                        1x
                    </button>
                    <button
                        className={`tool-btn ${brushSize === 2 ? 'active' : ''}`}
                        onClick={() => setBrushSize(2)}
                        style={{ fontSize: '0.8rem' }}
                    >
                        2x
                    </button>
                </div>
            )}

            <div className="action-group">
                <button className="action-btn" onClick={undo}>Undo</button>
                <button className="action-btn" onClick={redo}>Redo</button>
                <button className="action-btn" onClick={clearCanvas}>Clear</button>
            </div>
        </>
    );
};
