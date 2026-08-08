import { describe, expect, it } from 'vitest';
import {
    createEmptySprite,
    generateSpriteId,
    normalizeLoadedSpriteId
} from './history';

describe('collision-safe frame ids', () => {
    it('creates opaque unique string ids and Uint16 pixel storage', () => {
        const first = createEmptySprite();
        const secondId = generateSpriteId([first.id]);
        expect(typeof first.id).toBe('string');
        expect(secondId).not.toBe(first.id);
        expect(first.pixelData).toBeInstanceOf(Uint16Array);
    });

    it('normalizes legacy numeric ids deterministically and repairs collisions', () => {
        const ids = new Set<string>();
        const first = normalizeLoadedSpriteId(7, ids);
        ids.add(first);
        const duplicate = normalizeLoadedSpriteId(7, ids);
        ids.add(duplicate);
        const reserved = normalizeLoadedSpriteId('__recovery_frame__', ids);

        expect(first).toBe('legacy-7');
        expect(duplicate).not.toBe(first);
        expect(reserved.startsWith('__')).toBe(false);
        expect(ids.size).toBe(2);
    });
});
