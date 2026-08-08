import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import type { Sprite } from '../types';
import { createBlankPixelData, pixelDataToColorArray } from '../utils/pixelData';
import {
    collabDocToProject,
    createBlankCollabFrame,
    getCollabDocHandles,
    RECOVERY_FRAME_ID,
    repairEmptyFrames,
    seedDocFromStore,
    spriteToYFrame,
    validateDoc
} from './doc';
import {
    generateInitialPositions,
    generatePositionsInGap,
    isValidPosition,
    positionsForMovedFrames
} from './positions';

const makeSprite = (id: string, name: string, baseValue = 0, topValue = 0): Sprite => {
    const pixelData = createBlankPixelData();
    const overlayPixelData = createBlankPixelData();
    pixelData[3] = baseValue;
    overlayPixelData[9] = topValue;
    return {
        id,
        name,
        pixelData,
        overlayPixelData,
        history: [pixelData.slice()],
        redoHistory: [],
        overlayHistory: [overlayPixelData.slice()],
        overlayRedoHistory: []
    };
};

const makeSeed = () => ({
    projectName: 'Shared drawing',
    fps: 12,
    palette: ['#112233', '#AABBCC', '#ff00ff'],
    presetCount: 2,
    sprites: [
        makeSprite('frame-a', 'First', 1, 2),
        makeSprite('frame-b', 'Second', 3, 0)
    ]
});

const exchangeUpdates = (left: Y.Doc, right: Y.Doc): void => {
    const leftUpdate = Y.encodeStateAsUpdate(left, Y.encodeStateVector(right));
    const rightUpdate = Y.encodeStateAsUpdate(right, Y.encodeStateVector(left));
    Y.applyUpdate(left, rightUpdate);
    Y.applyUpdate(right, leftUpdate);
};

describe('collaboration document schema', () => {
    it('seeds, validates, and restores semantic colors and fresh histories', () => {
        const doc = new Y.Doc();
        seedDocFromStore(doc, makeSeed());

        const validated = validateDoc(doc);
        expect(validated).toMatchObject({
            name: 'Shared drawing',
            fps: 12,
            presetCount: 2,
            presetColors: ['#112233', '#aabbcc']
        });
        expect(validated.frames.map(frame => frame.id)).toEqual(['frame-a', 'frame-b']);
        expect(validated.frames[0].base.get(3)).toBe('#112233');
        expect(validated.frames[0].top.get(9)).toBe('#aabbcc');

        const restored = collabDocToProject(validated);
        expect(restored.palette).toEqual(['#112233', '#aabbcc', '#ff00ff']);
        expect(pixelDataToColorArray(restored.sprites[1].pixelData, restored.palette)[3])
            .toBe('#ff00ff');
        expect(restored.sprites[0].history).toHaveLength(1);
        expect(restored.sprites[0].redoHistory).toEqual([]);
    });

    it('fails closed on malformed positions, palette slots, pixels, and dimensions', () => {
        const cases: Array<(doc: Y.Doc) => void> = [
            doc => {
                const frame = getCollabDocHandles(doc).frames.get('frame-a');
                frame?.set('position', 'bad!');
            },
            doc => getCollabDocHandles(doc).palette.set('extra', '#ffffff'),
            doc => {
                const frame = getCollabDocHandles(doc).frames.get('frame-a');
                const base = frame?.get('base');
                if (base instanceof Y.Map) base.set('1024', '#ffffff');
            },
            doc => getCollabDocHandles(doc).meta.set('width', 64)
        ];

        cases.forEach(mutate => {
            const doc = new Y.Doc();
            seedDocFromStore(doc, makeSeed());
            mutate(doc);
            expect(() => validateDoc(doc)).toThrow();
        });
    });

    it('normalizes valid hex but rejects visible pixels without palette colors', () => {
        const invalid = makeSeed();
        invalid.palette[0] = 'not-a-color';
        expect(() => seedDocFromStore(new Y.Doc(), invalid)).toThrow(/hex color/);

        const missing = makeSeed();
        missing.sprites[0].pixelData[3] = 99;
        expect(() => seedDocFromStore(new Y.Doc(), missing)).toThrow(/missing from the palette/);
    });
});

describe('fractional frame ordering', () => {
    it('uses a deterministic id tie-break for concurrent inserts in one gap', () => {
        const left = new Y.Doc();
        const right = new Y.Doc();
        const seed = makeSeed();
        seedDocFromStore(left, seed);
        exchangeUpdates(left, right);

        const initial = validateDoc(left).frames;
        const position = generatePositionsInGap(initial[0].position, initial[1].position, 1)[0];
        getCollabDocHandles(left).frames.set(
            'insert-z',
            spriteToYFrame(makeSprite('insert-z', 'Z'), seed.palette, position)
        );
        getCollabDocHandles(right).frames.set(
            'insert-a',
            spriteToYFrame(makeSprite('insert-a', 'A'), seed.palette, position)
        );

        exchangeUpdates(left, right);
        const leftOrder = validateDoc(left).frames.map(frame => frame.id);
        const rightOrder = validateDoc(right).frames.map(frame => frame.id);
        expect(leftOrder).toEqual(rightOrder);
        expect(leftOrder).toEqual(['frame-a', 'insert-a', 'insert-z', 'frame-b']);
    });

    it('converges when the same position is changed concurrently', () => {
        const left = new Y.Doc();
        const right = new Y.Doc();
        seedDocFromStore(left, makeSeed());
        exchangeUpdates(left, right);

        const ordered = validateDoc(left).frames;
        getCollabDocHandles(left).frames.get('frame-a')?.set(
            'position',
            generatePositionsInGap(ordered[1].position, null, 1)[0]
        );
        getCollabDocHandles(right).frames.get('frame-a')?.set(
            'position',
            generatePositionsInGap(null, ordered[0].position, 1)[0]
        );

        exchangeUpdates(left, right);
        expect(validateDoc(left).frames.map(frame => frame.id))
            .toEqual(validateDoc(right).frames.map(frame => frame.id));
    });

    it('assigns new keys only to a moved contiguous group', () => {
        const positions = generateInitialPositions(4);
        const current = ['a', 'b', 'c', 'd'].map((id, index) => ({ id, position: positions[index] }));
        const moved = positionsForMovedFrames(current, ['a', 'd', 'b', 'c'], ['b', 'c']);
        expect([...moved.keys()]).toEqual(['b', 'c']);
        expect(moved.get('b')! > positions[3]).toBe(true);
        expect(moved.get('c')! > moved.get('b')!).toBe(true);
        expect(isValidPosition('bad!')).toBe(false);
        expect(isValidPosition(positions[0])).toBe(true);
    });
});

describe('empty-frame recovery', () => {
    it('converges to the reserved recovery frame after concurrent last-frame deletes', () => {
        const left = new Y.Doc();
        const right = new Y.Doc();
        seedDocFromStore(left, makeSeed());
        exchangeUpdates(left, right);

        getCollabDocHandles(left).frames.delete('frame-a');
        getCollabDocHandles(right).frames.delete('frame-b');
        exchangeUpdates(left, right);
        expect(getCollabDocHandles(left).frames.size).toBe(0);
        expect(getCollabDocHandles(right).frames.size).toBe(0);

        expect(repairEmptyFrames(left)).toBe(true);
        expect(repairEmptyFrames(right)).toBe(true);
        exchangeUpdates(left, right);

        expect(validateDoc(left).frames.map(frame => frame.id)).toEqual([RECOVERY_FRAME_ID]);
        expect(validateDoc(right).frames.map(frame => frame.id)).toEqual([RECOVERY_FRAME_ID]);
    });

    it('creates collision-safe blank frames without touching existing ids', () => {
        const position = generateInitialPositions(1)[0];
        const created = createBlankCollabFrame('Blank', position, ['already-used']);
        const doc = new Y.Doc();
        getCollabDocHandles(doc).frames.set(created.id, created.frame);
        expect(created.id).not.toBe('already-used');
        expect(created.frame.get('position')).toBe(position);
    });
});
