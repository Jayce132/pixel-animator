import React from 'react';
import { useCollabStore } from '../../stores/collabStore';
import { useEditorUiStore } from '../../stores/editorStore';
import { selectActiveSprite } from '../../stores/editorSelectors';
import { GRID_SIZE } from '../../types';
import { getCompositePixelData } from '../../utils/compositing';
import { getPixelColor } from '../../utils/pixelData';
import { nearestPaletteIndex } from '../../utils/palettes';
import { useEscapeKey } from './collabUi';

export const ConsentPrompt: React.FC = () => {
    const proposal = useCollabStore(state => state.incomingProposal);
    const activeSprite = useEditorUiStore(selectActiveSprite);
    const palette = useEditorUiStore(state => state.palette);
    const previewRef = React.useRef<HTMLCanvasElement>(null);
    const proposedColors = proposal?.kind === 'palette-convert' ? proposal.payload.colors : undefined;

    React.useEffect(() => {
        const canvas = previewRef.current;
        if (!canvas || !activeSprite || !proposedColors?.length) return;
        const context = canvas.getContext('2d');
        if (!context) return;
        context.clearRect(0, 0, GRID_SIZE, GRID_SIZE);
        const pixels = getCompositePixelData(activeSprite);
        pixels.forEach((_value, index) => {
            const currentColor = getPixelColor(pixels, index, palette);
            if (!currentColor) return;
            context.fillStyle = proposedColors[nearestPaletteIndex(currentColor, proposedColors)];
            context.fillRect(index % GRID_SIZE, Math.floor(index / GRID_SIZE), 1, 1);
        });
    }, [activeSprite, palette, proposedColors]);

    const proposalId = proposal?.id ?? null;
    useEscapeKey(React.useCallback(() => {
        if (proposalId === null) return;
        void import('../../collab/session').then(({ respondToWholesaleProposal }) => {
            respondToWholesaleProposal(proposalId, false);
        });
    }, [proposalId]));

    if (!proposal) return null;

    const respond = async (approved: boolean) => {
        const { respondToWholesaleProposal } = await import('../../collab/session');
        respondToWholesaleProposal(proposal.id, approved);
    };

    const peerLabel = proposal.peerRole === 'host' ? 'Host' : 'Guest';
    const isPalette = proposal.kind === 'palette-convert';
    return (
        <div className="collab-modal-backdrop">
            <section className="collab-modal" role="dialog" aria-modal="true" aria-labelledby="consent-title">
                <h2 id="consent-title">{peerLabel} requests a project-wide change</h2>
                <p>
                    {isPalette
                        ? 'Convert every frame to this palette? Strokes made while you decide will still merge.'
                        : `Replace the shared project with ${proposal.payload.fileName ?? 'another project'}?`}
                </p>
                {isPalette && proposal.payload.colors && (
                    <>
                        <canvas
                            ref={previewRef}
                            width={GRID_SIZE}
                            height={GRID_SIZE}
                            className="collab-art-preview"
                            aria-label="Active frame converted to the proposed palette"
                        />
                        <div className="collab-palette-preview" aria-label="Proposed palette">
                            {proposal.payload.colors.slice(0, 64).map((color, index) => (
                                <span key={`${color}-${index}`} style={{ backgroundColor: color }} />
                            ))}
                        </div>
                    </>
                )}
                {!isPalette && proposal.payload.contentHash && (
                    <p className="collab-fine-print">
                        {proposal.payload.fileSize?.toLocaleString() ?? '?'} bytes · SHA-256 {proposal.payload.contentHash.slice(0, 12)}…
                    </p>
                )}
                <div className="collab-modal-actions">
                    <button
                        type="button"
                        className="primary-btn"
                        onClick={() => { void respond(true); }}
                    >
                        Approve
                    </button>
                    <button
                        type="button"
                        className="secondary-btn"
                        autoFocus
                        onClick={() => { void respond(false); }}
                    >
                        Decline
                    </button>
                </div>
            </section>
        </div>
    );
};
