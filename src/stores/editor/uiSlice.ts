import type { EditorStoreGet, EditorStoreSet, EditorUiState } from './types';
import { ensurePaletteColor } from '../../utils/pixelData';

export type UiSlice = Pick<
    EditorUiState,
    | 'clearNotification'
    | 'notify'
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
    | 'setProjectName'
    | 'setSelectedPixels'
    | 'setTool'
>;

let notificationId = 0;

export const createUiSlice = (
    set: EditorStoreSet,
    get: EditorStoreGet
): UiSlice => ({
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
        if (!isDrawing) {
            get().flushPendingPixelUpdates();
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
    setProjectName: (projectName) => set({ projectName }),
    setSelectedPixels: (selectedPixels) => set((state) => ({
        selectedPixels: typeof selectedPixels === 'function' ? selectedPixels(state.selectedPixels) : selectedPixels
    })),
    setTool: (currentTool) => {
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
