export interface PresetPalette {
    id: string;
    name: string;
    author?: string;
    colors: string[];
}

export const normalizeHex = (value: string): string | null => {
    const hex = value.trim().replace(/^#/, '').toLowerCase();
    return /^[0-9a-f]{6}$/.test(hex) ? `#${hex}` : null;
};

// Built-in templates come from the Lospec .hex files bundled in /palettes —
// drop a file there to ship a new one. Only 32-color palettes are included
// (the app's native palette size). Sorted with ENDESGA 32 (the app default)
// first, then alphabetically so the list stays scannable as it grows.
const paletteFiles = import.meta.glob('../../palettes/*.hex', {
    query: '?raw',
    import: 'default',
    eager: true
}) as Record<string, string>;

// Only credit authors known for certain.
const KNOWN_AUTHORS: Record<string, string> = {
    'endesga-32': 'Endesga',
    'resurrect-32': 'Kerrie Lake',
    'dawnbringer-32': 'DawnBringer',
    'zughy-32': 'Zughy'
};

const toDisplayName = (slug: string): string =>
    slug.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');

export const PRESET_PALETTES: PresetPalette[] = Object.entries(paletteFiles)
    .map(([path, contents]) => {
        const slug = (path.split('/').pop() ?? path).replace(/\.hex$/i, '');
        const colors = contents
            .split(/\r?\n/)
            .map(line => line.trim())
            .filter(line => line !== '')
            .map(normalizeHex)
            .filter((color): color is string => color !== null);
        return {
            id: slug,
            name: toDisplayName(slug),
            author: KNOWN_AUTHORS[slug],
            colors
        };
    })
    .filter(palette => palette.colors.length === 32)
    .sort((a, b) => {
        if (a.id === 'endesga-32') return -1;
        if (b.id === 'endesga-32') return 1;
        return a.name.localeCompare(b.name);
    });

// User-imported palettes, persisted locally so they survive refreshes.
const CUSTOM_PALETTES_KEY = 'pixel-animator-custom-palettes';

export const loadCustomPalettes = (): PresetPalette[] => {
    try {
        const raw = localStorage.getItem(CUSTOM_PALETTES_KEY);
        if (!raw) return [];
        const parsed: unknown = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed.filter((entry): entry is PresetPalette => {
            const palette = entry as PresetPalette;
            return typeof palette?.id === 'string'
                && typeof palette?.name === 'string'
                && Array.isArray(palette?.colors)
                && palette.colors.every(color => typeof color === 'string');
        });
    } catch {
        return [];
    }
};

export const saveCustomPalettes = (palettes: PresetPalette[]): void => {
    try {
        localStorage.setItem(CUSTOM_PALETTES_KEY, JSON.stringify(palettes));
    } catch {
        // Storage unavailable/full — custom palettes just won't persist.
    }
};

// Built-in templates the user deleted (hidden, restorable — the palette data
// itself ships with the app).
const HIDDEN_PRESETS_KEY = 'pixel-animator-hidden-presets';

export const loadHiddenPresetIds = (): string[] => {
    try {
        const raw = localStorage.getItem(HIDDEN_PRESETS_KEY);
        if (!raw) return [];
        const parsed: unknown = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
    } catch {
        return [];
    }
};

export const saveHiddenPresetIds = (ids: string[]): void => {
    try {
        localStorage.setItem(HIDDEN_PRESETS_KEY, JSON.stringify(ids));
    } catch {
        // Storage unavailable — deletions just won't persist.
    }
};

export const nextCustomPaletteName = (existing: PresetPalette[]): string => {
    let max = 0;
    existing.forEach(palette => {
        const match = /^Custom (\d+)$/.exec(palette.name);
        if (match) max = Math.max(max, parseInt(match[1], 10));
    });
    return `Custom ${max + 1}`;
};

// sRGB hex → OKLab (Björn Ottosson, 2020). In OKLab, plain Euclidean distance
// approximates perceived color difference, so matching needs no channel
// weighting. Conversions are cached per hex string — palette matching and the
// live preview re-query the same handful of colors constantly.
const oklabCache = new Map<string, readonly [number, number, number]>();

const srgbChannelToLinear = (channel: number): number => {
    const c = channel / 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
};

const hexToOklab = (hex: string): readonly [number, number, number] => {
    const cached = oklabCache.get(hex);
    if (cached) return cached;

    const value = hex.replace('#', '');
    const r = srgbChannelToLinear(parseInt(value.slice(0, 2), 16));
    const g = srgbChannelToLinear(parseInt(value.slice(2, 4), 16));
    const b = srgbChannelToLinear(parseInt(value.slice(4, 6), 16));

    // Linear RGB → cone response (LMS), compressed by cube root, then into
    // opponent axes: L = lightness, a = green↔red, b = blue↔yellow.
    const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
    const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
    const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);

    const lab: readonly [number, number, number] = [
        0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
        1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
        0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s
    ];
    oklabCache.set(hex, lab);
    return lab;
};

export const nearestPaletteIndex = (color: string, palette: string[]): number => {
    const [tl, ta, tb] = hexToOklab(color);
    let bestIndex = 0;
    let bestDistance = Infinity;

    palette.forEach((candidate, index) => {
        const [cl, ca, cb] = hexToOklab(candidate);
        const dl = tl - cl;
        const da = ta - ca;
        const db = tb - cb;
        const distance = dl * dl + da * da + db * db;
        if (distance < bestDistance) {
            bestDistance = distance;
            bestIndex = index;
        }
    });

    return bestIndex;
};
