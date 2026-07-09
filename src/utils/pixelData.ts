import { TOTAL_PIXELS } from '../types';
import type { Palette, PixelData } from '../types';

export const TRANSPARENT_PIXEL = 0;
export const MAX_PALETTE_COLORS = 255;

const paletteIndexCache = new WeakMap<Palette, Map<string, number>>();

export const createBlankPixelData = (length: number = TOTAL_PIXELS): PixelData => (
    new Uint8Array(length)
);

export const clonePixelData = (pixelData: PixelData): PixelData => pixelData.slice();

export const pixelDataEquals = (a: PixelData | undefined, b: PixelData | undefined): boolean => {
    if (!a || !b || a.length !== b.length) return false;

    for (let index = 0; index < a.length; index++) {
        if (a[index] !== b[index]) return false;
    }

    return true;
};

export const hasVisiblePixels = (pixelData: PixelData): boolean => (
    pixelData.some(pixel => pixel !== TRANSPARENT_PIXEL)
);

export const getPixelColor = (
    pixelData: PixelData,
    index: number,
    palette: Palette
): string | null => {
    const paletteValue = pixelData[index] ?? TRANSPARENT_PIXEL;
    if (paletteValue === TRANSPARENT_PIXEL) return null;
    return palette[paletteValue - 1] ?? null;
};

export const mergePalettes = (primary: Palette, secondary: Palette = []): Palette => {
    // Preserve primary palette positions because saved pixel data stores palette indices.
    const nextPalette: Palette = primary.slice(0, MAX_PALETTE_COLORS);
    const seen = new Set(nextPalette);

    secondary.forEach(color => {
        if (!color || seen.has(color) || nextPalette.length >= MAX_PALETTE_COLORS) return;
        seen.add(color);
        nextPalette.push(color);
    });

    return nextPalette;
};

export const getPaletteIndex = (palette: Palette): Map<string, number> => {
    const cached = paletteIndexCache.get(palette);
    if (cached) return cached;

    const index = new Map<string, number>();
    palette.forEach((color, paletteIndex) => {
        if (!color || index.has(color)) return;
        index.set(color, paletteIndex + 1);
    });
    paletteIndexCache.set(palette, index);
    return index;
};

export const ensurePaletteColor = (
    palette: Palette,
    color: string | null
): { palette: Palette; value: number } => {
    if (!color) return { palette, value: TRANSPARENT_PIXEL };

    const paletteIndex = getPaletteIndex(palette);
    const existingValue = paletteIndex.get(color);
    if (existingValue !== undefined) {
        return { palette, value: existingValue };
    }

    if (palette.length >= MAX_PALETTE_COLORS) {
        return { palette, value: TRANSPARENT_PIXEL };
    }

    const nextPalette = [...palette, color];
    paletteIndexCache.set(nextPalette, new Map(paletteIndex).set(color, nextPalette.length));

    return {
        palette: nextPalette,
        value: nextPalette.length
    };
};

export const colorArrayToPixelData = (
    colors: (string | null)[],
    palette: Palette
): { pixelData: PixelData; palette: Palette } => {
    const pixelData = createBlankPixelData(colors.length);
    let nextPalette = palette;

    colors.forEach((color, index) => {
        const encoded = ensurePaletteColor(nextPalette, color);
        nextPalette = encoded.palette;
        pixelData[index] = encoded.value;
    });

    return { pixelData, palette: nextPalette };
};

export const pixelDataToColorArray = (
    pixelData: PixelData,
    palette: Palette
): (string | null)[] => (
    Array.from(pixelData, (_value, index) => getPixelColor(pixelData, index, palette))
);
