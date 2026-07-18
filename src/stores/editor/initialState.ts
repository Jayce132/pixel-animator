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

export const createInitialEditorState = (): EditorStateValues => ({
    activeActions: [],
    activeLayer: 'base',
    activeSpriteId: 0,
    brushSize: 2,
    currentColor: null,
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
    palette: mergePalettes(PRESET_COLORS),
    presetCount: PRESET_COLORS.length,
    projectName: 'project_name',
    recentColors: [],
    selectedPixels: new Set(),
    sprites: [createEmptySprite()]
});
