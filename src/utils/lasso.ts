import { GRID_SIZE, TOTAL_PIXELS } from '../types';

/**
 * Calculates the filled interior of a lasso selection.
 * Uses a flood-fill algorithm from the outside borders to find all "outside" pixels.
 * Any pixel that is NOT "outside" and NOT part of the boundary is considered "inside".
 * 
 * @param boundaryPixels The set of pixels drawn by the user (the "walls")
 * @returns A Set of all pixel indices that are part of the selection (boundary + interior)
 */
export const calculateLassoSelection = (boundaryPixels: Set<number>): Set<number> => {
    // 1. Create a set of "wall" pixels (current selection path)
    const walls = new Set(boundaryPixels);
    const explored = new Set<number>();
    const queue: number[] = [];

    // 2. Add all border pixels to queue to start flood fill from outside
    for (let x = 0; x < GRID_SIZE; x++) {
        queue.push(x); // Top row
        queue.push((GRID_SIZE - 1) * GRID_SIZE + x); // Bottom row
    }
    for (let y = 1; y < GRID_SIZE - 1; y++) {
        const leftRowIndex = y * GRID_SIZE;
        queue.push(leftRowIndex); // Left col
        queue.push(leftRowIndex + GRID_SIZE - 1); // Right col
    }

    // 3. Flood fill from outside to find all reachable "outside" pixels
    while (queue.length > 0) {
        const idx = queue.shift()!;
        if (explored.has(idx) || walls.has(idx)) continue;

        explored.add(idx);

        const x = idx % GRID_SIZE;
        const y = Math.floor(idx / GRID_SIZE);

        // Neighbors
        const neighbors: number[] = [];
        if (y > 0) neighbors.push(idx - GRID_SIZE); // Up
        if (y < GRID_SIZE - 1) neighbors.push(idx + GRID_SIZE); // Down
        if (x > 0) neighbors.push(idx - 1); // Left
        if (x < GRID_SIZE - 1) neighbors.push(idx + 1); // Right

        for (const n of neighbors) {
            if (!explored.has(n) && !walls.has(n)) {
                queue.push(n);
            }
        }
    }

    // 4. Any pixel NOT explored (outside) is "inside" (including walls)
    const finalSelection = new Set<number>();
    for (let i = 0; i < TOTAL_PIXELS; i++) {
        if (!explored.has(i)) {
            finalSelection.add(i);
        }
    }

    return finalSelection;
};
