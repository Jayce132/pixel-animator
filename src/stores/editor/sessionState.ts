const dirtyFrameIds = new Set<number>();

export const markFrameDirty = (spriteId: number) => {
    dirtyFrameIds.add(spriteId);
};

export const consumeDirtyFrameIds = (activeSpriteId: number): Set<number> => {
    const frameIdsToCommit = new Set(dirtyFrameIds);
    frameIdsToCommit.add(activeSpriteId);
    dirtyFrameIds.clear();
    return frameIdsToCommit;
};
