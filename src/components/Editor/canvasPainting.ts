import { GRID_SIZE } from '../../types';
import type { FloatingLayerPixel, Palette, PixelData } from '../../types';
import { getPixelColor } from '../../utils/pixelData';

// Canvas rendering constants
const CHECKER_DARK = '#2a2a2a';
const CHECKER_LIGHT = '#333333';
const ERASER_SWATCH_BACKGROUND = '#2d2d2d';
const ERASER_SWATCH_SLASH = '#ff3333';
const UNSELECTED_ALPHA = 0.35;

function drawEraserSwatchMarker(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number
) {
    ctx.fillStyle = ERASER_SWATCH_BACKGROUND;
    ctx.fillRect(x, y, width, height);

    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, width, height);
    ctx.clip();
    ctx.strokeStyle = ERASER_SWATCH_SLASH;
    ctx.lineWidth = Math.max(1, Math.min(width, height) * 0.11);
    ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
    ctx.shadowBlur = Math.max(1, Math.min(width, height) * 0.08);
    ctx.beginPath();
    ctx.moveTo(x - width * 0.2, y + height * 1.2);
    ctx.lineTo(x + width * 1.2, y - height * 0.2);
    ctx.stroke();
    ctx.restore();
}

export function syncCanvasBackingStore(canvas: HTMLCanvasElement) {
    const pixelRatio = window.devicePixelRatio || 1;
    const width = Math.max(GRID_SIZE, Math.round(canvas.clientWidth * pixelRatio));
    const height = Math.max(GRID_SIZE, Math.round(canvas.clientHeight * pixelRatio));

    if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
    }
}

/**
 * Paint composited pixel data onto a 32×32 canvas.
 * Draws checkerboard for transparent cells, then pixel colors, then floating layer.
 */
export function paintMainCanvas(
    ctx: CanvasRenderingContext2D,
    displayPixels: PixelData,
    floatingLayer: Map<number, FloatingLayerPixel>,
    palette: Palette,
    selectedPixels: Set<number>,
    hasSelection: boolean
) {
    ctx.clearRect(0, 0, GRID_SIZE, GRID_SIZE);

    for (let i = 0; i < GRID_SIZE * GRID_SIZE; i++) {
        const x = i % GRID_SIZE;
        const y = Math.floor(i / GRID_SIZE);
        const hasFloatingPixel = floatingLayer.has(i);
        const color = hasFloatingPixel ? floatingLayer.get(i) ?? null : getPixelColor(displayPixels, i, palette);

        // Dim unselected pixels when selection exists
        const dimmed = hasSelection && !selectedPixels.has(i);

        // Checkerboard for transparent pixels
        if (!color) {
            ctx.globalAlpha = dimmed ? UNSELECTED_ALPHA : 1;
            if (hasFloatingPixel) {
                drawEraserSwatchMarker(ctx, x, y, 1, 1);
            } else {
                ctx.fillStyle = (x + y) % 2 === 0 ? CHECKER_DARK : CHECKER_LIGHT;
                ctx.fillRect(x, y, 1, 1);
            }
        } else {
            ctx.globalAlpha = dimmed ? UNSELECTED_ALPHA : 1;
            ctx.fillStyle = color;
            ctx.fillRect(x, y, 1, 1);
        }
    }
    ctx.globalAlpha = 1;
}

/**
 * Paint overlays: selection outlines, line/circle previews, onion skin, cursor highlight.
 */
export function paintOverlayCanvas(
    ctx: CanvasRenderingContext2D,
    options: {
        selectedPixels: Set<number>;
        floatingLayer: Map<number, FloatingLayerPixel>;
        linePreviewSet: Set<number>;
        circlePreviewSet: Set<number>;
        currentColor: string | null;
        currentTool: string;
        onionSkinPixels: PixelData | null;
        palette: Palette;
        hoverIndex: number | null;
        brushSize: 1 | 2;
        isDrawing: boolean;
    }
) {
    const {
        selectedPixels, floatingLayer, linePreviewSet, circlePreviewSet,
        currentColor, currentTool, onionSkinPixels, palette,
        hoverIndex, brushSize, isDrawing
    } = options;
    const canvasWidth = ctx.canvas.width;
    const canvasHeight = ctx.canvas.height;
    const cellWidth = canvasWidth / GRID_SIZE;
    const cellHeight = canvasHeight / GRID_SIZE;
    const pixelRatio = Math.max(1, canvasWidth / Math.max(1, ctx.canvas.clientWidth));
    const selectionStrokeWidth = Math.max(1, Math.round(2 * pixelRatio));
    const previewStrokeWidth = Math.max(1, Math.round(pixelRatio));
    const cellRect = (index: number) => {
        const x = index % GRID_SIZE;
        const y = Math.floor(index / GRID_SIZE);
        return {
            x: x * cellWidth,
            y: y * cellHeight,
            width: cellWidth,
            height: cellHeight
        };
    };

    ctx.clearRect(0, 0, canvasWidth, canvasHeight);

    // 1. Onion skin (previous frame at 25% opacity)
    if (onionSkinPixels) {
        ctx.globalAlpha = 0.25;
        for (let i = 0; i < GRID_SIZE * GRID_SIZE; i++) {
            const color = getPixelColor(onionSkinPixels, i, palette);
            if (color) {
                const rect = cellRect(i);
                ctx.fillStyle = color;
                ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
            }
        }
        ctx.globalAlpha = 1;
    }

    // 2. Explicit eraser pixels in the floating stamp use the same visual language as the clear swatch.
    if (floatingLayer.size > 0) {
        ctx.save();
        for (const [idx, color] of floatingLayer.entries()) {
            if (color !== null) continue;
            ctx.globalAlpha = selectedPixels.size > 0 && !selectedPixels.has(idx) ? UNSELECTED_ALPHA : 1;
            const rect = cellRect(idx);
            drawEraserSwatchMarker(ctx, rect.x, rect.y, rect.width, rect.height);
        }
        ctx.restore();
        ctx.globalAlpha = 1;
    }

    // 3. Selection outlines. Draw each lassoed cell independently like the old DOM pixel grid.
    if (selectedPixels.size > 0) {
        ctx.save();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)';
        ctx.lineWidth = selectionStrokeWidth;
        for (const idx of selectedPixels) {
            const rect = cellRect(idx);
            const inset = selectionStrokeWidth / 2;
            ctx.strokeRect(
                rect.x + inset,
                rect.y + inset,
                Math.max(0, rect.width - selectionStrokeWidth),
                Math.max(0, rect.height - selectionStrokeWidth)
            );
        }
        ctx.restore();
    }

    // 4. Line preview
    if (linePreviewSet.size > 0) {
        const isEraser = currentTool === 'eraser';
        ctx.globalAlpha = 0.7;
        for (const idx of linePreviewSet) {
            const rect = cellRect(idx);
            if (isEraser) {
                ctx.fillStyle = 'rgba(255, 51, 51, 0.15)';
                ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
                ctx.strokeStyle = '#ff3333';
                ctx.lineWidth = previewStrokeWidth;
                ctx.strokeRect(rect.x, rect.y, rect.width, rect.height);
            } else {
                ctx.fillStyle = currentColor || 'transparent';
                ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
            }
        }
        ctx.globalAlpha = 1;
    }

    // 5. Circle preview
    if (circlePreviewSet.size > 0) {
        const isEraser = currentTool === 'eraser';
        ctx.globalAlpha = 0.7;
        for (const idx of circlePreviewSet) {
            const rect = cellRect(idx);
            if (isEraser) {
                ctx.fillStyle = 'rgba(255, 51, 51, 0.15)';
                ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
                ctx.strokeStyle = '#ff3333';
                ctx.lineWidth = previewStrokeWidth;
                ctx.strokeRect(rect.x, rect.y, rect.width, rect.height);
            } else {
                ctx.fillStyle = currentColor || 'transparent';
                ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
            }
        }
        ctx.globalAlpha = 1;
    }

    // 6. Cursor highlight (brush footprint)
    if (hoverIndex !== null && !isDrawing) {
        const rect = cellRect(hoverIndex);
        const isLarge = brushSize === 2 && (currentTool === 'brush' || currentTool === 'eraser');
        const cellX = hoverIndex % GRID_SIZE;
        const cellY = Math.floor(hoverIndex / GRID_SIZE);
        const widthCells = isLarge && cellX + 1 < GRID_SIZE ? 2 : 1;
        const heightCells = isLarge && cellY + 1 < GRID_SIZE ? 2 : 1;
        const strokeWidth = Math.max(1, Math.round(2 * pixelRatio));

        ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.lineWidth = strokeWidth;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.fillRect(rect.x, rect.y, rect.width * widthCells, rect.height * heightCells);
        ctx.strokeRect(
            rect.x + strokeWidth / 2,
            rect.y + strokeWidth / 2,
            rect.width * widthCells - strokeWidth,
            rect.height * heightCells - strokeWidth
        );
    }
}

/**
 * Paint a layer preview (for unstacked mode) onto a canvas.
 */
export function paintLayerPreview(
    ctx: CanvasRenderingContext2D,
    pixels: PixelData,
    palette: Palette
) {
    ctx.clearRect(0, 0, GRID_SIZE, GRID_SIZE);
    for (let i = 0; i < GRID_SIZE * GRID_SIZE; i++) {
        const x = i % GRID_SIZE;
        const y = Math.floor(i / GRID_SIZE);
        const color = getPixelColor(pixels, i, palette);
        if (color) {
            ctx.fillStyle = color;
            ctx.fillRect(x, y, 1, 1);
        } else {
            ctx.fillStyle = (x + y) % 2 === 0 ? CHECKER_DARK : CHECKER_LIGHT;
            ctx.fillRect(x, y, 1, 1);
        }
    }
}

/**
 * Paint the floating layer on top of an already-painted 32×32 canvas.
 * Playback renders skip paintMainCanvas (no checkerboard, no dimming), but the
 * floating stamp must stay visible so it can be aimed mid-playback.
 */
export function paintFloatingPixels(
    ctx: CanvasRenderingContext2D,
    floatingLayer: Map<number, FloatingLayerPixel>
) {
    for (const [index, color] of floatingLayer.entries()) {
        const x = index % GRID_SIZE;
        const y = Math.floor(index / GRID_SIZE);
        if (color === null) {
            drawEraserSwatchMarker(ctx, x, y, 1, 1);
        } else {
            ctx.fillStyle = color;
            ctx.fillRect(x, y, 1, 1);
        }
    }
}

/**
 * Paint only the floating layer for stamp feedback.
 * The committed copy remains on the main canvas while this transparent layer jumps.
 */
export function paintStampCanvas(
    ctx: CanvasRenderingContext2D,
    floatingLayer: Map<number, FloatingLayerPixel>
) {
    const canvasWidth = ctx.canvas.width;
    const canvasHeight = ctx.canvas.height;
    const cellWidth = canvasWidth / GRID_SIZE;
    const cellHeight = canvasHeight / GRID_SIZE;
    ctx.clearRect(0, 0, canvasWidth, canvasHeight);
    for (const [index, color] of floatingLayer.entries()) {
        const x = (index % GRID_SIZE) * cellWidth;
        const y = Math.floor(index / GRID_SIZE) * cellHeight;
        if (color === null) {
            drawEraserSwatchMarker(ctx, x, y, cellWidth, cellHeight);
        } else {
            ctx.fillStyle = color;
            ctx.fillRect(x, y, cellWidth, cellHeight);
        }
    }
}

/**
 * Read-only preview of a peer's selection + in-progress drag, tinted with
 * their identity color and dashed (never solid) so it's unmistakably "what
 * they're doing," not real paint on your canvas. Never fed by or written
 * back into local selectedPixels/floatingLayer — those drive real stamp/
 * flip/rotate actions and must stay untouched by remote state.
 */
export function paintPeerSelectionOverlay(
    ctx: CanvasRenderingContext2D,
    options: {
        selectedPixels: Set<number>;
        floatingLayer: Map<number, string | null>;
        peerColor: string;
    }
) {
    const { selectedPixels, floatingLayer, peerColor } = options;
    const canvasWidth = ctx.canvas.width;
    const canvasHeight = ctx.canvas.height;
    const cellWidth = canvasWidth / GRID_SIZE;
    const cellHeight = canvasHeight / GRID_SIZE;
    const pixelRatio = Math.max(1, canvasWidth / Math.max(1, ctx.canvas.clientWidth));
    const strokeWidth = Math.max(1, Math.round(2 * pixelRatio));
    const cellRect = (index: number) => ({
        x: (index % GRID_SIZE) * cellWidth,
        y: Math.floor(index / GRID_SIZE) * cellHeight
    });

    ctx.clearRect(0, 0, canvasWidth, canvasHeight);
    if (selectedPixels.size === 0 && floatingLayer.size === 0) return;

    // Dragged pixels: their real color, translucent, so you see what's being
    // moved without mistaking it for committed art.
    if (floatingLayer.size > 0) {
        ctx.globalAlpha = 0.55;
        for (const [index, color] of floatingLayer.entries()) {
            if (color === null) continue;
            const { x, y } = cellRect(index);
            ctx.fillStyle = color;
            ctx.fillRect(x, y, cellWidth, cellHeight);
        }
        ctx.globalAlpha = 1;
    }

    // Selection outline: dashed and peer-colored — never the app's own solid
    // white selection stroke, so the two are never confused at a glance.
    if (selectedPixels.size > 0) {
        ctx.save();
        ctx.strokeStyle = peerColor;
        ctx.lineWidth = strokeWidth;
        ctx.setLineDash([strokeWidth * 1.5, strokeWidth * 1.5]);
        for (const index of selectedPixels) {
            const { x, y } = cellRect(index);
            const inset = strokeWidth / 2;
            ctx.strokeRect(
                x + inset,
                y + inset,
                Math.max(0, cellWidth - strokeWidth),
                Math.max(0, cellHeight - strokeWidth)
            );
        }
        ctx.restore();
    }
}
