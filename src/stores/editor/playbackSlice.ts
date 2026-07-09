import type { EditorStoreGet, EditorStoreSet, EditorUiState } from './types';
import {
    getLastPlaybackFrameTime,
    isPlaybackLoopRunning,
    requestPlaybackFrame,
    setLastPlaybackFrameTime,
    stopPlaybackLoop
} from './playbackLoop';

export type PlaybackSlice = Pick<EditorUiState, 'setIsPlaying'>;

export const createPlaybackSlice = (
    set: EditorStoreSet,
    get: EditorStoreGet
): PlaybackSlice => ({
    setIsPlaying: (isPlaying) => {
        get().flushPendingPixelUpdates();
        if (!isPlaying) {
            stopPlaybackLoop();
            set({ isPlaying: false });
            return;
        }

        set({ isPlaying: true });

        if (isPlaybackLoopRunning() || typeof requestAnimationFrame !== 'function') {
            return;
        }

        const animate = (time: number) => {
            const state = get();
            if (!state.isPlaying) {
                stopPlaybackLoop();
                return;
            }

            if (!getLastPlaybackFrameTime()) setLastPlaybackFrameTime(time);
            const deltaTime = time - getLastPlaybackFrameTime();
            const targetInterval = 1000 / state.fps;

            if (state.sprites.length > 1 && deltaTime >= targetInterval) {
                set((currentState) => {
                    const currentIndex = currentState.sprites.findIndex(sprite => sprite.id === currentState.activeSpriteId);
                    if (currentIndex === -1) {
                        return { activeSpriteId: currentState.sprites[0].id };
                    }

                    const nextIndex = (currentIndex + 1) % currentState.sprites.length;
                    return { activeSpriteId: currentState.sprites[nextIndex].id };
                });
                // Adjust for drift, keeping remainder
                setLastPlaybackFrameTime(time - (deltaTime % targetInterval));
            }

            requestPlaybackFrame(animate);
        };

        setLastPlaybackFrameTime(0);
        requestPlaybackFrame(animate);
    }
});
