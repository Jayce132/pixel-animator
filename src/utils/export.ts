import type { Palette, PixelData, Sprite } from '../types';
import { getTimestamp } from './save';
import { GIFEncoder, applyPalette } from 'gifenc';
import { getExportLayers } from './compositing';
import { getPixelColor } from './pixelData';

export type LayerExportMode = 'merged' | 'base' | 'top';

const renderFrameToContext = (
    ctx: CanvasRenderingContext2D,
    sprite: Sprite,
    palette: Palette,
    gridSize: number,
    scale: number,
    layerMode: LayerExportMode,
    offsetX: number = 0,
    offsetY: number = 0
) => {
    // Draw each layer exposed by the selected export mode.
    const drawLayer = (pixelData: PixelData) => {
        for (let i = 0; i < pixelData.length; i++) {
            const color = getPixelColor(pixelData, i, palette);
            if (color) {
                const x = (i % gridSize) * scale + offsetX;
                const y = Math.floor(i / gridSize) * scale + offsetY;
                ctx.fillStyle = color;
                ctx.fillRect(x, y, scale, scale);
            }
        }
    };

    getExportLayers(sprite, layerMode).forEach(drawLayer);
};

const triggerDownload = (canvas: HTMLCanvasElement, filename: string) => {
    const dataUrl = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
};

export const exportFrameToPNG = (
    projectName: string,
    sprite: Sprite,
    palette: Palette,
    frameIndex: number,
    gridSize: number,
    scale: number = 10,
    layerMode: LayerExportMode = 'merged'
) => {
    const canvas = document.createElement('canvas');
    canvas.width = gridSize * scale;
    canvas.height = gridSize * scale;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear with transparent black
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    renderFrameToContext(ctx, sprite, palette, gridSize, scale, layerMode);

    const formattedIndex = String(frameIndex + 1).padStart(2, '0');
    const filename = `${projectName}_frame_${formattedIndex}_${layerMode}_${getTimestamp()}.png`;
    triggerDownload(canvas, filename);
};

export const exportSpriteSheetToPNG = (
    projectName: string,
    sprites: Sprite[],
    palette: Palette,
    gridSize: number,
    scale: number = 10,
    layerMode: LayerExportMode = 'merged'
) => {
    if (sprites.length === 0) return;

    const canvas = document.createElement('canvas');
    canvas.width = gridSize * scale * sprites.length;
    canvas.height = gridSize * scale;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    sprites.forEach((sprite, index) => {
        const offsetX = index * gridSize * scale;
        renderFrameToContext(ctx, sprite, palette, gridSize, scale, layerMode, offsetX, 0);
    });

    const filename = `${projectName}_spritesheet_${layerMode}_${getTimestamp()}.png`;
    triggerDownload(canvas, filename);
};

// Helper to extract a global palette from all sprites
const extractGlobalPalette = (sprites: Sprite[], palette: Palette, layerMode: LayerExportMode): number[][] => {
    const uniqueColors = new Set<string>();

    sprites.forEach(sprite => {
        getExportLayers(sprite, layerMode).forEach(pixelData => {
            for (let index = 0; index < pixelData.length; index++) {
                const color = getPixelColor(pixelData, index, palette);
                if (color) uniqueColors.add(color);
            }
        });
    });

    const gifPalette: number[][] = [[0, 0, 0, 0]]; // Index 0 is strictly transparent

    uniqueColors.forEach(hex => {
        // Convert hex to rgb
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        if (result) {
            gifPalette.push([
                parseInt(result[1], 16),
                parseInt(result[2], 16),
                parseInt(result[3], 16)
            ]);
        }
    });

    return gifPalette;
};

export const exportProjectToGIF = (
    projectName: string,
    sprites: Sprite[],
    palette: Palette,
    fps: number,
    gridSize: number,
    scale: number = 20, // 16 * 20 = 320px
    layerMode: LayerExportMode = 'merged'
) => {
    if (sprites.length === 0) return;

    // 1. Setup the encoder
    const gif = GIFEncoder();
    const delay = Math.round(1000 / fps);
    const globalPalette = extractGlobalPalette(sprites, palette, layerMode);

    // 2. Setup workspaces
    // The base 16x16 canvas for merging layers together exactly as drawn
    const baseCanvas = document.createElement('canvas');
    baseCanvas.width = gridSize;
    baseCanvas.height = gridSize;
    const baseCtx = baseCanvas.getContext('2d');

    // The scaled up canvas (320x320) for Nearest-Neighbor
    const scaledCanvas = document.createElement('canvas');
    scaledCanvas.width = gridSize * scale;
    scaledCanvas.height = gridSize * scale;
    const scaledCtx = scaledCanvas.getContext('2d');

    if (!baseCtx || !scaledCtx) return;

    // Must be set BEFORE drawing
    scaledCtx.imageSmoothingEnabled = false;

    // 3. Process each frame
    sprites.forEach(sprite => {
        // Clear both canvases
        baseCtx.clearRect(0, 0, baseCanvas.width, baseCanvas.height);
        scaledCtx.clearRect(0, 0, scaledCanvas.width, scaledCanvas.height);

        // Draw pixel data onto 16x16 (scale 1)
        renderFrameToContext(baseCtx, sprite, palette, gridSize, 1, layerMode);

        // Scale it up onto the 320x320
        scaledCtx.drawImage(baseCanvas, 0, 0, scaledCanvas.width, scaledCanvas.height);

        // Extract raw RGBA
        const imageData = scaledCtx.getImageData(0, 0, scaledCanvas.width, scaledCanvas.height);
        const rawPixels = imageData.data;

        // Map colors purely to our extracted palette indices
        const indexedPixels = applyPalette(rawPixels, globalPalette);

        // Write frame
        gif.writeFrame(indexedPixels, scaledCanvas.width, scaledCanvas.height, {
            palette: globalPalette,
            delay: delay,
            transparent: true,
            transparentIndex: 0
        });
    });

    // 4. Finish and download Blob
    gif.finish();
    const buffer = gif.bytesView();
    // Wrap to resolve ArrayBuffer compatibility issue
    const blob = new Blob([new Uint8Array(buffer)], { type: 'image/gif' });
    const url = URL.createObjectURL(blob);

    const filename = `${projectName}_animation_${layerMode}_${getTimestamp()}.gif`;

    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    URL.revokeObjectURL(url);
};
