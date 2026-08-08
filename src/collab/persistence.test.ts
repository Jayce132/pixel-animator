import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { clearDocument, IndexeddbPersistence } from 'y-indexeddb';
import { createBlankPixelData } from '../utils/pixelData';
import { seedDocFromStore, validateDoc } from './doc';

const databaseNames: string[] = [];

afterEach(async () => {
    await Promise.all(databaseNames.splice(0).map(name => clearDocument(name)));
});

describe('collaboration IndexedDB readiness', () => {
    it('restores and validates a cached document before it is installed', async () => {
        const name = `collab-cache-${Date.now()}-${Math.random()}`;
        databaseNames.push(name);
        const source = new Y.Doc();
        const pixelData = createBlankPixelData();
        const overlayPixelData = createBlankPixelData();
        pixelData[5] = 1;
        seedDocFromStore(source, {
            projectName: 'Cached',
            fps: 10,
            palette: ['#123456'],
            presetCount: 1,
            sprites: [{
                id: 'cached-frame',
                name: 'Cached frame',
                pixelData,
                overlayPixelData,
                history: [pixelData.slice()],
                redoHistory: [],
                overlayHistory: [overlayPixelData.slice()],
                overlayRedoHistory: []
            }]
        });
        const writer = new IndexeddbPersistence(name, source);
        await writer.whenSynced;
        await writer.destroy();
        source.destroy();

        const restored = new Y.Doc();
        const reader = new IndexeddbPersistence(name, restored);
        expect(restored.getMap('meta').get('initialized')).toBeUndefined();
        await reader.whenSynced;
        expect(validateDoc(restored).frames[0].base.get(5)).toBe('#123456');
        await reader.destroy();
        restored.destroy();
    });
});
