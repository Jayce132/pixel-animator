import { GRID_SIZE } from '../types';

/**
 * Calculates all pixel indices between two points using Bresenham's algorithm.
 */
export function getLinePixels(startIndex: number, endIndex: number): number[] {
    const x0 = startIndex % GRID_SIZE;
    const y0 = Math.floor(startIndex / GRID_SIZE);
    const x1 = endIndex % GRID_SIZE;
    const y1 = Math.floor(endIndex / GRID_SIZE);

    const pixels: number[] = [];
    const dx = Math.abs(x1 - x0);
    const dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;

    let currX = x0;
    let currY = y0;

    while (true) {
        if (currX >= 0 && currX < GRID_SIZE && currY >= 0 && currY < GRID_SIZE) {
            pixels.push(currY * GRID_SIZE + currX);
        }

        if (currX === x1 && currY === y1) break;

        const e2 = 2 * err;
        if (e2 > -dy) {
            err -= dy;
            currX += sx;
        }
        if (e2 < dx) {
            err += dx;
            currY += sy;
        }
    }

    return pixels;
}
