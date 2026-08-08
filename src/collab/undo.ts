import * as Y from 'yjs';
import { getCollabDocHandles } from './doc';
import { LOCAL_PIXEL_ORIGIN } from './origins';
import type { CollabUndoController } from './undoRuntime';

const ACTION_ID_META = 'collab-action-id';
type UndoStackItem = Y.UndoManager['undoStack'][number];

export const createCollabUndoController = (
    doc: Y.Doc,
    onRevision: () => void
): CollabUndoController => {
    const { frames } = getCollabDocHandles(doc);
    const managers = new Map<string, Y.UndoManager>();
    let activeAction: { frameId: string; actionId: string; capturedItem: UndoStackItem | null } | null = null;
    let actionSequence = 0;
    let destroyed = false;

    const bumpRevision = (): void => onRevision();

    const ensureManager = (frameId: string): Y.UndoManager | null => {
        const existing = managers.get(frameId);
        if (existing) return existing;
        const frame = frames.get(frameId);
        const base = frame?.get('base');
        const top = frame?.get('top');
        if (!(base instanceof Y.Map) || !(top instanceof Y.Map)) return null;

        const manager = new Y.UndoManager([base, top], {
            trackedOrigins: new Set([LOCAL_PIXEL_ORIGIN])
        });
        manager.on('stack-item-added', event => {
            if (activeAction?.frameId === frameId && event.origin === LOCAL_PIXEL_ORIGIN) {
                event.stackItem.meta.set(ACTION_ID_META, activeAction.actionId);
            }
            bumpRevision();
        });
        manager.on('stack-item-updated', event => {
            if (activeAction?.frameId === frameId && event.origin === LOCAL_PIXEL_ORIGIN) {
                event.stackItem.meta.set(ACTION_ID_META, activeAction.actionId);
            }
            bumpRevision();
        });
        manager.on('stack-item-popped', bumpRevision);
        manager.on('stack-cleared', bumpRevision);
        managers.set(frameId, manager);
        return manager;
    };

    const destroyManager = (frameId: string): void => {
        const manager = managers.get(frameId);
        if (!manager) return;
        manager.destroy();
        managers.delete(frameId);
    };

    return {
        beginAction: (frameId, actionId) => {
            if (destroyed) return;
            if (activeAction) {
                managers.get(activeAction.frameId)?.stopCapturing();
            }
            actionSequence += 1;
            activeAction = {
                frameId,
                actionId: actionId ?? `${frameId}:${actionSequence}`,
                capturedItem: null
            };
            managers.get(frameId)?.stopCapturing();
        },
        endAction: (frameId) => {
            if (!activeAction || (frameId && activeAction.frameId !== frameId)) return;
            managers.get(activeAction.frameId)?.stopCapturing();
            activeAction = null;
        },
        cancelAction: (frameId) => {
            if (!activeAction || activeAction.frameId !== frameId) return false;
            const action = activeAction;
            const actionId = action.actionId;
            const manager = managers.get(frameId);
            activeAction = null;
            if (!manager) return false;
            manager.stopCapturing();
            const item = manager.undoStack[manager.undoStack.length - 1];
            if (
                !item
                || (item !== action.capturedItem && item.meta.get(ACTION_ID_META) !== actionId)
            ) return false;
            const popped = manager.undo();
            const redoIndex = manager.redoStack.lastIndexOf(popped ?? item);
            if (redoIndex >= 0) manager.redoStack.splice(redoIndex, 1);
            manager.stopCapturing();
            bumpRevision();
            return true;
        },
        preparePixelTransaction: (frameIds) => {
            for (const frameId of frameIds) {
                const manager = ensureManager(frameId);
                if (activeAction?.frameId !== frameId) manager?.stopCapturing();
            }
        },
        finishPixelTransaction: (frameIds) => {
            for (const frameId of frameIds) {
                const manager = managers.get(frameId);
                if (activeAction?.frameId === frameId) {
                    const item = manager?.undoStack[manager.undoStack.length - 1];
                    item?.meta.set(ACTION_ID_META, activeAction.actionId);
                    if (item) activeAction.capturedItem = item;
                } else {
                    manager?.stopCapturing();
                }
            }
        },
        canUndo: frameId => managers.get(frameId)?.canUndo() ?? false,
        canRedo: frameId => managers.get(frameId)?.canRedo() ?? false,
        undo: frameId => {
            const manager = managers.get(frameId);
            if (!manager?.canUndo()) return false;
            manager.stopCapturing();
            manager.undo();
            return true;
        },
        redo: frameId => {
            const manager = managers.get(frameId);
            if (!manager?.canRedo()) return false;
            manager.stopCapturing();
            manager.redo();
            return true;
        },
        clearAll: () => {
            managers.forEach(manager => {
                manager.stopCapturing();
                manager.clear();
            });
            activeAction = null;
        },
        retainFrames: frameIds => {
            const retained = new Set(frameIds);
            [...managers.keys()].forEach(frameId => {
                if (!retained.has(frameId)) destroyManager(frameId);
            });
            if (activeAction && !retained.has(activeAction.frameId)) activeAction = null;
        },
        destroy: () => {
            if (destroyed) return;
            destroyed = true;
            [...managers.keys()].forEach(destroyManager);
            activeAction = null;
        }
    };
};
