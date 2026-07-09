import { create } from 'zustand';
import { createDocumentSlice } from './editor/documentSlice';
import { createInitialEditorState } from './editor/initialState';
import { createPixelSlice } from './editor/pixelSlice';
import { createPlaybackSlice } from './editor/playbackSlice';
import { createSelectionSlice } from './editor/selectionSlice';
import { createUiSlice } from './editor/uiSlice';
import type { EditorUiState } from './editor/types';

export type { EditorUiState } from './editor/types';

export const useEditorUiStore = create<EditorUiState>((set, get) => ({
    ...createInitialEditorState(),
    ...createPixelSlice(set, get),
    ...createDocumentSlice(set, get),
    ...createSelectionSlice(set, get),
    ...createPlaybackSlice(set, get),
    ...createUiSlice(set, get)
}));
