import React from 'react';
import { TimelineFrame } from './TimelineFrame';
import { SortableFrame } from './SortableFrame';
import { ImportExportMenu } from './ImportExportMenu';
import { SelectedFrameGhostStrip } from './SelectedFrameGhostStrip';
import { TimelineFpsControls } from './TimelineFpsControls';
import { TimelineDragOverlayContent } from './TimelineDragOverlayContent';
import { useTimelineActiveFrameScroll } from './useTimelineActiveFrameScroll';
import { useTimelineDragHint } from './useTimelineDragHint';
import { useTimelineKeyboardShortcuts } from './useTimelineKeyboardShortcuts';
import { TIMELINE_SELECTION_LONG_PRESS_DELAY_MS, useTimelineTouch } from './useTimelineTouch';
import type { PixelData, Sprite } from '../../types';
import { getCompositePixelData, getSpriteLayerPixels } from '../../utils/compositing';
import { useEditorUiStore } from '../../stores/editorStore';
import { selectActiveSprite } from '../../stores/editorSelectors';
import {
    DndContext,
    closestCenter,
    PointerSensor,
    useSensor,
    useSensors,
    DragOverlay,
} from '@dnd-kit/core';
import type { DragEndEvent, DragStartEvent, DragOverEvent } from '@dnd-kit/core';
import {
    SortableContext,
    horizontalListSortingStrategy,
} from '@dnd-kit/sortable';
import { ArrowUp } from 'lucide-react';

type TimelineDragHintVars = React.CSSProperties & Record<
    '--timeline-drag-hint-left' | '--timeline-drag-hint-top',
    string
>;

export const Timeline: React.FC = () => {
    const sprites = useEditorUiStore(state => state.sprites);
    const activeSpriteId = useEditorUiStore(state => state.activeSpriteId);
    const activeSprite = useEditorUiStore(selectActiveSprite);
    const setActiveSpriteId = useEditorUiStore(state => state.setActiveSpriteId);
    const duplicateSprite = useEditorUiStore(state => state.duplicateSprite);
    const deleteSprite = useEditorUiStore(state => state.deleteSprite);
    const moveSprite = useEditorUiStore(state => state.moveSprite);
    const moveSprites = useEditorUiStore(state => state.moveSprites);
    const setIsPlaying = useEditorUiStore(state => state.setIsPlaying);
    const duplicateSprites = useEditorUiStore(state => state.duplicateSprites);
    const isPlaying = useEditorUiStore(state => state.isPlaying);
    const isOnionSkinning = useEditorUiStore(state => state.isOnionSkinning);
    const setIsOnionSkinning = useEditorUiStore(state => state.setIsOnionSkinning);
    const fps = useEditorUiStore(state => state.fps);
    const setFps = useEditorUiStore(state => state.setFps);
    const activeLayer = useEditorUiStore(state => state.activeLayer);
    const isOverlayStacked = useEditorUiStore(state => state.isOverlayStacked);
    const palette = useEditorUiStore(state => state.palette);

    const spritesRef = React.useRef(sprites);
    const activeSpriteIdRef = React.useRef(activeSpriteId);
    const timelineRef = React.useRef<HTMLDivElement>(null);
    const timelineContainerRef = React.useRef<HTMLDivElement>(null);
    const autoSelectNextRef = React.useRef(false);

    React.useEffect(() => {
        spritesRef.current = sprites;
        activeSpriteIdRef.current = activeSpriteId;
    }, [sprites, activeSpriteId]);

    const {
        isSelectionMode, setIsSelectionMode,
        selectedSpriteIds, setSelectedSpriteIds,
        isPaintSelecting,
        isFramePointerDown,
        selectionPendingSpriteId,
        touchDragBlocked,
        handleFramePointerDown,
        handleFramePointerUp,
        handleFramePointerEnter,
        cancelLongPress,
        isPointerDownRef,
    } = useTimelineTouch({ sprites, timelineContainerRef, timelineRef, onFrameFocus: setActiveSpriteId });

    // Auto-select newly duplicated frame from the "+" button
    React.useEffect(() => {
        if (autoSelectNextRef.current && sprites.length > 0) {
            autoSelectNextRef.current = false;
            const newSprite = sprites[sprites.length - 1];
            setIsSelectionMode(true);
            setSelectedSpriteIds(prev => {
                const next = new Set(prev);
                next.add(newSprite.id);
                return next;
            });
        }
    }, [sprites, setIsSelectionMode, setSelectedSpriteIds]);

    const [currentBatch, setCurrentBatch] = React.useState(0);

    const getPreviewPixels = React.useCallback((sprite: Sprite): PixelData => {
        if (isOverlayStacked) {
            // While selecting with pointer held, show top-only in stacked mode.
            if (isPaintSelecting || (isSelectionMode && isFramePointerDown)) return sprite.overlayPixelData;
            return getCompositePixelData(sprite);
        }
        return getSpriteLayerPixels(sprite, activeLayer);
    }, [activeLayer, isOverlayStacked, isPaintSelecting, isSelectionMode, isFramePointerDown]);

    const handleFrameMouseDown = React.useCallback((e: React.MouseEvent, index: number, sprite: Sprite) => {
        void e;
        setIsPlaying(false);
        const targetBatch = Math.floor(index / 8);
        setCurrentBatch(prev => {
            if (targetBatch !== prev) return targetBatch;
            return prev;
        });
        if (!isPaintSelecting) {
            setActiveSpriteId(sprite.id);
        }
    }, [setIsPlaying, setActiveSpriteId, isPaintSelecting]);

    const handleFrameClick = React.useCallback(() => {
        // Tap only activates frame (handled by handleFrameMouseDown).
        // Selection is exclusively via long-press paint-select.
    }, []);

    const handleBulkDelete = React.useCallback(() => {
        if (selectedSpriteIds.size === 0) return;

        const idsToDelete = Array.from(selectedSpriteIds);

        idsToDelete.forEach(id => {
            deleteSprite(id);
        });

        setSelectedSpriteIds(new Set());
    }, [selectedSpriteIds, deleteSprite, setSelectedSpriteIds]);

    const handleBulkDuplicate = React.useCallback(() => {
        // Store-side duplication clones the frames directly (inheriting each
        // source's undo history) instead of round-tripping through the JSON
        // import path, and inserts the copies after the last selected frame.
        const newIds = duplicateSprites(Array.from(selectedSpriteIds));

        // Add new duplicates to existing selection; the store already made
        // the first copy the active frame.
        setSelectedSpriteIds(prev => {
            const next = new Set(prev);
            newIds.forEach(id => next.add(id));
            return next;
        });
    }, [selectedSpriteIds, duplicateSprites, setSelectedSpriteIds]);

    const handleAddFrameMouseDown = React.useCallback(() => {
        setIsPlaying(false);
        autoSelectNextRef.current = true;
        duplicateSprite();
    }, [setIsPlaying, duplicateSprite]);

    const BATCH_SIZE = 8;
    const handleTimelineWheel = React.useCallback((e: React.WheelEvent<HTMLDivElement>) => {
        const container = timelineContainerRef.current;
        if (!container) return;

        // Map vertical wheel movement to horizontal timeline scrolling.
        const delta = Math.abs(e.deltaY) > Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
        if (delta !== 0) {
            e.preventDefault();
            container.scrollLeft += delta;
        }
    }, []);

    useTimelineKeyboardShortcuts({
        batchSize: BATCH_SIZE,
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
    });

    const [activeDragId, setActiveDragId] = React.useState<number | null>(null);
    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: {
                distance: 15,
            },
        })
    );

    const [isDragCoolingDown, setIsDragCoolingDown] = React.useState(false);
    const {
        dragHintDirection,
        dragHintPosition,
        handleFrameMouseEnter,
        handleFrameMouseLeave
    } = useTimelineDragHint({
        activeDragId,
        isPaintSelecting,
        isPlaying,
        selectedSpriteIds,
        sprites,
        timelineContainerRef,
        timelineRef
    });

    const handleDragStart = (event: DragStartEvent) => {
        cancelLongPress();

        // Only allow drag if it's a legitimate upward-initiated drag
        if (isPaintSelecting || touchDragBlocked) return;

        if (event.active.id !== undefined) {
            const draggedId = Number(event.active.id);
            setActiveDragId(draggedId);
            setActiveSpriteId(draggedId);
        }
    };

    const handleDragOver = (event: DragOverEvent) => {
        const { over } = event;
        if (over) {
            const overIndex = sprites.findIndex(s => s.id === Number(over.id));
            if (overIndex !== -1) {
                const targetBatch = Math.floor(overIndex / BATCH_SIZE);
                if (targetBatch !== currentBatch) {
                    setCurrentBatch(targetBatch);
                }
            }
        }
    };

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        setActiveDragId(null);
        setIsDragCoolingDown(true);

        setTimeout(() => {
            setIsDragCoolingDown(false);
        }, 500);

        if (over && active.id !== over.id) {
            const activeId = Number(active.id);
            const overId = Number(over.id);
            const oldIndex = sprites.findIndex(s => s.id === activeId);
            const newIndex = sprites.findIndex(s => s.id === overId);

            if (oldIndex !== -1 && newIndex !== -1) {
                if (isSelectionMode && selectedSpriteIds.has(activeId)) {
                    const selectedIndices = sprites
                        .map((s, i) => selectedSpriteIds.has(s.id) ? i : -1)
                        .filter(i => i !== -1);

                    moveSprites(selectedIndices, newIndex, oldIndex);
                } else {
                    moveSprite(oldIndex, newIndex);
                }
            }
        }
    };

    const handleDragCancel = () => {
        setActiveDragId(null);
    };

    React.useEffect(() => {
        if (activeDragId === null) return;
        const preventScroll = (e: TouchEvent) => { e.preventDefault(); };
        document.addEventListener('touchmove', preventScroll, { passive: false, capture: true });
        return () => {
            document.removeEventListener('touchmove', preventScroll, true);
        };
    }, [activeDragId]);

    useTimelineActiveFrameScroll({
        activeDragId,
        activeSpriteId,
        batchSize: BATCH_SIZE,
        currentBatch,
        isDragCoolingDown,
        isPlaying,
        isPointerDownRef,
        setCurrentBatch,
        sprites,
        timelineRef
    });

    return (
        <div ref={timelineRef} className="timeline-section">
            {dragHintPosition && (
                <div
                    className={`timeline-drag-hint ${dragHintDirection === 'left' ? 'is-left' : ''}`}
                    style={{
                        '--timeline-drag-hint-left': `${dragHintPosition.left}px`,
                        '--timeline-drag-hint-top': `${dragHintPosition.top}px`
                    } as TimelineDragHintVars}
                    aria-hidden="true"
                >
                    <ArrowUp size={24} strokeWidth={2.75} />
                </div>
            )}

            <div className="timeline-header">
                <div className="timeline-controls-left">
                    {selectedSpriteIds.size === 0 && (
                        <button
                            className={`control-btn-small ${isPlaying ? 'active' : ''}`}
                            onClick={() => setIsPlaying(!isPlaying)}
                        >
                            {isPlaying ? 'Stop' : 'Play'}
                        </button>
                    )}
                    {!isPlaying && selectedSpriteIds.size === 0 && (
                        <>
                            <button
                                className={`control-btn-small ${isOnionSkinning ? 'active' : ''}`}
                                onClick={() => setIsOnionSkinning(!isOnionSkinning)}
                            >
                                Onion
                            </button>
                            <button
                                className="control-btn-small"
                                onClick={() => {
                                    setIsSelectionMode(true);
                                    setSelectedSpriteIds(new Set([activeSpriteId]));
                                }}
                            >
                                Select
                            </button>
                        </>
                    )}
                    {!isPlaying && selectedSpriteIds.size > 0 && (
                        <>
                            <button
                                className="control-btn-small"
                                onClick={() => {
                                    setSelectedSpriteIds(new Set(sprites.map(s => s.id)));
                                }}
                            >
                                Select All
                            </button>
                            <button
                                className="control-btn-small"
                                onClick={() => {
                                    setSelectedSpriteIds(new Set());
                                    setIsSelectionMode(false);
                                }}
                            >
                                Unselect All
                            </button>
                            <button
                                className="control-btn-small delete-confirm"
                                onClick={handleBulkDelete}
                            >
                                Delete ({selectedSpriteIds.size})
                            </button>
                        </>
                    )}
                </div>
                {!isPlaying && (
                    <div className="file-controls">
                        <ImportExportMenu
                            selectedSpriteIds={selectedSpriteIds}
                            setSelectedSpriteIds={setSelectedSpriteIds}
                            setIsSelectionMode={setIsSelectionMode}
                            hideImport={selectedSpriteIds.size > 0}
                        />
                    </div>
                )}
            </div>

            <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragStart={handleDragStart}
                onDragOver={handleDragOver}
                onDragEnd={handleDragEnd}
                onDragCancel={handleDragCancel}
                autoScroll={{
                    enabled: true,
                    acceleration: 10,
                    interval: 10
                }}
            >
                <div
                    ref={timelineContainerRef}
                    className="timeline-frame-list"
                    onWheel={handleTimelineWheel}
                >
                    <div className="timeline-spacer" />
                    <TimelineFpsControls fps={fps} setFps={setFps} />

                    <SortableContext
                        items={sprites.map(s => s.id)}
                        strategy={horizontalListSortingStrategy}
                        disabled={isPaintSelecting}
                    >
                        {sprites.map((sprite, index) => {
                            const isMultiDrag = activeDragId !== null && selectedSpriteIds.has(activeDragId);

                            return (
                                <React.Fragment key={sprite.id}>
                                    <SortableFrame
                                        id={sprite.id}
                                        index={index}
                                        sprite={sprite}
                                        palette={palette}
                                        previewPixels={getPreviewPixels(sprite)}
                                        isActive={activeDragId === null && sprite.id === activeSpriteId}
                                        dragAccepted={activeDragId !== null}
                                        onMouseDown={handleFrameMouseDown}
                                        onMouseEnter={handleFrameMouseEnter}
                                        onMouseLeave={handleFrameMouseLeave}
                                        onClick={handleFrameClick}
                                        onPointerDown={handleFramePointerDown}
                                        onPointerUp={handleFramePointerUp}
                                        onPointerEnter={handleFramePointerEnter}
                                        isSelected={selectedSpriteIds.has(sprite.id)}
                                        isSelectionPending={selectionPendingSpriteId === sprite.id}
                                        selectionPendingDurationMs={TIMELINE_SELECTION_LONG_PRESS_DELAY_MS}
                                        forceDragging={
                                            !isPaintSelecting && !touchDragBlocked && (
                                                activeDragId === sprite.id ||
                                                (isMultiDrag && selectedSpriteIds.has(sprite.id))
                                            )
                                        }
                                        disabled={isPaintSelecting || touchDragBlocked}
                                    />
                                </React.Fragment>
                            );
                        })}
                    </SortableContext>

                    {/* Add Frame / Mulit-Duplicate Button(s) */}
                    {isSelectionMode && selectedSpriteIds.size > 0 ? (
                        <SelectedFrameGhostStrip
                            sprites={sprites}
                            selectedSpriteIds={selectedSpriteIds}
                            palette={palette}
                            getPreviewPixels={getPreviewPixels}
                            onDuplicate={handleBulkDuplicate}
                        />
                    ) : (
                        activeSprite && sprites.length < 64 && (
                            <div className="timeline-add-frame-wrapper">
                                <TimelineFrame
                                    sprite={activeSprite}
                                    palette={palette}
                                    previewPixels={getPreviewPixels(activeSprite)}
                                    isAdd={true}
                                    index={sprites.length}
                                    isActive={false}
                                    onMouseDown={handleAddFrameMouseDown}
                                />
                            </div>
                        )
                    )}
                    <div className="timeline-spacer" />
                </div>

                <DragOverlay>
                    <TimelineDragOverlayContent
                        activeDragId={activeDragId}
                        sprites={sprites}
                        selectedSpriteIds={selectedSpriteIds}
                        isSelectionMode={isSelectionMode}
                        palette={palette}
                        getPreviewPixels={getPreviewPixels}
                    />
                </DragOverlay>
            </DndContext>
        </div>
    );
};
