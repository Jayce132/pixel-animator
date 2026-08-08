import { GRID_SIZE, PRESET_COLORS } from '../../types';
import type { PixelData, Sprite } from '../../types';
import { exportFrameToPNG, exportProjectToGIF, exportSpriteSheetToPNG } from '../../utils/export';
import { decompressPixelData, exportSpritesToJSON, loadProjectJSON, saveProjectJSON } from '../../utils/save';
import {
    clonePixelData,
    colorArrayToPixelData,
    createBlankPixelData,
    mergePalettes,
    wholesaleInstallRevealState
} from '../../utils/pixelData';
import type { EditorStoreGet, EditorStoreSet, EditorUiState } from './types';
import {
    generateSpriteId,
    generateSpriteName,
    getLayerKey,
    pushHistoryForSprite,
    reorderSpriteSelection,
    normalizeLoadedSpriteId
} from './history';
import { consumeDirtyFrameIds } from './sessionState';
import { stopPlaybackLoop } from './playbackLoop';
import { getActiveCollabUndoController } from '../../collab/undoRuntime';
import { withCollabWholesaleAction } from '../../collab/actionContext';
import { LOCAL_WHOLESALE_ORIGIN } from '../../collab/origins';

export type DocumentSlice = Pick<
    EditorUiState,
    | 'addSprite'
    | 'clearCanvas'
    | 'commitHistory'
    | 'deleteSprite'
    | 'duplicateSprite'
    | 'duplicateSprites'
    | 'exportFrame'
    | 'exportFrameJSON'
    | 'exportGIF'
    | 'exportSelectedJSON'
    | 'exportSelectedPNG'
    | 'exportSpriteSheet'
    | 'importMultipleFromJSON'
    | 'loadProject'
    | 'moveSprite'
    | 'moveSprites'
    | 'redo'
    | 'saveProject'
    | 'undo'
>;

// A duplicate copies only the layers currently visible for editing (both when
// stacked, otherwise just the active layer) and inherits the source's undo
// steps for those layers. A blanked layer instead gets blank snapshots of the
// same depth: undo pops base and overlay history in lockstep, so the stacks
// must stay equal length — undoing then walks only the inherited layer back
// while the blank layer stays blank.
const cloneSpriteAsDuplicate = (
    source: Sprite,
    id: string,
    copiesBase: boolean,
    copiesTop: boolean,
    blank: PixelData
): Sprite => ({
    ...source,
    id,
    name: `${source.name} (Copy)`,
    pixelData: clonePixelData(copiesBase ? source.pixelData : blank),
    overlayPixelData: clonePixelData(copiesTop ? source.overlayPixelData : blank),
    history: source.history.map(entry => clonePixelData(copiesBase ? entry : blank)),
    redoHistory: [],
    overlayHistory: source.overlayHistory.map(entry => clonePixelData(copiesTop ? entry : blank)),
    overlayRedoHistory: []
});

export const createDocumentSlice = (
    set: EditorStoreSet,
    get: EditorStoreGet
): DocumentSlice => ({
    addSprite: () => {
        get().flushPendingPixelUpdates();
        const { sprites } = get();
        if (sprites.length >= 64) {
            get().notify('Frame limit reached (64)');
            return;
        }

        const newId = generateSpriteId(sprites.map(sprite => sprite.id));
        const basePixels = createBlankPixelData();
        const overlayPixels = createBlankPixelData();
        const newSprite: Sprite = {
            id: newId,
            name: generateSpriteName(sprites),
            pixelData: basePixels,
            overlayPixelData: overlayPixels,
            history: [clonePixelData(basePixels)],
            redoHistory: [],
            overlayHistory: [clonePixelData(overlayPixels)],
            overlayRedoHistory: []
        };

        set({ sprites: [...sprites, newSprite], activeSpriteId: newId });
    },
    clearCanvas: () => {
        get().discardPendingPixelUpdates();
        const { activeLayer, activeSpriteId } = get();
        const layerKey = getLayerKey(activeLayer);

        // Update pixel data AND save history immediately (atomic action)
        set((state) => ({
            sprites: state.sprites.map(sprite => {
                if (sprite.id !== activeSpriteId) return sprite;

                const clearedSprite = {
                    ...sprite,
                    [layerKey]: createBlankPixelData()
                };

                // Save history for this atomic action
                return pushHistoryForSprite(clearedSprite);
            })
        }));
    },
    commitHistory: () => {
        get().flushPendingPixelUpdates();
        if (getActiveCollabUndoController()) return;
        const frameIdsToCommit = consumeDirtyFrameIds(get().activeSpriteId);

        set((state) => {
            let changed = false;
            const sprites = state.sprites.map(sprite => {
                if (!frameIdsToCommit.has(sprite.id)) return sprite;

                const nextSprite = pushHistoryForSprite(sprite);
                if (nextSprite !== sprite) changed = true;
                return nextSprite;
            });

            return changed ? { sprites } : {};
        });
    },
    deleteSprite: (idToDelete) => {
        get().flushPendingPixelUpdates();
        const { activeSpriteId, sprites } = get();
        const targetId = idToDelete ?? activeSpriteId;
        const targetIndex = sprites.findIndex(s => s.id === targetId);
        if (targetIndex === -1) return;

        // If this is the last sprite, clear it instead of deleting.
        if (sprites.length <= 1) {
            const blank = createBlankPixelData();
            set({
                sprites: sprites.map(s => ({
                    ...s,
                    pixelData: clonePixelData(blank),
                    overlayPixelData: clonePixelData(blank),
                    history: [clonePixelData(blank)],
                    redoHistory: [],
                    overlayHistory: [clonePixelData(blank)],
                    overlayRedoHistory: []
                }))
            });
            return;
        }

        const nextSprites = sprites.filter(s => s.id !== targetId);
        const nextState: Pick<EditorUiState, 'sprites'> & Partial<Pick<EditorUiState, 'activeSpriteId'>> = {
            sprites: nextSprites
        };

        // If we deleted the active sprite, pick the previous frame when possible.
        if (targetId === activeSpriteId) {
            nextState.activeSpriteId = targetIndex > 0
                ? sprites[targetIndex - 1].id
                : nextSprites[0].id;
        }

        set(nextState);
    },
    duplicateSprite: () => {
        get().flushPendingPixelUpdates();
        const { activeLayer, activeSpriteId, isOverlayStacked, sprites } = get();
        if (sprites.length >= 64) {
            get().notify('Frame limit reached (64)');
            return;
        }

        const activeIndex = sprites.findIndex(s => s.id === activeSpriteId);
        if (activeIndex === -1) return;

        const sourceSprite = sprites[activeIndex];
        const newId = generateSpriteId(sprites.map(sprite => sprite.id));
        const blank = createBlankPixelData();

        const copiesBase = isOverlayStacked || activeLayer === 'base';
        const copiesTop = isOverlayStacked || activeLayer === 'top';
        const newSprite = cloneSpriteAsDuplicate(sourceSprite, newId, copiesBase, copiesTop, blank);

        set({ sprites: [...sprites, newSprite], activeSpriteId: newId });
    },
    duplicateSprites: (ids) => {
        get().flushPendingPixelUpdates();
        const { activeLayer, isOverlayStacked, sprites } = get();
        const idSet = new Set(ids);
        const sourceIndices = sprites
            .map((sprite, index) => (idSet.has(sprite.id) ? index : -1))
            .filter(index => index !== -1);
        if (sourceIndices.length === 0) return [];
        if (sprites.length + sourceIndices.length > 64) {
            get().notify('Frame limit reached (64)');
            return [];
        }

        const copiesBase = isOverlayStacked || activeLayer === 'base';
        const copiesTop = isOverlayStacked || activeLayer === 'top';
        const blank = createBlankPixelData();
        const allocatedIds = new Set(sprites.map(sprite => sprite.id));
        const copies = sourceIndices.map(index => {
            const id = generateSpriteId(allocatedIds);
            allocatedIds.add(id);
            return cloneSpriteAsDuplicate(sprites[index], id, copiesBase, copiesTop, blank);
        });

        // Copies land as one group right after the last selected frame so the
        // originals stay together: 1 2 3 4 with 2+3 selected → 1 2 3 2' 3' 4.
        const insertIndex = sourceIndices[sourceIndices.length - 1] + 1;
        const nextSprites = [...sprites];
        nextSprites.splice(insertIndex, 0, ...copies);

        set({ sprites: nextSprites, activeSpriteId: copies[0].id });
        return copies.map(copy => copy.id);
    },
    exportFrame: (projectName, layerMode) => {
        get().flushPendingPixelUpdates();
        const { activeSpriteId, palette, sprites } = get();
        const activeSprite = sprites.find(sprite => sprite.id === activeSpriteId);
        if (!activeSprite) return;

        const index = sprites.findIndex(sprite => sprite.id === activeSprite.id);
        exportFrameToPNG(projectName, activeSprite, palette, index, GRID_SIZE, 10, layerMode);
    },
    exportFrameJSON: (projectName, layerMode) => {
        get().flushPendingPixelUpdates();
        const { activeSpriteId, palette, sprites } = get();
        const activeSprite = sprites.find(sprite => sprite.id === activeSpriteId);
        if (!activeSprite) return;

        const index = sprites.findIndex(sprite => sprite.id === activeSprite.id);
        exportSpritesToJSON(projectName, [activeSprite], layerMode, palette, index);
    },
    exportGIF: (projectName, layerMode) => {
        get().flushPendingPixelUpdates();
        const { fps, palette, sprites } = get();
        exportProjectToGIF(projectName, sprites, palette, fps, GRID_SIZE, 20, layerMode);
    },
    exportSelectedJSON: (projectName, layerMode, spritesToExport) => {
        get().flushPendingPixelUpdates();
        const { palette, sprites } = get();
        spritesToExport.forEach(sprite => {
            const index = sprites.findIndex(candidate => candidate.id === sprite.id);
            exportSpritesToJSON(projectName, [sprite], layerMode, palette, index);
        });
    },
    exportSelectedPNG: (projectName, layerMode, spritesToExport) => {
        get().flushPendingPixelUpdates();
        const { palette, sprites } = get();
        spritesToExport.forEach(sprite => {
            const index = sprites.findIndex(candidate => candidate.id === sprite.id);
            exportFrameToPNG(projectName, sprite, palette, index, GRID_SIZE, 10, layerMode);
        });
    },
    exportSpriteSheet: (projectName, layerMode, spritesToExport) => {
        get().flushPendingPixelUpdates();
        const { palette, sprites } = get();
        exportSpriteSheetToPNG(projectName, spritesToExport || sprites, palette, GRID_SIZE, 10, layerMode);
    },
    importMultipleFromJSON: (files) => {
        get().flushPendingPixelUpdates();
        const { activeSpriteId, palette, sprites } = get();
        if (sprites.length + files.length > 64) {
            get().notify('Cannot import: exceeds maximum limit of 64 frames.');
            return [];
        }

        if (files.length === 0) return [];

        const nextSprites = [...sprites];
        const activeIndex = nextSprites.findIndex(sprite => sprite.id === activeSpriteId);

        const allocatedIds = new Set(nextSprites.map(sprite => sprite.id));
        let nextPalette = palette;

        const newSprites = files.map(file => {
            const id = generateSpriteId(allocatedIds);
            allocatedIds.add(id);
            const baseResult = colorArrayToPixelData(file.pixels, nextPalette);
            nextPalette = baseResult.palette;
            const overlayResult = file.overlayPixels
                ? colorArrayToPixelData(file.overlayPixels, nextPalette)
                : { pixelData: createBlankPixelData(), palette: nextPalette };
            nextPalette = overlayResult.palette;

            return {
                id,
                name: file.name || `Imported Frame`,
                pixelData: baseResult.pixelData,
                overlayPixelData: overlayResult.pixelData,
                history: [clonePixelData(baseResult.pixelData)],
                redoHistory: [],
                overlayHistory: [clonePixelData(overlayResult.pixelData)],
                overlayRedoHistory: []
            };
        });

        // Splice newly imported frames directly after the active frame
        const insertIndex = activeIndex >= 0 ? activeIndex + 1 : nextSprites.length;
        nextSprites.splice(insertIndex, 0, ...newSprites);

        // Update the sprites via history so it's undoable
        // Focus the first newly imported frame
        const firstNewId = newSprites[0].id;
        const updatedSprites = nextSprites.map(sprite => (
            sprite.id === firstNewId ? pushHistoryForSprite(sprite) : sprite
        ));

        set({ sprites: updatedSprites, activeSpriteId: firstNewId, palette: nextPalette });
        return newSprites.map(sprite => sprite.id);
    },
    loadProject: async (file, collabMarker) => {
        get().discardPendingPixelUpdates();
        try {
            const projectData = await loadProjectJSON(file);
            // Use the saved palette as-is (capped) — merging PRESET_COLORS in
            // would corrupt the preset section of projects saved with an
            // applied template. Pre-1.1 files lack presetCount; their preset
            // section was always the leading default colors.
            const projectPalette = mergePalettes(projectData.palette);
            const savedPresetCount = typeof projectData.presetCount === 'number'
                ? projectData.presetCount
                : PRESET_COLORS.length;
            const presetCount = Math.max(1, Math.min(savedPresetCount, projectPalette.length));

            // Reconstruct Sprites
            const loadedIds = new Set<string>();
            const newSprites: Sprite[] = projectData.frames.map(frame => {
                const pixelData = decompressPixelData(frame.pixelData, projectPalette);
                // overlayPixelData was added recently, handle older files without it
                const overlayPixelData = frame.overlayPixelData
                    ? decompressPixelData(frame.overlayPixelData, projectPalette)
                    : createBlankPixelData();

                const id = normalizeLoadedSpriteId(frame.id, loadedIds);
                loadedIds.add(id);

                return {
                    id,
                    name: frame.name,
                    pixelData,
                    overlayPixelData,
                    history: [clonePixelData(pixelData)],
                    redoHistory: [],
                    overlayHistory: [clonePixelData(overlayPixelData)],
                    overlayRedoHistory: []
                };
            });

            if (newSprites.length === 0) return;

            stopPlaybackLoop();
            const commitProject = () => set({
                // Stop playing if it is
                isPlaying: false,
                // Update Name and FPS
                projectName: projectData.name || 'my_project',
                fps: projectData.fps || 8,
                palette: projectPalette,
                presetCount,
                sprites: newSprites,
                activeSpriteId: newSprites[0].id,
                floatingLayer: new Map(),
                selectedPixels: new Set(),
                // Loaded content is already "revealed" — don't replay the
                // first-launch intro (bounce-in, "pick a color to begin").
                ...wholesaleInstallRevealState(projectPalette)
            });
            if (collabMarker) {
                withCollabWholesaleAction(LOCAL_WHOLESALE_ORIGIN, collabMarker, commitProject);
            } else {
                commitProject();
            }
        } catch (error) {
            console.error("Failed to load project:", error);
            get().notify('Failed to load project. Ensure it is a valid project file.');
        }
    },
    moveSprite: (oldIndex, newIndex) => {
        get().flushPendingPixelUpdates();
        set((state) => {
            const nextSprites = [...state.sprites];
            const [movedSprite] = nextSprites.splice(oldIndex, 1);
            if (!movedSprite) return state;
            nextSprites.splice(newIndex, 0, movedSprite);
            return { sprites: nextSprites };
        });
    },
    moveSprites: (indices, insertAtIndex, activeIndex) => {
        get().flushPendingPixelUpdates();
        set((state) => {
            const nextSprites = reorderSpriteSelection(state.sprites, indices, insertAtIndex, activeIndex);
            return nextSprites === state.sprites ? state : { sprites: nextSprites };
        });
    },
    redo: () => {
        get().flushPendingPixelUpdates();
        const { activeSpriteId } = get();
        const collabUndo = getActiveCollabUndoController();
        if (collabUndo) {
            collabUndo.redo(activeSpriteId);
            return;
        }

        set((state) => ({
            sprites: state.sprites.map(sprite => {
                if (sprite.id !== activeSpriteId) return sprite;
                if (sprite.redoHistory.length === 0) return sprite;

                const newRedoHistory = [...sprite.redoHistory];
                const newOverlayRedoHistory = [...sprite.overlayRedoHistory];
                const nextState = newRedoHistory.pop();
                const nextOverlayState = newOverlayRedoHistory.pop();

                if (!nextState || !nextOverlayState) return sprite;

                const newHistory = [...sprite.history, clonePixelData(nextState)];
                const newOverlayHistory = [...sprite.overlayHistory, clonePixelData(nextOverlayState)];

                return {
                    ...sprite,
                    pixelData: clonePixelData(nextState),
                    overlayPixelData: clonePixelData(nextOverlayState),
                    history: newHistory,
                    overlayHistory: newOverlayHistory,
                    redoHistory: newRedoHistory,
                    overlayRedoHistory: newOverlayRedoHistory
                };
            })
        }));
    },
    saveProject: (projectName) => {
        get().flushPendingPixelUpdates();
        const { fps, palette, presetCount, sprites } = get();
        saveProjectJSON(projectName, sprites, fps, palette, presetCount, GRID_SIZE);
    },
    undo: () => {
        get().flushPendingPixelUpdates();
        const { activeSpriteId } = get();
        const collabUndo = getActiveCollabUndoController();
        if (collabUndo) {
            collabUndo.undo(activeSpriteId);
            return;
        }

        set((state) => ({
            sprites: state.sprites.map(sprite => {
                if (sprite.id !== activeSpriteId) return sprite;
                if (sprite.history.length <= 1) return sprite;

                const newHistory = [...sprite.history];
                const newOverlayHistory = [...sprite.overlayHistory];
                const currentState = newHistory.pop(); // Pop current
                const previousState = newHistory[newHistory.length - 1]; // Peek previous
                const currentOverlayState = newOverlayHistory.pop();
                const previousOverlayState = newOverlayHistory[newOverlayHistory.length - 1];

                if (!currentState || !previousState || !currentOverlayState || !previousOverlayState) return sprite;

                return {
                    ...sprite,
                    pixelData: clonePixelData(previousState),
                    overlayPixelData: clonePixelData(previousOverlayState),
                    history: newHistory,
                    overlayHistory: newOverlayHistory,
                    redoHistory: [...sprite.redoHistory, currentState],
                    overlayRedoHistory: [...sprite.overlayRedoHistory, currentOverlayState]
                };
            })
        }));
    }
});
