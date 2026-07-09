import React from 'react';
import { useEditorUiStore } from '../../stores/editorStore';

export const SelectionTools: React.FC = () => {
    const flipSelectionHorizontal = useEditorUiStore(state => state.flipSelectionHorizontal);
    const flipSelectionVertical = useEditorUiStore(state => state.flipSelectionVertical);
    const rotateSelectionLeft = useEditorUiStore(state => state.rotateSelectionLeft);
    const rotateSelectionRight = useEditorUiStore(state => state.rotateSelectionRight);

    return (
        <div className="palette-section">
            <h3>Selection Tools</h3>
            <div className="transform-controls">
                <button className="action-btn" title="Flip Horizontal (H)" onClick={flipSelectionHorizontal}>Flip H</button>
                <button className="action-btn" title="Flip Vertical (V)" onClick={flipSelectionVertical}>Flip V</button>
                <button className="action-btn" title="Rotate Left (Q)" onClick={rotateSelectionLeft}>Rotate L</button>
                <button className="action-btn" title="Rotate Right (E)" onClick={rotateSelectionRight}>Rotate R</button>
            </div>
        </div>
    );
};
