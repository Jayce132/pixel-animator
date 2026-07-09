import type { FloatingLayerPixel, Palette, PixelData, Sprite } from '../types';
import { createBlankPixelData, getPixelColor, TRANSPARENT_PIXEL } from './pixelData';

export type LayerKey = 'base' | 'top';
export type LayerCompositeMode = 'merged' | LayerKey;

export interface LayeredPixelData {
    pixelData: PixelData;
    overlayPixelData: PixelData;
}

export const getSpriteLayerPixels = (
    sprite: LayeredPixelData,
    layer: LayerKey
): PixelData => (
    layer === 'base' ? sprite.pixelData : sprite.overlayPixelData
);

export const getCompositePixelData = (sprite: LayeredPixelData): PixelData => {
    const composite = createBlankPixelData(sprite.pixelData.length);
    for (let index = 0; index < sprite.pixelData.length; index++) {
        const overlayPixel = sprite.overlayPixelData[index] ?? TRANSPARENT_PIXEL;
        composite[index] = overlayPixel !== TRANSPARENT_PIXEL
            ? overlayPixel
            : (sprite.pixelData[index] ?? TRANSPARENT_PIXEL);
    }
    return composite;
};

export const getEditorDisplayPixels = (
    sprite: LayeredPixelData,
    editingLayer: LayerKey,
    isOverlayStacked: boolean
): PixelData => (
    isOverlayStacked ? getCompositePixelData(sprite) : getSpriteLayerPixels(sprite, editingLayer)
);

export const getInactiveLayerPixels = (
    sprite: LayeredPixelData,
    editingLayer: LayerKey
): PixelData => (
    editingLayer === 'base' ? sprite.overlayPixelData : sprite.pixelData
);

export const getVisibleLayerColorAtIndex = (
    pixels: PixelData,
    floatingLayer: Map<number, FloatingLayerPixel>,
    palette: Palette,
    index: number
): string | null => (
    floatingLayer.has(index) ? floatingLayer.get(index) ?? null : getPixelColor(pixels, index, palette)
);

export const getVisibleColorAtIndex = (
    basePixels: PixelData,
    overlayPixels: PixelData,
    floatingLayer: Map<number, FloatingLayerPixel>,
    palette: Palette,
    isOverlayStacked: boolean,
    editingLayer: LayerKey,
    index: number
): string | null => {
    if (floatingLayer.has(index)) {
        return floatingLayer.get(index) ?? null;
    }

    if (!isOverlayStacked) {
        return getPixelColor(editingLayer === 'base' ? basePixels : overlayPixels, index, palette);
    }

    return getPixelColor(overlayPixels[index] ? overlayPixels : basePixels, index, palette);
};

export const getExportLayers = (
    sprite: Sprite,
    layerMode: LayerCompositeMode
): PixelData[] => {
    if (layerMode === 'base') return [sprite.pixelData];
    if (layerMode === 'top') return [sprite.overlayPixelData];
    return [sprite.pixelData, sprite.overlayPixelData];
};
