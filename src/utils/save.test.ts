import { describe, expect, it } from 'vitest';
import type { Sprite } from '../types';
import { createBlankPixelData } from './pixelData';
import { createProjectJSON, decompressPixelData } from './save';

describe('v1.2 project serialization', () => {
    it('round-trips string ids and palette indices wider than Uint8', () => {
        const palette = Array.from({ length: 300 }, (_, index) => (
            `#${index.toString(16).padStart(6, '0')}`
        ));
        const pixelData = createBlankPixelData();
        const overlayPixelData = createBlankPixelData();
        pixelData[42] = 300;
        const sprite: Sprite = {
            id: 'opaque-frame-id',
            name: 'Wide palette',
            pixelData,
            overlayPixelData,
            history: [pixelData.slice()],
            redoHistory: [],
            overlayHistory: [overlayPixelData.slice()],
            overlayRedoHistory: []
        };

        const saved = createProjectJSON('wide', [sprite], 12, palette, 32, 32);
        const parsed = JSON.parse(JSON.stringify(saved)) as typeof saved;
        const restored = decompressPixelData(parsed.frames[0].pixelData, parsed.palette);
        expect(parsed.version).toBe('1.2');
        expect(parsed.frames[0].id).toBe('opaque-frame-id');
        expect(restored).toBeInstanceOf(Uint16Array);
        expect(restored[42]).toBe(300);
    });
});
