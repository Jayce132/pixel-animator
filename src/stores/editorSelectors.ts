import type { EditorUiState } from './editorStore';
import { hasVisiblePixels } from '../utils/pixelData';
import { getActiveCollabUndoController } from '../collab/undoRuntime';

export const selectActiveSprite = (state: EditorUiState) => (
    state.sprites.find(sprite => sprite.id === state.activeSpriteId)
);

export const selectCanUndo = (state: EditorUiState) => {
    const collabUndo = getActiveCollabUndoController();
    if (collabUndo) return collabUndo.canUndo(state.activeSpriteId);
    const activeSprite = selectActiveSprite(state);
    return activeSprite ? activeSprite.history.length > 1 : false;
};

export const selectCanRedo = (state: EditorUiState) => {
    const collabUndo = getActiveCollabUndoController();
    if (collabUndo) return collabUndo.canRedo(state.activeSpriteId);
    const activeSprite = selectActiveSprite(state);
    return activeSprite ? activeSprite.redoHistory.length > 0 : false;
};

export const selectCanClear = (state: EditorUiState) => {
    const activeSprite = selectActiveSprite(state);
    if (!activeSprite) return false;

    return state.activeLayer === 'base'
        ? hasVisiblePixels(activeSprite.pixelData)
        : hasVisiblePixels(activeSprite.overlayPixelData);
};
