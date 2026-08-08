import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import type { StoreApi } from 'zustand/vanilla';
import { createEditorUiStore } from '../stores/editorStore';
import type { EditorUiState } from '../stores/editor/types';
import type { Sprite } from '../types';
import { createBlankPixelData, pixelDataToColorArray } from '../utils/pixelData';
import { createCollabBridge } from './bridge';
import { collabDocToProject, seedDocFromStore, validateDoc } from './doc';
import {
    createCollabUndoController
} from './undo';
import { setActiveCollabUndoController } from './undoRuntime';

const makeSprite = (id: string, colorValue = 0): Sprite => {
    const pixelData = createBlankPixelData();
    const overlayPixelData = createBlankPixelData();
    pixelData[0] = colorValue;
    return {
        id,
        name: id,
        pixelData,
        overlayPixelData,
        history: [pixelData.slice()],
        redoHistory: [],
        overlayHistory: [overlayPixelData.slice()],
        overlayRedoHistory: []
    };
};

const seedState = () => ({
    projectName: 'Bridge test',
    fps: 8,
    palette: ['#111111', '#eeeeee'],
    presetCount: 2,
    sprites: [makeSprite('one', 1), makeSprite('two', 2)]
});

const exchangeUpdates = (left: Y.Doc, right: Y.Doc): void => {
    const leftUpdate = Y.encodeStateAsUpdate(left, Y.encodeStateVector(right));
    const rightUpdate = Y.encodeStateAsUpdate(right, Y.encodeStateVector(left));
    Y.applyUpdate(left, rightUpdate);
    Y.applyUpdate(right, leftUpdate);
};

const storeFromDoc = (doc: Y.Doc): StoreApi<EditorUiState> => {
    const store = createEditorUiStore();
    const project = collabDocToProject(validateDoc(doc));
    store.setState({
        ...project,
        activeSpriteId: project.sprites[0].id
    });
    return store;
};

const paintPixel = (
    store: StoreApi<EditorUiState>,
    frameId: string,
    index: number,
    paletteValue: number
): void => {
    store.setState(state => ({
        sprites: state.sprites.map(sprite => {
            if (sprite.id !== frameId) return sprite;
            const pixelData = sprite.pixelData.slice();
            pixelData[index] = paletteValue;
            return { ...sprite, pixelData };
        })
    }));
};

describe('Zustand/Yjs collaboration bridge', () => {
    it('publishes a local semantic pixel diff and installs it remotely', () => {
        const leftDoc = new Y.Doc();
        const rightDoc = new Y.Doc();
        seedDocFromStore(leftDoc, seedState());
        exchangeUpdates(leftDoc, rightDoc);
        const leftStore = storeFromDoc(leftDoc);
        const rightStore = storeFromDoc(rightDoc);
        const leftBridge = createCollabBridge(leftDoc, leftStore);
        const rightBridge = createCollabBridge(rightDoc, rightStore);

        const untouchedRight = rightStore.getState().sprites[1];
        paintPixel(leftStore, 'one', 12, 2);
        expect(validateDoc(leftDoc).frames[0].base.get(12)).toBe('#eeeeee');

        exchangeUpdates(leftDoc, rightDoc);
        const right = rightStore.getState();
        expect(pixelDataToColorArray(right.sprites[0].pixelData, right.palette)[12])
            .toBe('#eeeeee');
        expect(right.sprites[1]).toBe(untouchedRight);

        leftBridge.destroy();
        rightBridge.destroy();
    });

    it('merges concurrent edits to different pixels without whole-layer loss', () => {
        const leftDoc = new Y.Doc();
        const rightDoc = new Y.Doc();
        seedDocFromStore(leftDoc, seedState());
        exchangeUpdates(leftDoc, rightDoc);
        const leftStore = storeFromDoc(leftDoc);
        const rightStore = storeFromDoc(rightDoc);
        const leftBridge = createCollabBridge(leftDoc, leftStore);
        const rightBridge = createCollabBridge(rightDoc, rightStore);

        paintPixel(leftStore, 'one', 20, 1);
        paintPixel(rightStore, 'one', 21, 2);
        exchangeUpdates(leftDoc, rightDoc);

        const leftFrame = validateDoc(leftDoc).frames[0];
        const rightFrame = validateDoc(rightDoc).frames[0];
        expect(leftFrame.base.get(20)).toBe('#111111');
        expect(leftFrame.base.get(21)).toBe('#eeeeee');
        expect([...leftFrame.base].sort(([a], [b]) => a - b))
            .toEqual([...rightFrame.base].sort(([a], [b]) => a - b));
        expect(leftStore.getState().sprites.map(sprite => sprite.id))
            .toEqual(rightStore.getState().sprites.map(sprite => sprite.id));

        leftBridge.destroy();
        rightBridge.destroy();
    });

    it('syncs preset recoloring semantically and preserves frame ordering operations', () => {
        const leftDoc = new Y.Doc();
        const rightDoc = new Y.Doc();
        seedDocFromStore(leftDoc, seedState());
        exchangeUpdates(leftDoc, rightDoc);
        const leftStore = storeFromDoc(leftDoc);
        const rightStore = storeFromDoc(rightDoc);
        const leftBridge = createCollabBridge(leftDoc, leftStore);
        const rightBridge = createCollabBridge(rightDoc, rightStore);

        leftStore.getState().setPaletteColor(0, '#123456');
        leftStore.getState().moveSprite(0, 1);
        exchangeUpdates(leftDoc, rightDoc);

        const validated = validateDoc(rightDoc);
        expect(validated.presetColors[0]).toBe('#123456');
        expect(validated.frames.map(frame => frame.id)).toEqual(['two', 'one']);
        expect(validated.frames.find(frame => frame.id === 'one')?.base.get(0)).toBe('#123456');
        expect(rightStore.getState().sprites.map(sprite => sprite.id)).toEqual(['two', 'one']);

        leftBridge.destroy();
        rightBridge.destroy();
    });

    it('syncs frame additions and deletions with collision-safe ids', () => {
        const leftDoc = new Y.Doc();
        const rightDoc = new Y.Doc();
        seedDocFromStore(leftDoc, seedState());
        exchangeUpdates(leftDoc, rightDoc);
        const leftStore = storeFromDoc(leftDoc);
        const rightStore = storeFromDoc(rightDoc);
        const leftBridge = createCollabBridge(leftDoc, leftStore);
        const rightBridge = createCollabBridge(rightDoc, rightStore);

        leftStore.getState().addSprite();
        const addedId = leftStore.getState().activeSpriteId;
        expect(addedId).not.toMatch(/^\d+$/);
        exchangeUpdates(leftDoc, rightDoc);
        expect(rightStore.getState().sprites.some(sprite => sprite.id === addedId)).toBe(true);

        rightStore.getState().deleteSprite('two');
        exchangeUpdates(leftDoc, rightDoc);
        expect(leftStore.getState().sprites.map(sprite => sprite.id))
            .toEqual(rightStore.getState().sprites.map(sprite => sprite.id));
        expect(leftStore.getState().sprites.some(sprite => sprite.id === 'two')).toBe(false);

        leftBridge.destroy();
        rightBridge.destroy();
    });

    it('undoes only local pixel actions on the active frame', () => {
        const doc = new Y.Doc();
        seedDocFromStore(doc, seedState());
        const store = storeFromDoc(doc);
        const undo = createCollabUndoController(doc, () => store.setState({}));
        setActiveCollabUndoController(undo);
        const bridge = createCollabBridge(doc, store, { undo });

        paintPixel(store, 'one', 30, 1);
        paintPixel(store, 'one', 31, 2);
        expect(undo.canUndo('one')).toBe(true);
        store.getState().undo();
        expect(validateDoc(doc).frames[0].base.get(30)).toBe('#111111');
        expect(validateDoc(doc).frames[0].base.has(31)).toBe(false);
        store.getState().redo();
        expect(validateDoc(doc).frames[0].base.get(31)).toBe('#eeeeee');

        undo.beginAction('one', 'stroke');
        paintPixel(store, 'one', 40, 1);
        paintPixel(store, 'one', 41, 2);
        undo.endAction('one');
        store.getState().undo();
        const frame = validateDoc(doc).frames[0];
        expect(frame.base.has(40)).toBe(false);
        expect(frame.base.has(41)).toBe(false);

        bridge.destroy();
        undo.destroy();
        setActiveCollabUndoController(null);
    });

    it('cancels a local action without overwriting a later remote same-pixel value', () => {
        const leftDoc = new Y.Doc();
        const rightDoc = new Y.Doc();
        seedDocFromStore(leftDoc, seedState());
        exchangeUpdates(leftDoc, rightDoc);
        const store = storeFromDoc(leftDoc);
        const undo = createCollabUndoController(leftDoc, () => store.setState({}));
        const bridge = createCollabBridge(leftDoc, store, { undo });

        undo.beginAction('one', 'cancelled-stroke');
        paintPixel(store, 'one', 60, 1);
        expect(undo.canUndo('one')).toBe(true);
        exchangeUpdates(leftDoc, rightDoc);
        const remoteFrame = validateDoc(rightDoc).frames.find(frame => frame.id === 'one')!;
        const remoteYFrame = rightDoc.getMap<Y.Map<unknown>>('frames').get(remoteFrame.id)!;
        const remoteBase = remoteYFrame.get('base');
        if (!(remoteBase instanceof Y.Map)) throw new Error('Missing remote base layer');
        remoteBase.set('60', '#eeeeee');
        exchangeUpdates(leftDoc, rightDoc);
        expect(undo.canUndo('one')).toBe(true);

        expect(undo.cancelAction('one')).toBe(true);
        expect(validateDoc(leftDoc).frames.find(frame => frame.id === 'one')?.base.get(60))
            .toBe('#eeeeee');
        expect(undo.canRedo('one')).toBe(false);

        remoteBase.set('61', '#eeeeee');
        exchangeUpdates(leftDoc, rightDoc);
        expect(undo.canUndo('one')).toBe(false);

        bridge.destroy();
        undo.destroy();
    });
});
