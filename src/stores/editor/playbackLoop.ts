let playbackRequest: number | null = null;
let lastPlaybackFrameTime = 0;

export const stopPlaybackLoop = () => {
    if (playbackRequest !== null) {
        if (typeof cancelAnimationFrame === 'function') {
            cancelAnimationFrame(playbackRequest);
        }
        playbackRequest = null;
    }
    lastPlaybackFrameTime = 0;
};

export const isPlaybackLoopRunning = () => playbackRequest !== null;

export const requestPlaybackFrame = (callback: FrameRequestCallback) => {
    playbackRequest = requestAnimationFrame(callback);
};

export const getLastPlaybackFrameTime = () => lastPlaybackFrameTime;

export const setLastPlaybackFrameTime = (time: number) => {
    lastPlaybackFrameTime = time;
};
