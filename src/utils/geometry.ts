import { GRID_SIZE } from '../types';
import type { FloatingLayerPixel } from '../types';

export interface SelectionBounds {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
    width: number;
    height: number;
}

export type SelectionIndexMapper = (index: number, bounds: SelectionBounds) => number | null;

const toIndex = (x: number, y: number): number | null => {
    if (x < 0 || x >= GRID_SIZE || y < 0 || y >= GRID_SIZE) return null;
    return y * GRID_SIZE + x;
};

const getSelectionBounds = (indices: Iterable<number>): SelectionBounds | null => {
    let minX = GRID_SIZE;
    let maxX = -1;
    let minY = GRID_SIZE;
    let maxY = -1;
    let hasIndices = false;

    for (const index of indices) {
        hasIndices = true;
        const x = index % GRID_SIZE;
        const y = Math.floor(index / GRID_SIZE);
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
    }

    if (!hasIndices) return null;

    return {
        minX,
        maxX,
        minY,
        maxY,
        width: maxX - minX + 1,
        height: maxY - minY + 1
    };
};

export const transformSelection = (
    selectedPixels: Set<number>,
    floatingLayer: Map<number, FloatingLayerPixel>,
    mapIndex: SelectionIndexMapper
): {
    selectedPixels: Set<number>;
    floatingLayer: Map<number, FloatingLayerPixel>;
    didTransform: boolean;
} => {
    const boundsSource: Iterable<number> = selectedPixels.size > 0
        ? selectedPixels
        : floatingLayer.keys();
    const bounds = getSelectionBounds(boundsSource);

    if (!bounds) {
        return { selectedPixels, floatingLayer, didTransform: false };
    }

    const nextSelectedPixels = new Set<number>();
    for (const index of selectedPixels) {
        const mappedIndex = mapIndex(index, bounds);
        if (mappedIndex !== null) {
            nextSelectedPixels.add(mappedIndex);
        }
    }

    const nextFloatingLayer = new Map<number, FloatingLayerPixel>();
    for (const [index, color] of floatingLayer.entries()) {
        const mappedIndex = mapIndex(index, bounds);
        if (mappedIndex !== null) {
            nextFloatingLayer.set(mappedIndex, color);
        }
    }

    return {
        selectedPixels: nextSelectedPixels,
        floatingLayer: nextFloatingLayer,
        didTransform: true
    };
};

export const flipHorizontalIndex: SelectionIndexMapper = (index, bounds) => {
    const x = index % GRID_SIZE;
    const y = Math.floor(index / GRID_SIZE);
    const newX = bounds.maxX - (x - bounds.minX);
    return toIndex(newX, y);
};

export const flipVerticalIndex: SelectionIndexMapper = (index, bounds) => {
    const x = index % GRID_SIZE;
    const y = Math.floor(index / GRID_SIZE);
    const newY = bounds.maxY - (y - bounds.minY);
    return toIndex(x, newY);
};

export const rotateLeftIndex: SelectionIndexMapper = (index, bounds) => {
    const x = index % GRID_SIZE;
    const y = Math.floor(index / GRID_SIZE);
    const relX = x - bounds.minX;
    const relY = y - bounds.minY;
    const newRelX = relY;
    const newRelY = bounds.width - 1 - relX; // 90 CCW
    return toIndex(bounds.minX + newRelX, bounds.minY + newRelY);
};

export const rotateRightIndex: SelectionIndexMapper = (index, bounds) => {
    const x = index % GRID_SIZE;
    const y = Math.floor(index / GRID_SIZE);
    const relX = x - bounds.minX;
    const relY = y - bounds.minY;
    const newRelX = bounds.height - 1 - relY;
    const newRelY = relX; // 90 CW
    return toIndex(bounds.minX + newRelX, bounds.minY + newRelY);
};
