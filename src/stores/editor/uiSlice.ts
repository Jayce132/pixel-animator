import type { EditorStoreGet, EditorStoreSet, EditorUiState } from './types';
import type { PixelData } from '../../types';
import {
    clonePixelData,
    ensurePaletteColor,
    MAX_ENCODED_COLORS,
    MAX_PRESET_COLORS
} from '../../utils/pixelData';
import { nearestPaletteIndex } from '../../utils/palettes';
import { getActiveCollabUndoController } from '../../collab/undoRuntime';

export type UiSlice = Pick<
    EditorUiState,
    | 'applyPalette'
    | 'clearNotification'
    | 'notify'
    | 'restorePaletteSnapshot'
    | 'setActiveActions'
    | 'setActiveLayer'
    | 'setActiveSpriteId'
    | 'setBrushSize'
    | 'setCurrentColor'
    | 'setFps'
    | 'setIsDrawing'
    | 'setIsOnionSkinning'
    | 'setIsOverlayStacked'
    | 'setLayerExportMode'
    | 'setPaletteColor'
    | 'setProjectName'
    | 'setSelectedPixels'
    | 'setTool'
>;

let notificationId = 0;

export const createUiSlice = (
    set: EditorStoreSet,
    get: EditorStoreGet
): UiSlice => ({
    applyPalette: (colors, mode) => {
        get().flushPendingPixelUpdates();
        set((state) => {
            const nextColors = colors.slice(0, MAX_PRESET_COLORS);
            if (nextColors.length === 0) return {};

            const palette = [...nextColors];
            // 'keep' only preserves colors the art actually uses — unused old
            // entries have no pixels referencing them, so they drop instead of
            // accumulating across repeated palette switches.
            const usedValues = new Set<number>();
            if (mode === 'keep') {
                state.sprites.forEach(sprite => {
                    sprite.pixelData.forEach(value => { if (value) usedValues.add(value); });
                    sprite.overlayPixelData.forEach(value => { if (value) usedValues.add(value); });
                });
            }

            // Old palette value (1-based; 0 stays transparent) → new value.
            const valueMap = new Uint16Array(state.palette.length + 1);
            state.palette.forEach((oldColor, oldIndex) => {
                if (mode === 'convert') {
                    valueMap[oldIndex + 1] = nearestPaletteIndex(oldColor, nextColors) + 1;
                    return;
                }
                // 'keep': art keeps its exact colors — reuse matching entries in
                // the new palette, append painted-but-missing ones after them.
                let index = palette.indexOf(oldColor);
                if (
                    index === -1 &&
                    usedValues.has(oldIndex + 1) &&
                    palette.length < MAX_ENCODED_COLORS
                ) {
                    palette.push(oldColor);
                    index = palette.length - 1;
                }
                valueMap[oldIndex + 1] = index === -1 ? 0 : index + 1;
            });

            const remap = (data: PixelData): PixelData => {
                const next = data.slice();
                for (let i = 0; i < next.length; i++) {
                    next[i] = valueMap[next[i]] ?? 0;
                }
                return next;
            };

            // Histories hold old palette indices, so they reset (like project
            // load): applying a palette is not undoable.
            const sprites = state.sprites.map(sprite => {
                const pixelData = remap(sprite.pixelData);
                const overlayPixelData = remap(sprite.overlayPixelData);
                return {
                    ...sprite,
                    pixelData,
                    overlayPixelData,
                    history: [clonePixelData(pixelData)],
                    redoHistory: [],
                    overlayHistory: [clonePixelData(overlayPixelData)],
                    overlayRedoHistory: []
                };
            });

            const updates: Partial<EditorUiState> = {
                palette,
                presetCount: nextColors.length,
                sprites
            };
            if (state.currentColor && mode === 'convert') {
                updates.currentColor = nextColors[nearestPaletteIndex(state.currentColor, nextColors)];
                updates.recentColors = [...new Set(
                    state.recentColors.map(color => nextColors[nearestPaletteIndex(color, nextColors)])
                )];
            }
            return updates;
        });
        get().notify(mode === 'convert' ? 'Palette applied — art converted' : 'Palette applied — art unchanged', 'info');
    },
    restorePaletteSnapshot: (snapshot) => {
        get().flushPendingPixelUpdates();
        set((state) => {
            const layersById = new Map(snapshot.layers.map(layers => [layers.id, layers]));
            const sprites = state.sprites.map(sprite => {
                const layers = layersById.get(sprite.id);
                if (!layers) return sprite;
                const pixelData = clonePixelData(layers.pixelData);
                const overlayPixelData = clonePixelData(layers.overlayPixelData);
                return {
                    ...sprite,
                    pixelData,
                    overlayPixelData,
                    history: [clonePixelData(pixelData)],
                    redoHistory: [],
                    overlayHistory: [clonePixelData(overlayPixelData)],
                    overlayRedoHistory: []
                };
            });
            return {
                palette: [...snapshot.palette],
                presetCount: snapshot.presetCount,
                sprites
            };
        });
    },
    setActiveActions: (actions) => set({ activeActions: actions }),
    setActiveLayer: (activeLayer) => {
        get().flushPendingPixelUpdates();
        set({ activeLayer });
    },
    setActiveSpriteId: (activeSpriteId) => {
        get().flushPendingPixelUpdates();
        set((state) => ({
            activeSpriteId: typeof activeSpriteId === 'function' ? activeSpriteId(state.activeSpriteId) : activeSpriteId
        }));
    },
    setBrushSize: (brushSize) => {
        get().flushPendingPixelUpdates();
        set({ brushSize });
    },
    setCurrentColor: (currentColor) => {
        get().flushPendingPixelUpdates();
        set((state) => {
            const updates: Partial<EditorUiState> = { currentColor };
            const encoded = ensurePaletteColor(state.palette, currentColor);
            if (encoded.palette !== state.palette) {
                updates.palette = encoded.palette;
            }

            // Legacy behavior: don't switch tool if we are using fill.
            if (state.currentTool !== 'fill') {
                updates.currentTool = 'brush';
            }

            if (currentColor && !state.recentColors.includes(currentColor)) {
                updates.recentColors = [currentColor, ...state.recentColors].slice(0, 7);
            }

            return updates;
        });
    },
    setFps: (fps) => set((state) => ({
        fps: typeof fps === 'function' ? fps(state.fps) : fps
    })),
    setIsDrawing: (isDrawing) => {
        const wasDrawing = get().isDrawing;
        const collabUndo = getActiveCollabUndoController();
        if (isDrawing && !wasDrawing) {
            collabUndo?.beginAction(get().activeSpriteId);
        }
        if (!isDrawing) {
            get().flushPendingPixelUpdates();
            collabUndo?.endAction(get().activeSpriteId);
        }
        set({ isDrawing });
        if (wasDrawing && !isDrawing) {
            get().commitHistory();
        }
    },
    setIsOnionSkinning: (isOnionSkinning) => set({ isOnionSkinning }),
    setIsOverlayStacked: (isOverlayStacked) => {
        get().flushPendingPixelUpdates();
        set({ isOverlayStacked });
    },
    setLayerExportMode: (layerExportMode) => set({ layerExportMode }),
    setPaletteColor: (index, color) => {
        get().flushPendingPixelUpdates();
        set((state) => {
            if (index < 0 || index >= state.palette.length) return {};
            const previous = state.palette[index];
            if (previous === color) return {};

            // Pixels store palette indices, so swapping an entry recolors
            // everything drawn with it.
            const palette = [...state.palette];
            palette[index] = color;

            const updates: Partial<EditorUiState> = { palette };
            if (state.currentColor === previous) {
                updates.currentColor = color;
            }
            return updates;
        });
    },
    setProjectName: (projectName) => set({ projectName }),
    setSelectedPixels: (selectedPixels) => set((state) => ({
        selectedPixels: typeof selectedPixels === 'function' ? selectedPixels(state.selectedPixels) : selectedPixels
    })),
    setTool: (currentTool) => {
        // No entering select mode mid-playback; a selection made beforehand
        // keeps its tool active so the stamp workflow still works.
        if (currentTool === 'select' && get().isPlaying) return;
        get().flushPendingPixelUpdates();
        set({ currentTool });
    },
    notify: (message, tone = 'error') => {
        notificationId += 1;
        const id = notificationId;

        set({
            notification: {
                id,
                message,
                tone
            }
        });

        window.setTimeout(() => {
            set((state) => ({
                notification: state.notification?.id === id ? null : state.notification
            }));
        }, 3500);
    },
    clearNotification: () => set({ notification: null })
});
