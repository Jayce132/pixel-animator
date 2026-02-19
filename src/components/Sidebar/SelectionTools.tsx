import React from 'react';
import { useEditor } from '../../contexts/EditorContext';

export const SelectionTools: React.FC = () => {
    const {
        flipSelectionHorizontal,
        flipSelectionVertical,
        rotateSelectionLeft,
        rotateSelectionRight,
        stamp,
        isStamping
    } = useEditor();

    // Stamp Shortcut REMOVED (Moved to Global Hook)
    // React.useEffect(() => {
    //     const handleKeyDown = (e: KeyboardEvent) => {
    //         if (e.code === 'Space') {
    //             e.preventDefault();
    //             stamp();
    //         }
    //     };
    //     window.addEventListener('keydown', handleKeyDown);
    //     return () => window.removeEventListener('keydown', handleKeyDown);
    // }, [stamp]);

    return (
        <div className="palette-section">
            <h3>Selection Tools</h3>
            <div className="transform-controls">
                <button className="action-btn" title="Flip Horizontal (H)" onClick={flipSelectionHorizontal}>Flip H</button>
                <button className="action-btn" title="Flip Vertical (V)" onClick={flipSelectionVertical}>Flip V</button>
                <button className="action-btn" title="Rotate Left (Q)" onClick={rotateSelectionLeft}>Rotate L</button>
                <button className="action-btn" title="Rotate Right (E)" onClick={rotateSelectionRight}>Rotate R</button>
            </div>
            <div className="transform-controls">
                <button
                    className={`action-btn ${isStamping ? 'active' : ''}`}
                    title="Stamp (Enter)"
                    onClick={stamp}
                    style={{ gridColumn: 'span 2', marginTop: '8px', fontSize: '0.85rem' }}
                >
                    Stamp
                </button>
            </div>
        </div>
    );
};
