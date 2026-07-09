import React from 'react';
import type { Sprite } from '../../types';

interface UseTimelineActiveFrameScrollOptions {
    activeDragId: number | null;
    activeSpriteId: number;
    batchSize: number;
    currentBatch: number;
    isDragCoolingDown: boolean;
    isPlaying: boolean;
    isPointerDownRef: React.MutableRefObject<boolean>;
    setCurrentBatch: React.Dispatch<React.SetStateAction<number>>;
    sprites: Sprite[];
    timelineRef: React.RefObject<HTMLDivElement | null>;
}

export const useTimelineActiveFrameScroll = ({
    activeDragId,
    activeSpriteId,
    batchSize,
    currentBatch,
    isDragCoolingDown,
    isPlaying,
    isPointerDownRef,
    setCurrentBatch,
    sprites,
    timelineRef
}: UseTimelineActiveFrameScrollOptions) => {
    React.useEffect(() => {
        const container = timelineRef.current?.querySelector('.timeline-frame-list') as HTMLElement;
        if (container && activeDragId === null && !isDragCoolingDown && !isPointerDownRef.current) {
            const index = sprites.findIndex(s => s.id === activeSpriteId);
            if (index === -1) return;

            const isSmall = window.innerWidth <= 1024;
            const frameSize = isSmall ? 75 : 100;
            const listWidth = container.clientWidth;
            const spacerWidth = (listWidth / 2) - (frameSize / 2);

            const frameLeft = (index * frameSize) + spacerWidth;
            const scrollLeft = container.scrollLeft;
            const frameOffset = frameLeft - scrollLeft;

            const buffer = frameSize * 2;
            const isNearLeft = frameOffset < buffer;
            const isNearRight = frameOffset > listWidth - buffer - frameSize;

            if (isPlaying) {
                const targetScroll = frameLeft - (listWidth / 2) + (frameSize / 2);
                container.scrollTo({ left: targetScroll, behavior: 'auto' });
            } else if (isNearLeft || isNearRight) {
                const targetScroll = frameLeft - (listWidth / 2) + (frameSize / 2);
                container.scrollTo({ left: targetScroll, behavior: 'smooth' });
            }
        }
    }, [activeDragId, activeSpriteId, isDragCoolingDown, isPlaying, isPointerDownRef, sprites, timelineRef]);

    React.useEffect(() => {
        if (activeDragId !== null || isDragCoolingDown) return;

        const index = sprites.findIndex(s => s.id === activeSpriteId);
        if (index !== -1) {
            const batch = Math.floor(index / batchSize);
            if (batch !== currentBatch) setCurrentBatch(batch);
        }
    }, [activeDragId, activeSpriteId, batchSize, currentBatch, isDragCoolingDown, setCurrentBatch, sprites]);
};
