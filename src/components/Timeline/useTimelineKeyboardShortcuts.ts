import React from 'react';
import type { Sprite } from '../../types';

interface UseTimelineKeyboardShortcutsOptions {
    batchSize: number;
    currentBatch: number;
    deleteSprite: () => void;
    duplicateSprite: () => void;
    handleBulkDelete: () => void;
    handleBulkDuplicate: () => void;
    selectedSpriteIds: Set<string>;
    setActiveSpriteId: (id: string) => void;
    setCurrentBatch: React.Dispatch<React.SetStateAction<number>>;
    setIsSelectionMode: React.Dispatch<React.SetStateAction<boolean>>;
    setSelectedSpriteIds: React.Dispatch<React.SetStateAction<Set<string>>>;
    spritesRef: React.MutableRefObject<Sprite[]>;
}

export const useTimelineKeyboardShortcuts = ({
    batchSize,
    currentBatch,
    deleteSprite,
    duplicateSprite,
    handleBulkDelete,
    handleBulkDuplicate,
    selectedSpriteIds,
    setActiveSpriteId,
    setCurrentBatch,
    setIsSelectionMode,
    setSelectedSpriteIds,
    spritesRef
}: UseTimelineKeyboardShortcutsOptions) => {
    React.useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            const activeElement = document.activeElement;
            const isInput = activeElement instanceof HTMLInputElement ||
                activeElement instanceof HTMLTextAreaElement ||
                activeElement?.hasAttribute('contenteditable');

            if (isInput) return;

            const isCmd = e.metaKey || e.ctrlKey;
            const isShift = e.shiftKey;

            if (isShift && e.code === 'KeyN') {
                e.preventDefault();
                if (selectedSpriteIds.size > 0) {
                    handleBulkDuplicate();
                } else {
                    duplicateSprite();
                }
            }

            // Select All Frames (Cmd+A)
            if (isCmd && e.code === 'KeyA') {
                e.preventDefault();
                setIsSelectionMode(true); // Ensure selection mode is on
                setSelectedSpriteIds(new Set(spritesRef.current.map(s => s.id)));
            }

            // Deselect Frames (Cmd+Shift+A)
            if (isCmd && isShift && e.code === 'KeyA') {
                e.preventDefault();
                if (selectedSpriteIds.size > 0) {
                    setSelectedSpriteIds(new Set());
                    setIsSelectionMode(false);
                }
            }

            // Shift+Delete: Bulk delete selected, or delete active frame
            if (isShift && (e.code === 'Delete' || e.code === 'Backspace')) {
                e.preventDefault();
                if (selectedSpriteIds.size > 0) {
                    handleBulkDelete();
                } else {
                    deleteSprite();
                }
            }

            if (/^[1-8]$/.test(e.key)) {
                const localIndex = parseInt(e.key) - 1;
                const globalIndex = (currentBatch * batchSize) + localIndex;
                const targetSprite = spritesRef.current[globalIndex];
                if (targetSprite) setActiveSpriteId(targetSprite.id);
            }
            if (e.key === '9') {
                setCurrentBatch(prev => {
                    const newBatch = Math.max(0, prev - 1);
                    const firstIdx = newBatch * batchSize;
                    if (spritesRef.current[firstIdx]) setActiveSpriteId(spritesRef.current[firstIdx].id);
                    return newBatch;
                });
            }
            if (e.key === '0') {
                setCurrentBatch(prev => {
                    const maxBatch = Math.floor((spritesRef.current.length - 1) / batchSize);
                    const newBatch = Math.min(prev + 1, maxBatch);
                    if (newBatch !== prev) {
                        const firstIdx = newBatch * batchSize;
                        if (spritesRef.current[firstIdx]) setActiveSpriteId(spritesRef.current[firstIdx].id);
                    }
                    return newBatch;
                });
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [
        batchSize,
        currentBatch,
        selectedSpriteIds,
        duplicateSprite,
        handleBulkDuplicate,
        handleBulkDelete,
        deleteSprite,
        setActiveSpriteId,
        setCurrentBatch,
        setIsSelectionMode,
        setSelectedSpriteIds,
        spritesRef
    ]);
};
