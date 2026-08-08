import { useMemo } from 'react';
import type { Tool } from '../types';

interface EditorCursorArtOptions {
    brushSize: 1 | 2;
    currentColor: string | null;
    currentTool: Tool;
}

interface EditorCursorStyles {
    cursorStyle: { cursor: string };
    faintCursorStyle: string;
    selectionCursorStyle: { cursor: string };
}

/**
 * The same tool art rendered for a remote peer's presence cursor: the raw
 * SVG as a data URI, how many grid cells its viewport spans, and how it
 * anchors to the pointed-at cell. A peer's cursor looks exactly like the
 * local one would — only the Host/Guest tag next to it differs.
 */
export interface PresenceCursorArt {
    dataUri: string;
    viewportCells: number;
    anchor: 'center' | 'top-left';
}

const BASE_PIXEL = 463 / 32; // Editor base width divided by grid size.

const encodeSvgCursor = (svg: string, hotspotX: number, hotspotY: number) => (
    `url('data:image/svg+xml;utf8,${encodeURIComponent(svg)}') ${hotspotX} ${hotspotY}, auto`
);

const svgDataUri = (svg: string) => `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;

export const buildEditorCursorArt = ({
    brushSize,
    currentColor,
    currentTool
}: EditorCursorArtOptions): EditorCursorStyles & { presenceArt: PresenceCursorArt | null } => {
    // The 1x brush uses one visual cell; the 2x brush uses two cells to
    // communicate the full footprint without covering too much artwork.
    const containerSize = brushSize === 1 ? BASE_PIXEL : BASE_PIXEL * 2;
    const pad = brushSize === 1 ? 3 : 6;
    const drawSize = containerSize - (pad * 2);

    if (currentTool === 'brush') {
        const half = containerSize / 2;
        const hotspotX = brushSize === 2 ? 0 : half;
        const hotspotY = brushSize === 2 ? 0 : half;

        const svg = `
            <svg width="${containerSize}" height="${containerSize}" viewBox="0 0 ${containerSize} ${containerSize}" xmlns="http://www.w3.org/2000/svg">
                <rect x="${pad}" y="${pad}" width="${drawSize}" height="${drawSize}" fill="${currentColor}" stroke="white" stroke-width="1" />
            </svg>
        `;
        const faintSvg = `
            <svg width="${containerSize}" height="${containerSize}" viewBox="0 0 ${containerSize} ${containerSize}" xmlns="http://www.w3.org/2000/svg">
                <rect x="${pad}" y="${pad}" width="${drawSize}" height="${drawSize}" fill="${currentColor}" stroke="white" stroke-width="1" opacity="0.3" />
            </svg>
        `;
        const glowSvg = `
            <svg width="${containerSize}" height="${containerSize}" viewBox="0 0 ${containerSize} ${containerSize}" xmlns="http://www.w3.org/2000/svg">
                 <defs>
                    <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
                        <feGaussianBlur stdDeviation="2" result="coloredBlur"/>
                        <feMerge>
                            <feMergeNode in="coloredBlur"/>
                            <feMergeNode in="SourceGraphic"/>
                        </feMerge>
                    </filter>
                </defs>
                <rect x="${pad}" y="${pad}" width="${drawSize}" height="${drawSize}" fill="${currentColor || 'none'}" stroke="white" stroke-width="2" filter="url(#glow)" />
            </svg>
        `;

        return {
            cursorStyle: { cursor: encodeSvgCursor(svg, hotspotX, hotspotY) },
            faintCursorStyle: encodeSvgCursor(faintSvg, hotspotX, hotspotY),
            selectionCursorStyle: { cursor: encodeSvgCursor(glowSvg, hotspotX, hotspotY) },
            presenceArt: {
                dataUri: svgDataUri(svg),
                viewportCells: brushSize,
                anchor: brushSize === 2 ? 'top-left' : 'center'
            }
        };
    }

    if (currentTool === 'eraser') {
        const half = containerSize / 2;
        const hotspotX = brushSize === 2 ? 0 : half;
        const hotspotY = brushSize === 2 ? 0 : half;
        const svg = `
            <svg width="${containerSize}" height="${containerSize}" viewBox="0 0 ${containerSize} ${containerSize}" xmlns="http://www.w3.org/2000/svg">
                <rect x="${pad}" y="${pad}" width="${drawSize}" height="${drawSize}" fill="#2d2d2d" stroke="#3e3e3e" stroke-width="1" />
                <line x1="${containerSize - pad}" y1="${pad}" x2="${pad}" y2="${containerSize - pad}" stroke="#ff3333" stroke-width="2" />
            </svg>
        `;
        const faintSvg = `
            <svg width="${containerSize}" height="${containerSize}" viewBox="0 0 ${containerSize} ${containerSize}" xmlns="http://www.w3.org/2000/svg">
                 <g opacity="0.3">
                    <rect x="${pad}" y="${pad}" width="${drawSize}" height="${drawSize}" fill="#2d2d2d" stroke="#3e3e3e" stroke-width="1" />
                    <line x1="${containerSize - pad}" y1="${pad}" x2="${pad}" y2="${containerSize - pad}" stroke="#ff3333" stroke-width="2" />
                </g>
            </svg>
        `;

        return {
            cursorStyle: { cursor: encodeSvgCursor(svg, hotspotX, hotspotY) },
            faintCursorStyle: encodeSvgCursor(faintSvg, hotspotX, hotspotY),
            selectionCursorStyle: { cursor: 'default' },
            presenceArt: {
                dataUri: svgDataUri(svg),
                viewportCells: brushSize,
                anchor: brushSize === 2 ? 'top-left' : 'center'
            }
        };
    }

    if (currentTool === 'select') {
        const svgSize = BASE_PIXEL;
        const half = svgSize / 2;
        const svg = `
            <svg width="${svgSize}" height="${svgSize}" viewBox="0 0 ${svgSize} ${svgSize}" xmlns="http://www.w3.org/2000/svg">
               <defs>
                    <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
                        <feGaussianBlur stdDeviation="2" result="coloredBlur"/>
                        <feMerge>
                            <feMergeNode in="coloredBlur"/>
                            <feMergeNode in="SourceGraphic"/>
                        </feMerge>
                    </filter>
                </defs>
                <rect x="2" y="2" width="${svgSize - 4}" height="${svgSize - 4}" fill="none" stroke="white" stroke-width="2" filter="url(#glow)" />
            </svg>
        `;

        return {
            cursorStyle: { cursor: encodeSvgCursor(svg, half, half) },
            faintCursorStyle: 'default',
            selectionCursorStyle: { cursor: 'default' },
            presenceArt: {
                dataUri: svgDataUri(svg),
                viewportCells: 1,
                anchor: 'center'
            }
        };
    }

    if (currentTool === 'fill') {
        // Fill uses one-cell precision, but the SVG viewport is larger so
        // the rotated bucket marker is not clipped.
        const iconSize = BASE_PIXEL * 2;
        const baseSide = BASE_PIXEL;
        const center = iconSize / 2;
        const offset = (iconSize - baseSide) / 2;

        const svg = `
            <svg width="${iconSize}" height="${iconSize}" viewBox="0 0 ${iconSize} ${iconSize}" xmlns="http://www.w3.org/2000/svg">
                <rect x="${offset}" y="${offset}" width="${baseSide}" height="${baseSide}" fill="${currentColor || 'none'}" stroke="white" stroke-width="1" transform="rotate(45, ${center}, ${center})" />
            </svg>
        `;
        const glowSvg = `
            <svg width="${iconSize}" height="${iconSize}" viewBox="0 0 ${iconSize} ${iconSize}" xmlns="http://www.w3.org/2000/svg">
                 <defs>
                    <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
                        <feGaussianBlur stdDeviation="2" result="coloredBlur"/>
                        <feMerge>
                            <feMergeNode in="coloredBlur"/>
                            <feMergeNode in="SourceGraphic"/>
                        </feMerge>
                    </filter>
                </defs>
                <rect x="${offset + 2}" y="${offset + 2}" width="${baseSide - 4}" height="${baseSide - 4}" fill="${currentColor || 'none'}" stroke="white" stroke-width="2" filter="url(#glow)" transform="rotate(45, ${center}, ${center})" />
            </svg>
        `;

        return {
            cursorStyle: { cursor: encodeSvgCursor(svg, center, center) },
            faintCursorStyle: encodeSvgCursor(svg, center, center),
            selectionCursorStyle: { cursor: encodeSvgCursor(glowSvg, center, center) },
            presenceArt: {
                dataUri: svgDataUri(svg),
                viewportCells: 2,
                anchor: 'center'
            }
        };
    }

    return {
        cursorStyle: { cursor: 'default' },
        faintCursorStyle: 'default',
        selectionCursorStyle: { cursor: 'default' },
        presenceArt: null
    };
};

export const useEditorCursorStyles = ({
    brushSize,
    currentColor,
    currentTool
}: EditorCursorArtOptions): EditorCursorStyles => (
    useMemo(
        () => buildEditorCursorArt({ brushSize, currentColor, currentTool }),
        [brushSize, currentColor, currentTool]
    )
);
