import { PRESET_COLORS } from '../../types';
import { mergePalettes } from '../../utils/pixelData';
import type { EditorUiState } from './types';
import { createEmptySprite } from './history';

export type EditorStateValues = Pick<
    EditorUiState,
    | 'activeActions'
    | 'activeLayer'
    | 'activeSpriteId'
    | 'brushSize'
    | 'currentColor'
    | 'currentTool'
    | 'floatingLayer'
    | 'fps'
    | 'isOnionSkinning'
    | 'isOverlayStacked'
    | 'isDrawing'
    | 'isPlaying'
    | 'isStamping'
    | 'layerExportMode'
    | 'notification'
    | 'palette'
    | 'presetCount'
    | 'projectName'
    | 'recentColors'
    | 'selectedPixels'
    | 'sprites'
>;

export const createInitialEditorState = (): EditorStateValues => {
    const initialSprite = createEmptySprite();
    // The first preset color is picked automatically so the brush is ready
    // immediately — the app no longer gates the canvas/timeline/toolbar
    // behind an explicit "first pick" from the user.
    const palette = mergePalettes(PRESET_COLORS);
    const firstColor = palette[0] ?? null;
    return {
        activeActions: [],
        activeLayer: 'base',
        activeSpriteId: initialSprite.id,
        brushSize: 2,
        currentColor: firstColor,
        currentTool: 'brush',
        floatingLayer: new Map(),
        fps: 8,
        isOnionSkinning: false,
        isOverlayStacked: true,
        isDrawing: false,
        isPlaying: false,
        isStamping: false,
        layerExportMode: 'merged',
        notification: null,
        palette,
        presetCount: PRESET_COLORS.length,
        projectName: 'project_name',
        recentColors: firstColor ? [firstColor] : [],
        selectedPixels: new Set(),
        sprites: [initialSprite]
    };
};
