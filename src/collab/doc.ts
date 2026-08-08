import { nanoid } from 'nanoid';
import * as Y from 'yjs';
import { GRID_SIZE, TOTAL_PIXELS } from '../types';
import type { Palette, Sprite } from '../types';
import type { EditorUiState } from '../stores/editor/types';
import {
    clonePixelData,
    colorArrayToPixelData,
    createBlankPixelData,
    MAX_ENCODED_COLORS,
    MAX_PRESET_COLORS,
    pixelDataToColorArray
} from '../utils/pixelData';
import { SYSTEM_REPAIR_ORIGIN, SYSTEM_SEED_ORIGIN } from './origins';
import {
    comparePositionedFrames,
    generateInitialPositions,
    isValidPosition
} from './positions';

export const COLLAB_SCHEMA_VERSION = 1;
export const MAX_COLLAB_FRAMES = 128;
export const RECOVERY_FRAME_ID = '__recovery_frame__';

const MAX_FRAME_ID_LENGTH = 64;
const MAX_FRAME_NAME_LENGTH = 160;
const MAX_PROJECT_NAME_LENGTH = 128;
const FRAME_ID_PATTERN = /^[A-Za-z0-9_-]+$/;
const PIXEL_KEY_PATTERN = /^(0|[1-9][0-9]{0,3})$/;

export interface CollabDocHandles {
    doc: Y.Doc;
    meta: Y.Map<unknown>;
    frames: Y.Map<Y.Map<unknown>>;
    palette: Y.Map<unknown>;
}

export interface ValidatedCollabFrame {
    id: string;
    name: string;
    position: string;
    base: Map<number, string>;
    top: Map<number, string>;
}

export interface ValidatedWholesaleMarker {
    id: string;
    kind: 'palette-convert' | 'load-project';
}

export interface ValidatedCollabDoc {
    name: string;
    fps: number;
    presetColors: string[];
    presetCount: number;
    frames: ValidatedCollabFrame[];
    lastWholesale?: ValidatedWholesaleMarker;
}

export type CollabSeedState = Pick<
    EditorUiState,
    'fps' | 'palette' | 'presetCount' | 'projectName' | 'sprites'
>;

export interface CollabProjectState {
    fps: number;
    palette: Palette;
    presetCount: number;
    projectName: string;
    sprites: Sprite[];
}

export class CollabValidationError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'CollabValidationError';
    }
}

const invalid = (message: string): never => {
    throw new CollabValidationError(message);
};

export const normalizeCollabHex = (value: unknown): string | null => {
    if (typeof value !== 'string') return null;
    const hex = value.trim().replace(/^#/, '').toLowerCase();
    return /^[0-9a-f]{6}$/.test(hex) ? `#${hex}` : null;
};

const requireHex = (value: unknown, field: string): string => (
    normalizeCollabHex(value) ?? invalid(`${field} must be a six-digit hex color`)
);

export const isValidFrameId = (id: unknown, allowRecovery = false): id is string => {
    if (allowRecovery && id === RECOVERY_FRAME_ID) return true;
    return typeof id === 'string'
        && id.length > 0
        && id.length <= MAX_FRAME_ID_LENGTH
        && !id.startsWith('__')
        && FRAME_ID_PATTERN.test(id);
};

export const getCollabDocHandles = (doc: Y.Doc): CollabDocHandles => ({
    doc,
    meta: doc.getMap<unknown>('meta'),
    frames: doc.getMap<Y.Map<unknown>>('frames'),
    palette: doc.getMap<unknown>('palette')
});

const colorArrayToYLayer = (colors: (string | null)[], field: string): Y.Map<unknown> => {
    const layer = new Y.Map<unknown>();
    colors.forEach((color, index) => {
        if (color === null) return;
        layer.set(String(index), requireHex(color, `${field}[${index}]`));
    });
    return layer;
};

export const spriteToYFrame = (
    sprite: Sprite,
    palette: Palette,
    position: string,
    allowRecoveryId = false
): Y.Map<unknown> => {
    if (!isValidFrameId(sprite.id, allowRecoveryId)) invalid(`Invalid frame id: ${sprite.id}`);
    if (sprite.name.length > MAX_FRAME_NAME_LENGTH) invalid(`Frame name is too long: ${sprite.id}`);
    if (!isValidPosition(position)) invalid(`Invalid frame position: ${position}`);
    if (sprite.pixelData.length !== TOTAL_PIXELS || sprite.overlayPixelData.length !== TOTAL_PIXELS) {
        invalid(`Frame ${sprite.id} has invalid layer dimensions`);
    }
    const hasUnmappedColor = (pixelData: Uint16Array): boolean => (
        pixelData.some(value => value > palette.length)
    );
    if (hasUnmappedColor(sprite.pixelData) || hasUnmappedColor(sprite.overlayPixelData)) {
        invalid(`Frame ${sprite.id} references a color missing from the palette`);
    }

    const frame = new Y.Map<unknown>();
    frame.set('name', sprite.name);
    frame.set('position', position);
    frame.set('base', colorArrayToYLayer(
        pixelDataToColorArray(sprite.pixelData, palette),
        `frames.${sprite.id}.base`
    ));
    frame.set('top', colorArrayToYLayer(
        pixelDataToColorArray(sprite.overlayPixelData, palette),
        `frames.${sprite.id}.top`
    ));
    return frame;
};

export const seedDocFromStore = (doc: Y.Doc, state: CollabSeedState): CollabDocHandles => {
    const handles = getCollabDocHandles(doc);
    if (
        handles.meta.size > 0
        || handles.frames.size > 0
        || handles.palette.size > 0
    ) {
        throw new Error('Refusing to seed a non-empty collaboration document');
    }
    if (state.sprites.length < 1 || state.sprites.length > MAX_COLLAB_FRAMES) {
        invalid(`Frame count must be between 1 and ${MAX_COLLAB_FRAMES}`);
    }
    if (!Number.isInteger(state.fps) || state.fps < 1 || state.fps > 60) {
        invalid('FPS must be an integer between 1 and 60');
    }
    if (
        !Number.isInteger(state.presetCount)
        || state.presetCount < 1
        || state.presetCount > MAX_PRESET_COLORS
        || state.presetCount > state.palette.length
    ) {
        invalid(`Preset count must be between 1 and ${MAX_PRESET_COLORS}`);
    }
    if (state.projectName.length > MAX_PROJECT_NAME_LENGTH) invalid('Project name is too long');

    const ids = new Set<string>();
    state.sprites.forEach(sprite => {
        if (!isValidFrameId(sprite.id) || ids.has(sprite.id)) {
            invalid(`Invalid or duplicate frame id: ${sprite.id}`);
        }
        ids.add(sprite.id);
    });
    const positions = generateInitialPositions(state.sprites.length);

    doc.transact(() => {
        handles.meta.set('schema', COLLAB_SCHEMA_VERSION);
        handles.meta.set('name', state.projectName);
        handles.meta.set('fps', state.fps);
        handles.meta.set('width', GRID_SIZE);
        handles.meta.set('height', GRID_SIZE);
        handles.meta.set('presetCount', state.presetCount);

        for (let index = 0; index < state.presetCount; index++) {
            handles.palette.set(String(index), requireHex(state.palette[index], `palette.${index}`));
        }
        state.sprites.forEach((sprite, index) => {
            handles.frames.set(sprite.id, spriteToYFrame(sprite, state.palette, positions[index]));
        });

        // Readers use this as the atomic readiness marker, so it is written last.
        handles.meta.set('initialized', true);
    }, SYSTEM_SEED_ORIGIN);

    validateDoc(doc);
    return handles;
};

const validateString = (value: unknown, field: string, maxLength: number): string => {
    if (typeof value !== 'string' || value.length > maxLength) {
        invalid(`${field} must be a string no longer than ${maxLength} characters`);
    }
    return value as string;
};

const validateInteger = (
    value: unknown,
    field: string,
    minimum: number,
    maximum: number
): number => {
    if (!Number.isInteger(value) || (value as number) < minimum || (value as number) > maximum) {
        invalid(`${field} must be an integer between ${minimum} and ${maximum}`);
    }
    return value as number;
};

const validateLayer = (
    value: unknown,
    field: string,
    colors: Set<string>
): Map<number, string> => {
    if (!(value instanceof Y.Map)) invalid(`${field} must be a Y.Map`);
    const layer = value as Y.Map<unknown>;
    if (layer.size > TOTAL_PIXELS) invalid(`${field} contains too many pixels`);

    const pixels = new Map<number, string>();
    layer.forEach((rawColor, key) => {
        if (!PIXEL_KEY_PATTERN.test(key)) invalid(`${field} has an invalid pixel key: ${key}`);
        const index = Number(key);
        if (index < 0 || index >= TOTAL_PIXELS || String(index) !== key) {
            invalid(`${field} has an out-of-range pixel key: ${key}`);
        }
        const color = requireHex(rawColor, `${field}.${key}`);
        colors.add(color);
        if (colors.size > MAX_ENCODED_COLORS) invalid('Document contains too many distinct colors');
        pixels.set(index, color);
    });
    return pixels;
};

const validateWholesaleMarker = (value: unknown): ValidatedWholesaleMarker | undefined => {
    if (value === undefined) return undefined;
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        invalid('meta.lastWholesale must be an object');
    }
    const marker = value as Record<string, unknown>;
    const id = validateString(marker.id, 'meta.lastWholesale.id', 64);
    if (marker.kind !== 'palette-convert' && marker.kind !== 'load-project') {
        invalid('meta.lastWholesale.kind is unsupported');
    }
    return { id, kind: marker.kind as ValidatedWholesaleMarker['kind'] };
};

export const validateDoc = (doc: Y.Doc): ValidatedCollabDoc => {
    const { meta, frames, palette } = getCollabDocHandles(doc);
    if (meta.get('initialized') !== true) invalid('Document is not initialized');
    if (meta.get('schema') !== COLLAB_SCHEMA_VERSION) invalid('Unsupported collaboration schema');
    if (meta.get('width') !== GRID_SIZE || meta.get('height') !== GRID_SIZE) {
        invalid(`Document dimensions must be ${GRID_SIZE}x${GRID_SIZE}`);
    }

    const name = validateString(meta.get('name'), 'meta.name', MAX_PROJECT_NAME_LENGTH);
    const fps = validateInteger(meta.get('fps'), 'meta.fps', 1, 60);
    const presetCount = validateInteger(
        meta.get('presetCount'),
        'meta.presetCount',
        1,
        MAX_PRESET_COLORS
    );
    const lastWholesale = validateWholesaleMarker(meta.get('lastWholesale'));
    if (frames.size < 1 || frames.size > MAX_COLLAB_FRAMES) {
        invalid(`Document must contain between 1 and ${MAX_COLLAB_FRAMES} frames`);
    }
    if (palette.size !== presetCount) invalid('Palette must contain exactly the preset slots');

    const colors = new Set<string>();
    const presetColors: string[] = [];
    palette.forEach((_value, key) => {
        if (!PIXEL_KEY_PATTERN.test(key) || Number(key) >= presetCount || String(Number(key)) !== key) {
            invalid(`Palette has an invalid slot: ${key}`);
        }
    });
    for (let index = 0; index < presetCount; index++) {
        const key = String(index);
        if (!palette.has(key)) invalid(`Palette is missing slot ${key}`);
        const color = requireHex(palette.get(key), `palette.${key}`);
        colors.add(color);
        presetColors.push(color);
    }

    const validatedFrames: ValidatedCollabFrame[] = [];
    frames.forEach((frame, id) => {
        if (!isValidFrameId(id, true)) invalid(`Invalid frame id: ${id}`);
        if (!(frame instanceof Y.Map)) invalid(`Frame ${id} must be a Y.Map`);
        const frameName = validateString(frame.get('name'), `frames.${id}.name`, MAX_FRAME_NAME_LENGTH);
        const position = frame.get('position');
        if (!isValidPosition(position)) invalid(`Frame ${id} has an invalid position`);
        const base = validateLayer(frame.get('base'), `frames.${id}.base`, colors);
        const top = validateLayer(frame.get('top'), `frames.${id}.top`, colors);
        validatedFrames.push({ id, name: frameName, position: position as string, base, top });
    });
    if (colors.size > MAX_ENCODED_COLORS) invalid('Document contains too many distinct colors');

    validatedFrames.sort(comparePositionedFrames);
    return {
        name,
        fps,
        presetColors,
        presetCount,
        frames: validatedFrames,
        ...(lastWholesale ? { lastWholesale } : {})
    };
};

const validatedLayerToColors = (pixels: Map<number, string>): (string | null)[] => {
    const colors = Array<string | null>(TOTAL_PIXELS).fill(null);
    pixels.forEach((color, index) => {
        colors[index] = color;
    });
    return colors;
};

export const yFrameToSprite = (
    frame: ValidatedCollabFrame,
    palette: Palette
): { sprite: Sprite; palette: Palette } => {
    const base = colorArrayToPixelData(validatedLayerToColors(frame.base), palette);
    const top = colorArrayToPixelData(validatedLayerToColors(frame.top), base.palette);
    const pixelData = base.pixelData;
    const overlayPixelData = top.pixelData;
    return {
        palette: top.palette,
        sprite: {
            id: frame.id,
            name: frame.name,
            pixelData,
            overlayPixelData,
            history: [clonePixelData(pixelData)],
            redoHistory: [],
            overlayHistory: [clonePixelData(overlayPixelData)],
            overlayRedoHistory: []
        }
    };
};

export const collabDocToProject = (
    validated: ValidatedCollabDoc,
    advisoryTail: Palette = []
): CollabProjectState => {
    const presetSet = new Set(validated.presetColors);
    let palette: Palette = [
        ...validated.presetColors,
        ...advisoryTail.filter((color, index) => (
            normalizeCollabHex(color) === color
            && !presetSet.has(color)
            && advisoryTail.indexOf(color) === index
        ))
    ];
    const sprites = validated.frames.map(frame => {
        const converted = yFrameToSprite(frame, palette);
        palette = converted.palette;
        return converted.sprite;
    });
    return {
        fps: validated.fps,
        palette,
        presetCount: validated.presetCount,
        projectName: validated.name,
        sprites
    };
};

export const repairEmptyFrames = (doc: Y.Doc): boolean => {
    const { meta, frames } = getCollabDocHandles(doc);
    if (meta.get('initialized') !== true || frames.size !== 0) return false;

    const blank = createBlankPixelData();
    const recoverySprite: Sprite = {
        id: RECOVERY_FRAME_ID,
        name: 'Recovered Frame',
        pixelData: blank,
        overlayPixelData: createBlankPixelData(),
        history: [clonePixelData(blank)],
        redoHistory: [],
        overlayHistory: [createBlankPixelData()],
        overlayRedoHistory: []
    };

    doc.transact(() => {
        if (frames.size === 0) {
            frames.set(
                RECOVERY_FRAME_ID,
                spriteToYFrame(recoverySprite, [], generateInitialPositions(1)[0], true)
            );
        }
    }, SYSTEM_REPAIR_ORIGIN);
    return true;
};

export const createBlankCollabFrame = (
    name: string,
    position: string,
    existingIds: Iterable<string>
): { id: string; frame: Y.Map<unknown> } => {
    const ids = new Set(existingIds);
    let id = nanoid();
    while (ids.has(id) || !isValidFrameId(id)) id = nanoid();
    const blank = createBlankPixelData();
    const sprite: Sprite = {
        id,
        name,
        pixelData: blank,
        overlayPixelData: createBlankPixelData(),
        history: [clonePixelData(blank)],
        redoHistory: [],
        overlayHistory: [createBlankPixelData()],
        overlayRedoHistory: []
    };
    return { id, frame: spriteToYFrame(sprite, [], position) };
};
