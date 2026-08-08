export interface CollabUndoController {
    beginAction: (frameId: string, actionId?: string) => void;
    endAction: (frameId?: string) => void;
    cancelAction: (frameId: string) => boolean;
    preparePixelTransaction: (frameIds: Iterable<string>) => void;
    finishPixelTransaction: (frameIds: Iterable<string>) => void;
    canUndo: (frameId: string) => boolean;
    canRedo: (frameId: string) => boolean;
    undo: (frameId: string) => boolean;
    redo: (frameId: string) => boolean;
    clearAll: () => void;
    retainFrames: (frameIds: Iterable<string>) => void;
    destroy: () => void;
}

let activeUndoController: CollabUndoController | null = null;

export const setActiveCollabUndoController = (controller: CollabUndoController | null): void => {
    activeUndoController = controller;
};

export const getActiveCollabUndoController = (): CollabUndoController | null => activeUndoController;
