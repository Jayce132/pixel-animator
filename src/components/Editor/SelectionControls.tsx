import React from 'react';
import { useIsMobile } from '../../hooks/useIsMobile';
import { RotateCcw, RotateCw, GripVertical, FlipHorizontal, FlipVertical } from 'lucide-react';
import { useEditorUiStore } from '../../stores/editorStore';

export const SelectionControls: React.FC = () => {
    const selectedPixels = useEditorUiStore(state => state.selectedPixels);
    const flipSelectionHorizontal = useEditorUiStore(state => state.flipSelectionHorizontal);
    const flipSelectionVertical = useEditorUiStore(state => state.flipSelectionVertical);
    const rotateSelectionLeft = useEditorUiStore(state => state.rotateSelectionLeft);
    const rotateSelectionRight = useEditorUiStore(state => state.rotateSelectionRight);
    const activeActions = useEditorUiStore(state => state.activeActions);

    const isMobile = useIsMobile();

    const dispatchVirtualKey = React.useCallback((action: string, type: 'down' | 'up') => {
        window.dispatchEvent(new CustomEvent('virtual-key', { detail: { action, type } }));
    }, []);

    // Draggable state
    const [offset, setOffset] = React.useState({ x: 0, y: 0 });
    const isDraggingRef = React.useRef(false);
    const dragStartRef = React.useRef({ x: 0, y: 0 });

    const handlePointerDown = (e: React.PointerEvent) => {
        isDraggingRef.current = true;
        dragStartRef.current = { x: e.clientX - offset.x, y: e.clientY - offset.y };
        if (e.target instanceof Element) {
            e.target.setPointerCapture(e.pointerId);
        }
    };

    const handlePointerMove = (e: React.PointerEvent) => {
        if (!isDraggingRef.current) return;
        setOffset({
            x: e.clientX - dragStartRef.current.x,
            y: e.clientY - dragStartRef.current.y
        });
    };

    const handlePointerUp = (e: React.PointerEvent) => {
        isDraggingRef.current = false;
        if (e.target instanceof Element) {
            e.target.releasePointerCapture(e.pointerId);
        }
    };

    if (selectedPixels.size === 0) return null;

    return (
        <div
            className={`selection-controls ${isMobile ? 'is-mobile' : ''}`}
            style={{
                '--selection-controls-x': `${offset.x}px`,
                '--selection-controls-y': `${offset.y}px`
            } as React.CSSProperties & Record<'--selection-controls-x' | '--selection-controls-y', string>}
        >
            <div
                className="selection-controls-drag-handle"
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
            >
                <GripVertical size={isMobile ? 14 : 16} />
            </div>
            <div className="timeline-controls-left">
                <button
                    className={`control-btn-small selection-stamp-button ${activeActions.includes('stamp') ? 'active' : ''}`}
                    onPointerDown={(e) => {
                        e.preventDefault();
                        e.currentTarget.setPointerCapture(e.pointerId);
                        dispatchVirtualKey('stamp', 'down');
                    }}
                    onPointerUp={(e) => {
                        e.currentTarget.releasePointerCapture(e.pointerId);
                        dispatchVirtualKey('stamp', 'up');
                    }}
                    onPointerCancel={() => dispatchVirtualKey('stamp', 'up')}
                    onContextMenu={(e) => e.preventDefault()}
                >
                    Stamp (Enter)
                </button>
            </div>
            <div className="file-controls selection-tool-group">
                {/* Transform Tools */}
                <button className={`control-btn-small selection-icon-button ${activeActions.includes('flipH') ? 'active' : ''}`} onClick={flipSelectionHorizontal} title="Flip Horizontal (H)"><FlipHorizontal size={isMobile ? 12 : 14} strokeWidth={3} /></button>
                <button className={`control-btn-small selection-icon-button ${activeActions.includes('flipV') ? 'active' : ''}`} onClick={flipSelectionVertical} title="Flip Vertical (V)"><FlipVertical size={isMobile ? 12 : 14} strokeWidth={3} /></button>
                <button className={`control-btn-small selection-icon-button ${activeActions.includes('rotL') ? 'active' : ''}`} onClick={rotateSelectionLeft} title="Rotate Left (Q)"><RotateCcw size={isMobile ? 12 : 14} strokeWidth={3} /></button>
                <button className={`control-btn-small selection-icon-button ${activeActions.includes('rotR') ? 'active' : ''}`} onClick={rotateSelectionRight} title="Rotate Right (E)"><RotateCw size={isMobile ? 12 : 14} strokeWidth={3} /></button>

                {/* Divider */}
                <div className="selection-controls-divider" />

                <button
                    className={`control-btn-small selection-icon-button selection-nudge-button ${activeActions.includes('left') ? 'active' : ''}`}
                    onMouseDown={(e) => e.preventDefault()}
                    onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); dispatchVirtualKey('left', 'down'); }}
                    onPointerUp={(e) => { e.currentTarget.releasePointerCapture(e.pointerId); dispatchVirtualKey('left', 'up'); }}
                    onPointerCancel={() => { dispatchVirtualKey('left', 'up'); }}
                    onContextMenu={(e) => e.preventDefault()}
                ><span className="selection-nudge-arrow is-left">▾</span></button>
                <button
                    className={`control-btn-small selection-icon-button selection-nudge-button ${activeActions.includes('up') ? 'active' : ''}`}
                    onMouseDown={(e) => e.preventDefault()}
                    onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); dispatchVirtualKey('up', 'down'); }}
                    onPointerUp={(e) => { e.currentTarget.releasePointerCapture(e.pointerId); dispatchVirtualKey('up', 'up'); }}
                    onPointerCancel={() => { dispatchVirtualKey('up', 'up'); }}
                    onContextMenu={(e) => e.preventDefault()}
                ><span className="selection-nudge-arrow is-up">▾</span></button>
                <button
                    className={`control-btn-small selection-icon-button selection-nudge-button ${activeActions.includes('down') ? 'active' : ''}`}
                    onMouseDown={(e) => e.preventDefault()}
                    onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); dispatchVirtualKey('down', 'down'); }}
                    onPointerUp={(e) => { e.currentTarget.releasePointerCapture(e.pointerId); dispatchVirtualKey('down', 'up'); }}
                    onPointerCancel={() => { dispatchVirtualKey('down', 'up'); }}
                    onContextMenu={(e) => e.preventDefault()}
                ><span className="selection-nudge-arrow">▾</span></button>
                <button
                    className={`control-btn-small selection-icon-button selection-nudge-button ${activeActions.includes('right') ? 'active' : ''}`}
                    onMouseDown={(e) => e.preventDefault()}
                    onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); dispatchVirtualKey('right', 'down'); }}
                    onPointerUp={(e) => { e.currentTarget.releasePointerCapture(e.pointerId); dispatchVirtualKey('right', 'up'); }}
                    onPointerCancel={() => { dispatchVirtualKey('right', 'up'); }}
                    onContextMenu={(e) => e.preventDefault()}
                ><span className="selection-nudge-arrow is-right">▾</span></button>
            </div>
        </div>
    );
};
