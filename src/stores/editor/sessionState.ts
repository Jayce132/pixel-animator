const dirtyFrameIds = new Set<string>();

export const markFrameDirty = (spriteId: string) => {
    dirtyFrameIds.add(spriteId);
};

export const consumeDirtyFrameIds = (activeSpriteId: string): Set<string> => {
    const frameIdsToCommit = new Set(dirtyFrameIds);
    frameIdsToCommit.add(activeSpriteId);
    dirtyFrameIds.clear();
    return frameIdsToCommit;
};
