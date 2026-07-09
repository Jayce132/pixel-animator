import React from 'react';
import { useEditorUiStore } from '../../stores/editorStore';
import { selectCanClear, selectCanRedo, selectCanUndo } from '../../stores/editorSelectors';

export const EditorControls: React.FC = () => {
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
    const recentColors = useEditorUiStore(state => state.recentColors);

    return (
        <>
            {recentColors.length > 0 && (
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

            {/* Brush Size Controls */}
            {recentColors.length > 0 && (currentTool === 'brush' || currentTool === 'eraser') && (
                <div className="tool-group brush-size-group">
                    <button
                        className={`tool-btn brush-size-btn ${brushSize === 1 ? 'active' : ''}`}
                        onClick={() => setBrushSize(1)}
                    >
                        1x
                    </button>
                    <button
                        className={`tool-btn brush-size-btn ${brushSize === 2 ? 'active' : ''}`}
                        onClick={() => setBrushSize(2)}
                    >
                        2x
                    </button>
                </div>
            )}

            {(canUndo || canRedo || canClear) && (
                <div className="action-group">
                    <button className="action-btn" disabled={!canUndo} onClick={undo}>Undo</button>
                    <button className="action-btn" disabled={!canRedo} onClick={redo}>Redo</button>
                    <button className="action-btn" disabled={!canClear} onClick={clearCanvas}>Clear</button>
                </div>
            )}
        </>
    );
};
