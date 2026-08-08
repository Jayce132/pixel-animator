import React from 'react';
import { useCollabStore } from '../../stores/collabStore';
import { useEditorUiStore } from '../../stores/editorStore';
import { buildEditorCursorArt } from '../../hooks/useEditorCursorStyles';

type CursorVars = React.CSSProperties & Record<'--presence-x' | '--presence-y' | '--presence-cells' | '--presence-color', string>;

/**
 * The peer's cursor is rendered with the exact same tool art the local
 * cursor uses (brush square in their color, eraser, fill diamond, hollow
 * select square) — the only visual difference is the Host/Guest tag.
 */
export const PresenceCursors: React.FC = () => {
    const activeSpriteId = useEditorUiStore(state => state.activeSpriteId);
    const peers = useCollabStore(state => state.peers);

    return (
        <div className="presence-cursors" aria-hidden="true">
            {peers.filter(peer => (
                peer.frameId === activeSpriteId && peer.cursor !== null
            )).map(peer => {
                const { presenceArt } = buildEditorCursorArt({
                    brushSize: peer.brushSize,
                    currentColor: peer.color,
                    currentTool: peer.tool
                });
                if (!presenceArt) return null;
                const { x, y } = peer.cursor!;
                // Center-anchored art sits on the cell's center; top-left art
                // (the 2x brush/eraser footprint) hangs from the cell's corner,
                // mirroring the local cursor's hotspot.
                const centered = presenceArt.anchor === 'center';
                const left = centered ? ((x + 0.5) / 32) * 100 : (x / 32) * 100;
                const top = centered ? ((y + 0.5) / 32) * 100 : (y / 32) * 100;
                return (
                    <div
                        key={peer.clientId}
                        className={`presence-cursor${centered ? ' is-centered' : ''}`}
                        style={{
                            '--presence-x': `${left}%`,
                            '--presence-y': `${top}%`,
                            '--presence-cells': `${presenceArt.viewportCells}`,
                            '--presence-color': peer.color
                        } as CursorVars}
                    >
                        <img className="presence-cursor-art" src={presenceArt.dataUri} alt="" draggable={false} />
                        <span className="presence-cursor-tag">{peer.role === 'host' ? 'Host' : 'Guest'}</span>
                    </div>
                );
            })}
        </div>
    );
};
