import React from 'react';
import { useEditor } from '../../contexts/EditorContext';
import { TimelineFrame } from './TimelineFrame';
import { SortableFrame } from './SortableFrame';
import { GRID_SIZE, TOTAL_PIXELS } from '../../types';
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

export const Timeline: React.FC = () => {
    const {
        sprites,
        activeSpriteId,
        activeSprite,
        setActiveSpriteId,
        duplicateSprite,
        deleteSprite,
        moveSprite,
        moveSprites,
        isPlaying,
        setIsPlaying,
        isOnionSkinning,
        setIsOnionSkinning,
        importMultipleFromJSON,
        fps,
        setFps,
        activeLayer,
        isOverlayStacked
    } = useEditor();

    const getCompositePixelData = React.useCallback((sprite: { pixelData: (string | null)[]; overlayPixelData: (string | null)[] }) => {
        return sprite.pixelData.map((base, i) => sprite.overlayPixelData[i] ?? base);
    }, []);

    // Selection Mode State
    const [isSelectionMode, setIsSelectionMode] = React.useState(false);
    const [selectedSpriteIds, setSelectedSpriteIds] = React.useState<Set<number>>(new Set());

    // Long Press / Paint Selection State
    const [isPaintSelecting, setIsPaintSelecting] = React.useState(false);
    const [isFramePointerDown, setIsFramePointerDown] = React.useState(false);
    const longPressTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
    const isPointerDownRef = React.useRef(false); // Track if pointer is actually down
    const isPaintSelectingRef = React.useRef(false);
    const dragStartSpriteIdRef = React.useRef<number | null>(null);
    const initialSelectedIdsRef = React.useRef<Set<number>>(new Set());
    const targetSelectionStateRef = React.useRef<boolean>(true); // true = add, false = remove
    const getPreviewPixels = React.useCallback((sprite: { pixelData: (string | null)[]; overlayPixelData: (string | null)[] }) => {
        if (isOverlayStacked) {
            // While selecting with pointer held, show top-only in stacked mode.
            if (isPaintSelecting || (isSelectionMode && isFramePointerDown)) return sprite.overlayPixelData;
            return getCompositePixelData(sprite);
        }
        return activeLayer === 'base' ? sprite.pixelData : sprite.overlayPixelData;
    }, [activeLayer, getCompositePixelData, isOverlayStacked, isPaintSelecting, isSelectionMode, isFramePointerDown]);

    const handleFramePointerDown = React.useCallback((e: React.PointerEvent, _index: number, sprite: any) => {
        isPointerDownRef.current = true;
        setIsFramePointerDown(true);
        const pointerId = e.pointerId;
        const currentTarget = e.currentTarget;

        // Start Long Press Timer
        longPressTimerRef.current = setTimeout(() => {
            if (isPointerDownRef.current) {
                // Long press detected!
                isPaintSelectingRef.current = true;
                setIsPaintSelecting(true);
                setIsSelectionMode(true);

                // CAPTURE START STATE for reversible selection
                dragStartSpriteIdRef.current = sprite.id;
                initialSelectedIdsRef.current = new Set(selectedSpriteIds);
                // Smart Paint: first frame determines mode
                const targetState = !selectedSpriteIds.has(sprite.id);
                targetSelectionStateRef.current = targetState;

                // Provide immediate feedback for the first frame
                setSelectedSpriteIds(prev => {
                    const next = new Set(prev);
                    if (targetState) next.add(sprite.id);
                    else next.delete(sprite.id);
                    return next;
                });

                // HIJACK: Kill any ongoing dnd-kit drag by firing synthetic events.
                // PointerSensor listens for pointerup/pointermove on the document/window.
                const cancelEvent = { bubbles: true, cancelable: true };
                window.dispatchEvent(new PointerEvent('pointerup', cancelEvent));
                window.dispatchEvent(new MouseEvent('mouseup', cancelEvent));
                document.dispatchEvent(new PointerEvent('pointerup', cancelEvent));
                document.dispatchEvent(new MouseEvent('mouseup', cancelEvent));

                // IMPORTANT: Release pointer capture so that onPointerEnter 
                // fires on other frames during the drag.
                if (currentTarget instanceof Element) {
                    try {
                        currentTarget.releasePointerCapture(pointerId);
                    } catch (err) {
                        // Ignore errors if capture was already released
                    }
                }
            }
        }, 500); // 500ms for long press
    }, [selectedSpriteIds]);

    const handleFramePointerUp = React.useCallback((e: React.PointerEvent) => {
        // HIJACK PROTECTION: Ignore synthetic events from our own drag-killing logic
        if (e.nativeEvent && e.nativeEvent.isTrusted === false) return;

        isPointerDownRef.current = false;
        setIsFramePointerDown(false);

        // Clear timer
        if (longPressTimerRef.current) {
            clearTimeout(longPressTimerRef.current);
            longPressTimerRef.current = null;
        }

        // End paint selecting
        if (isPaintSelecting) {
            wasPaintSelectingRef.current = true;
            setIsPaintSelecting(false);
            isPaintSelectingRef.current = false;
            dragStartSpriteIdRef.current = null;
            initialSelectedIdsRef.current = new Set();
            // reset after a tick so click handler sees it
            setTimeout(() => { wasPaintSelectingRef.current = false; }, 100);
        }
    }, [isPaintSelecting]);

    React.useEffect(() => {
        const handleWindowPointerUp = () => {
            isPointerDownRef.current = false;
            setIsFramePointerDown(false);
        };
        window.addEventListener('pointerup', handleWindowPointerUp);
        return () => window.removeEventListener('pointerup', handleWindowPointerUp);
    }, []);

    const handleFramePointerEnter = React.useCallback((_e: React.PointerEvent, _index: number, sprite: any) => {
        if (isPaintSelecting && isPointerDownRef.current) {
            // Paint selection!
            setSelectedSpriteIds(prev => {
                if (prev.has(sprite.id)) return prev;
                const newSet = new Set(prev);
                newSet.add(sprite.id);
                return newSet;
            });
        }
    }, [isPaintSelecting]);

    // HIT-TEST STRATEGY: Global pointermove listener to bypass Pointer Capture issues
    React.useEffect(() => {
        if (!isPaintSelecting) return;

        const handleGlobalPointerMove = (e: PointerEvent) => {
            // Find element at coordinates
            const element = document.elementFromPoint(e.clientX, e.clientY);
            if (!element) return;

            // Find closest selectable frame
            const frame = element.closest('[data-selectable-id]');
            if (frame) {
                const idStr = frame.getAttribute('data-selectable-id');
                if (idStr && dragStartSpriteIdRef.current !== null) {
                    const currentId = parseInt(idStr, 10);
                    const targetSprite = sprites.find(s => s.id === currentId);
                    if (!targetSprite) return;

                    // Calculate range between start and current
                    const startIdx = sprites.findIndex(s => s.id === dragStartSpriteIdRef.current);
                    const endIdx = sprites.indexOf(targetSprite);

                    if (startIdx !== -1 && endIdx !== -1) {
                        const min = Math.min(startIdx, endIdx);
                        const max = Math.max(startIdx, endIdx);
                        const rangeIds = sprites.slice(min, max + 1).map(s => s.id);

                        const nextSelection = new Set(initialSelectedIdsRef.current);

                        if (targetSelectionStateRef.current) {
                            // ADD mode: New = Initial ∪ Range
                            rangeIds.forEach(id => nextSelection.add(id));
                        } else {
                            // REMOVE mode: New = Initial \ Range
                            rangeIds.forEach(id => nextSelection.delete(id));
                        }

                        if (nextSelection.size !== selectedSpriteIds.size ||
                            ![...nextSelection].every(id => selectedSpriteIds.has(id))) {
                            setSelectedSpriteIds(nextSelection);
                        }
                    }
                }
            }
        };

        window.addEventListener('pointermove', handleGlobalPointerMove);
        return () => {
            window.removeEventListener('pointermove', handleGlobalPointerMove);
        };
    }, [isPaintSelecting, sprites]);

    // AUTO-EXIT Selection Mode if selection becomes empty
    React.useEffect(() => {
        if (isSelectionMode && selectedSpriteIds.size === 0) {
            setIsSelectionMode(false);
        }
    }, [isSelectionMode, selectedSpriteIds.size]);

    // Stable handler for frame clicks to prevent re-renders
    const handleFrameMouseDown = React.useCallback((_e: React.MouseEvent, index: number, sprite: any) => {
        // We no longer block mousedown in selection mode.
        // This allows dnd-kit to pick up the drag for moving groups.
        // Toggling still happens on handleFrameClick.

        setIsPlaying(false);
        const targetBatch = Math.floor(index / 8);
        setCurrentBatch(prev => {
            if (targetBatch !== prev) return targetBatch;
            return prev;
        });
        // Only set active if we are NOT finishing a paint selection
        if (!isPaintSelecting) {
            setActiveSpriteId(sprite.id);
        }
    }, [setIsPlaying, setActiveSpriteId, isPaintSelecting]);

    const wasPaintSelectingRef = React.useRef(false);

    const handleFrameClick = React.useCallback((_e: React.MouseEvent, _index: number, sprite: any) => {
        if (wasPaintSelectingRef.current) {
            // Prevent click processing if we just finished a paint selection
            return;
        }

        if (isSelectionMode) {
            // Toggle selection on click
            setSelectedSpriteIds(prev => {
                const newSet = new Set(prev);
                if (newSet.has(sprite.id)) {
                    newSet.delete(sprite.id);
                } else {
                    newSet.add(sprite.id);
                }
                return newSet;
            });
        }
    }, [isSelectionMode]);

    const handleBulkDelete = () => {
        if (selectedSpriteIds.size === 0) return;

        // Convert Set to Array for processing
        const idsToDelete = Array.from(selectedSpriteIds);

        // We'll iterate and delete, but since deleteSprite might change the array causing index shifts if done by index,
        // we should rely on IDs. The context deleteSprite takes an ID.
        // We need to be careful about the active sprite being deleted.

        idsToDelete.forEach(id => {
            deleteSprite(id);
        });

        setSelectedSpriteIds(new Set());
        setPendingDeleteId(null);
    };

    const handleBulkDuplicate = React.useCallback(() => {
        const sortedSelected = sprites
            .filter(s => selectedSpriteIds.has(s.id))
            .sort((a, b) => sprites.indexOf(a) - sprites.indexOf(b));

        if (sortedSelected.length === 0) return;

        const blank = new Array(TOTAL_PIXELS).fill(null);
        const importData = sortedSelected.map(s => ({
            name: `${s.name} (Copy)`,
            pixels: isOverlayStacked
                ? s.pixelData
                : (activeLayer === 'base' ? s.pixelData : blank),
            overlayPixels: isOverlayStacked
                ? s.overlayPixelData
                : (activeLayer === 'top' ? s.overlayPixelData : blank)
        }));

        const newIds = importMultipleFromJSON(importData);
        // Switch selection to new duplicates
        setSelectedSpriteIds(new Set(newIds));

        // Ensure the first of the duplications is the active frame
        if (newIds.length > 0) {
            setActiveSpriteId(newIds[0]);
        }
    }, [selectedSpriteIds, sprites, importMultipleFromJSON, setActiveSpriteId, activeLayer, isOverlayStacked]);

    const handleAddFrameMouseDown = React.useCallback(() => {
        setIsPlaying(false);
        duplicateSprite();
    }, [setIsPlaying, duplicateSprite]);

    const fileInputRef = React.useRef<HTMLInputElement>(null);

    const handleExportPNG = () => {
        if (!activeSprite) return;

        // Create 32x32 canvas (or whatever GRID_SIZE is)
        const canvas = document.createElement('canvas');
        canvas.width = GRID_SIZE;
        canvas.height = GRID_SIZE;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const composite = getCompositePixelData(activeSprite);
        composite.forEach((color, i) => {
            if (color) {
                const x = i % GRID_SIZE;
                const y = Math.floor(i / GRID_SIZE);
                ctx.fillStyle = color;
                ctx.fillRect(x, y, 1, 1);
            }
        });

        // Scale up to 512x512
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = 512;
        tempCanvas.height = 512;
        const tempCtx = tempCanvas.getContext('2d');
        if (!tempCtx) return;

        tempCtx.imageSmoothingEnabled = false;
        tempCtx.drawImage(canvas, 0, 0, 512, 512);

        // Dynamic naming: current position in the list
        const activeIndex = sprites.findIndex(s => s.id === activeSpriteId);
        const link = document.createElement('a');
        link.download = `sprite-${activeIndex + 1}.png`;
        link.href = tempCanvas.toDataURL('image/png');
        link.click();
    };

    const handleExportJSON = () => {
        if (!activeSprite) return;
        const jsonData = {
            width: GRID_SIZE,
            height: GRID_SIZE,
            pixels: activeSprite.pixelData,
            overlayPixels: activeSprite.overlayPixelData
        };
        const jsonString = JSON.stringify(jsonData, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const activeIndex = sprites.findIndex(s => s.id === activeSpriteId);
        const link = document.createElement('a');
        link.download = `sprite-${activeIndex + 1}.json`;
        link.href = url;
        link.click();
        URL.revokeObjectURL(url);
    };

    const handleImportJSON = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const fileList = e.target.files;
        if (!fileList || fileList.length === 0) return;
        const filesArray = Array.from(fileList).sort((a, b) => a.name.localeCompare(b.name));
        try {
            const results = await Promise.all(
                filesArray.map(file => {
                    return new Promise<{ name: string; pixels: (string | null)[]; overlayPixels?: (string | null)[] }>((resolve, reject) => {
                        const reader = new FileReader();
                        reader.onload = (event) => {
                            try {
                                const json = JSON.parse(event.target?.result as string);
                                if (json.pixels) {
                                    resolve({ name: file.name, pixels: json.pixels, overlayPixels: json.overlayPixels });
                                } else {
                                    reject(new Error(`Invalid JSON: ${file.name}`));
                                }
                            } catch (err) {
                                reject(err);
                            }
                        };
                        reader.onerror = () => reject(new Error(`Failed to read ${file.name}`));
                        reader.readAsText(file);
                    });
                })
            );
            importMultipleFromJSON(results);
        } catch (err) {
            console.error('Failed to parse JSON import:', err);
            alert('One or more invalid JSON files');
        }
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const [pendingDeleteId, setPendingDeleteId] = React.useState<number | null>(null);

    // If active frame changes, cancel pending delete to be safe
    React.useEffect(() => {
        setPendingDeleteId(null);
    }, [activeSpriteId]);

    const spritesRef = React.useRef(sprites);
    const activeSpriteIdRef = React.useRef(activeSpriteId);
    const timelineRef = React.useRef<HTMLDivElement>(null);
    const timelineContainerRef = React.useRef<HTMLDivElement>(null);

    // Sync refs with state
    React.useEffect(() => {
        spritesRef.current = sprites;
        activeSpriteIdRef.current = activeSpriteId;
    }, [sprites, activeSpriteId]);

    const [currentBatch, setCurrentBatch] = React.useState(0);
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

    // Keyboard Shortcuts
    React.useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            const activeElement = document.activeElement;
            const isInput = activeElement instanceof HTMLInputElement ||
                activeElement instanceof HTMLTextAreaElement ||
                activeElement?.hasAttribute('contenteditable');

            if (isInput) return;

            // Navigation shortcuts moved to useKeyboardShortcuts
            // if (e.key === ',' || e.key === '<') { ... }
            // if (e.key === '.' || e.key === '>') { ... }
            // Duplicate Shortcuts (Global Context but dependent on Timeline Selection)
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

            // Bulk Delete (Shift+Delete)
            if (isShift && (e.code === 'Delete' || e.code === 'Backspace')) {
                e.preventDefault();
                // If selection exists, bulk delete
                if (selectedSpriteIds.size > 0) {
                    handleBulkDelete();
                } else {
                    // Just delete active (fallback handled by button normally, but shortcut useful)
                    deleteSprite(activeSpriteIdRef.current);
                }
            }

            if (/^[1-8]$/.test(e.key)) {
                const localIndex = parseInt(e.key) - 1;
                const globalIndex = (currentBatch * BATCH_SIZE) + localIndex;
                const targetSprite = spritesRef.current[globalIndex];
                if (targetSprite) setActiveSpriteId(targetSprite.id);
            }
            if (e.key === '9') {
                setCurrentBatch(prev => {
                    const newBatch = Math.max(0, prev - 1);
                    const firstIdx = newBatch * BATCH_SIZE;
                    if (spritesRef.current[firstIdx]) setActiveSpriteId(spritesRef.current[firstIdx].id);
                    return newBatch;
                });
            }
            if (e.key === '0') {
                setCurrentBatch(prev => {
                    const maxBatch = Math.floor((spritesRef.current.length - 1) / BATCH_SIZE);
                    const newBatch = Math.min(prev + 1, maxBatch);
                    if (newBatch !== prev) {
                        const firstIdx = newBatch * BATCH_SIZE;
                        if (spritesRef.current[firstIdx]) setActiveSpriteId(spritesRef.current[firstIdx].id);
                    }
                    return newBatch;
                });
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [setActiveSpriteId, currentBatch, selectedSpriteIds, duplicateSprite, handleBulkDuplicate]);

    // Auto-scroll to active sprite
    const prevActiveIdRef = React.useRef(activeSpriteId);

    // DND-KIT Setup
    const [activeDragId, setActiveDragId] = React.useState<number | null>(null);
    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: {
                distance: 5, // Requires 5px movement to start drag, prevents accidental drag on click
            },
            // Disable sensor if paint selecting
            // But wait, DndContext sensors prop needs to be updated.
            // Actually, we can just return false from a filter or similar?
            // Or just pass `disabled` to SortableContext?
            // Passing disabled to SortableContext disables Sorting, but maybe not the Drag initiating?
            // If we disable SortableContext, the items become non-draggable.
            // Let's try disabling SortableContext first as it's cleaner.
        })
    );

    const [isDragCoolingDown, setIsDragCoolingDown] = React.useState(false);

    const handleDragStart = (event: DragStartEvent) => {
        // Cancel long press timer if drag starts
        if (longPressTimerRef.current) {
            clearTimeout(longPressTimerRef.current);
            longPressTimerRef.current = null;
        }

        // Allow drag in selection mode now
        if (event.active.id !== undefined) {
            setActiveDragId(Number(event.active.id));
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

        // Slight pause before allowing auto-snap back
        setTimeout(() => {
            setIsDragCoolingDown(false);
        }, 500);

        if (over && active.id !== over.id) {
            const activeId = Number(active.id);
            const overId = Number(over.id);
            const oldIndex = sprites.findIndex(s => s.id === activeId);
            const newIndex = sprites.findIndex(s => s.id === overId);

            if (oldIndex !== -1 && newIndex !== -1) {
                // Check if dragging part of selection
                if (isSelectionMode && selectedSpriteIds.has(activeId)) {
                    // Move ALL selected sprites
                    const selectedIndices = sprites
                        .map((s, i) => selectedSpriteIds.has(s.id) ? i : -1)
                        .filter(i => i !== -1);

                    console.log('Moving Sprites:', { selectedIndices, newIndex });
                    moveSprites(selectedIndices, newIndex);
                } else {
                    // Single move
                    moveSprite(oldIndex, newIndex);
                }
            }
        }
    };

    // Auto-scroll effect (filmstrip)
    React.useEffect(() => {
        const container = timelineRef.current?.querySelector('.timeline-frame-list') as HTMLElement;
        if (container && activeDragId === null && !isDragCoolingDown && !isPointerDownRef.current) {
            const index = sprites.findIndex(s => s.id === activeSpriteId);
            if (index === -1) return;

            const isSmall = window.innerWidth <= 1024;
            const FRAME_SIZE = isSmall ? 75 : 100;
            const listWidth = container.clientWidth;
            const spacerWidth = (listWidth / 2) - (FRAME_SIZE / 2);

            // Calculate where the frame is RELATIVE to the container's current scroll
            const frameLeft = (index * FRAME_SIZE) + spacerWidth;
            const scrollLeft = container.scrollLeft;
            const frameOffset = frameLeft - scrollLeft;

            // Buffer: Only scroll if within 2 frames of either edge
            const BUFFER = FRAME_SIZE * 2;
            const isNearLeft = frameOffset < BUFFER;
            const isNearRight = frameOffset > listWidth - BUFFER - FRAME_SIZE;

            if (isPlaying) {
                // ALWAYS CENTER during playback for smooth filmstrip
                const targetScroll = frameLeft - (listWidth / 2) + (FRAME_SIZE / 2);
                container.scrollTo({ left: targetScroll, behavior: 'auto' });
            } else if (isNearLeft || isNearRight) {
                // ENSURE VISIBLE during editing: only hop if near edges
                const targetScroll = frameLeft - (listWidth / 2) + (FRAME_SIZE / 2);
                container.scrollTo({ left: targetScroll, behavior: 'smooth' });
            }
        }
        prevActiveIdRef.current = activeSpriteId;
    }, [activeSpriteId, isPlaying, sprites.length, activeDragId, isDragCoolingDown, isPointerDownRef]);

    React.useEffect(() => {
        // Don't auto-switch batch while dragging or cooling down
        if (activeDragId !== null || isDragCoolingDown) return;

        const index = sprites.findIndex(s => s.id === activeSpriteId);
        if (index !== -1) {
            const batch = Math.floor(index / BATCH_SIZE);
            if (batch !== currentBatch) setCurrentBatch(batch);
        }
    }, [activeSpriteId, sprites, currentBatch, BATCH_SIZE, activeDragId, isDragCoolingDown]);

    // FPS Rapid Adjustment
    const fpsIntervalRef = React.useRef<any>(null);
    const fpsTimeoutRef = React.useRef<any>(null);

    const stopFpsChange = React.useCallback(() => {
        if (fpsIntervalRef.current) {
            clearInterval(fpsIntervalRef.current);
            fpsIntervalRef.current = null;
        }
        if (fpsTimeoutRef.current) {
            clearTimeout(fpsTimeoutRef.current);
            fpsTimeoutRef.current = null;
        }
    }, []);

    const startFpsChange = React.useCallback((delta: number) => {
        setFps(prev => Math.max(1, Math.min(60, prev + delta)));
        fpsTimeoutRef.current = setTimeout(() => {
            fpsIntervalRef.current = setInterval(() => {
                setFps(prev => Math.max(1, Math.min(60, prev + delta)));
            }, 80);
        }, 400);
    }, [setFps]);

    return (
        <div ref={timelineRef} className="timeline-section">
            <div className="timeline-header">
                <div className="timeline-controls-left">
                    <button
                        className={`control-btn-small ${isPlaying ? 'active' : ''}`}
                        onClick={() => setIsPlaying(!isPlaying)}
                        style={{ marginLeft: '12px' }}
                    >
                        {isPlaying ? 'Stop' : 'Play'}
                    </button>
                    <button
                        className={`control-btn-small ${isOnionSkinning ? 'active' : ''}`}
                        onClick={() => setIsOnionSkinning(!isOnionSkinning)}
                    >
                        Onion
                    </button>

                    {/* Selection Controls - Only show 'Done' when in mode */}
                    {isSelectionMode && (
                        <button
                            className={`control-btn-small active`}
                            onClick={() => {
                                setIsSelectionMode(false);
                                setSelectedSpriteIds(new Set()); // Clear on exit
                            }}
                            style={{ marginLeft: '8px' }}
                        >
                            Done
                        </button>
                    )}

                    {isSelectionMode && selectedSpriteIds.size > 0 ? (
                        <button
                            className="control-btn-small delete-confirm"
                            onClick={handleBulkDelete}
                            style={{
                                marginLeft: '8px',
                                backgroundColor: '#ff4444',
                                color: 'white'
                            }}
                        >
                            Delete ({selectedSpriteIds.size})
                        </button>
                    ) : (
                        <button
                            className={`control-btn-small ${pendingDeleteId === activeSpriteId ? 'delete-confirm' : ''}`}
                            onClick={() => {
                                if (sprites.length <= 1) return;
                                if (pendingDeleteId === activeSpriteId) {
                                    deleteSprite(activeSpriteId);
                                    setPendingDeleteId(null);
                                } else {
                                    setPendingDeleteId(activeSpriteId);
                                }
                            }}
                            title="Delete Frame"
                            style={{
                                marginLeft: '8px',
                                backgroundColor: pendingDeleteId === activeSpriteId ? '#ff4444' : '',
                                color: pendingDeleteId === activeSpriteId ? 'white' : '',
                                opacity: isSelectionMode ? 0.3 : 1,
                                pointerEvents: isSelectionMode ? 'none' : 'auto'
                            }}
                            disabled={sprites.length <= 1 || isSelectionMode}
                        >
                            {pendingDeleteId === activeSpriteId ? 'Confirm' : 'Delete'}
                        </button>
                    )}
                </div>
                <div className="file-controls">
                    <button className="secondary-btn-small" onClick={handleExportPNG}>PNG</button>
                    <button className="secondary-btn-small" onClick={handleExportJSON}>JSON</button>
                    <button className="secondary-btn-small" onClick={() => fileInputRef.current?.click()}>Import</button>
                    <input
                        type="file"
                        ref={fileInputRef}
                        style={{ display: 'none' }}
                        accept=".json"
                        multiple
                        onChange={handleImportJSON}
                    />
                </div>
            </div>

            <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragStart={handleDragStart}
                onDragOver={handleDragOver}
                onDragEnd={handleDragEnd}
                autoScroll={{
                    enabled: true,
                    acceleration: 10,  // Smooth acceleration
                    interval: 10       // Update 10ms
                }}
            >
                <div
                    ref={timelineContainerRef}
                    className="timeline-frame-list"
                    onWheel={handleTimelineWheel}
                    style={{ flex: 1, overflowX: 'auto', minWidth: 0 }}
                >
                    <div className="timeline-spacer" />
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '0 8px',
                        color: '#888',
                        fontSize: '0.8rem',
                        gap: '4px',
                        height: '100%'
                    }}>
                        <button
                            className="secondary-btn-small"
                            onMouseDown={() => startFpsChange(-1)}
                            onMouseUp={stopFpsChange}
                            onMouseLeave={stopFpsChange}
                            style={{ padding: '2px 4px', minWidth: '20px' }}
                        >
                            &lt;
                        </button>
                        <span style={{ minWidth: '45px', textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>{fps} FPS</span>
                        <button
                            className="secondary-btn-small"
                            onMouseDown={() => startFpsChange(1)}
                            onMouseUp={stopFpsChange}
                            onMouseLeave={stopFpsChange}
                            style={{ padding: '2px 4px', minWidth: '20px' }}
                        >
                            &gt;
                        </button>
                    </div>

                    <SortableContext
                        items={sprites.map(s => s.id)}
                        strategy={horizontalListSortingStrategy}
                        // Disable sorting/dragging if we are in paint select mode
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
                                        previewPixels={getPreviewPixels(sprite)}
                                        isActive={activeDragId === null && sprite.id === activeSpriteId}
                                        onMouseDown={handleFrameMouseDown}
                                        onClick={handleFrameClick}
                                        onPointerDown={handleFramePointerDown}
                                        onPointerUp={handleFramePointerUp}
                                        onPointerEnter={handleFramePointerEnter}
                                        isDeletePending={pendingDeleteId === sprite.id}
                                        isSelected={selectedSpriteIds.has(sprite.id)}
                                        forceDragging={isMultiDrag && selectedSpriteIds.has(sprite.id)}
                                        disabled={isPaintSelecting}
                                    />
                                </React.Fragment>
                            );
                        })}
                    </SortableContext>

                    {/* Add Frame / Mulit-Duplicate Button(s) */}
                    {isSelectionMode && selectedSpriteIds.size > 0 ? (
                        <div style={{ display: 'inline-flex' }}>
                            {/* Render ghosts of selected sprites */}
                            {(() => {
                                // Sort selected IDs by index to maintain order
                                const selectedSprites = sprites
                                    .filter(s => selectedSpriteIds.has(s.id))
                                    .sort((a, b) => {
                                        const idxA = sprites.indexOf(a);
                                        const idxB = sprites.indexOf(b);
                                        return idxA - idxB;
                                    });

                                return selectedSprites.map((sprite, i) => (
                                    <TimelineFrame
                                        key={`ghost-${sprite.id}`}
                                        sprite={sprite}
                                        previewPixels={getPreviewPixels(sprite)}
                                        isAdd={i === 0} // Only first one has +
                                        index={sprites.length + i} // Virtual index
                                        isActive={false}
                                        isGhost={true}
                                        onMouseDown={i === 0 ? handleBulkDuplicate : () => { }} // Only first one clicks
                                    />
                                ));
                            })()}
                        </div>
                    ) : (
                        activeSprite && sprites.length < 64 && (
                            <div style={{ display: 'inline-block' }}>
                                <TimelineFrame
                                    sprite={activeSprite}
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
                    {activeDragId !== null ? (() => {
                        // Check if dragging part of selection
                        if (isSelectionMode && selectedSpriteIds.has(activeDragId)) {
                            const selectedSprites = sprites
                                .filter(s => selectedSpriteIds.has(s.id))
                                .sort((a, b) => {
                                    const idxA = sprites.indexOf(a);
                                    const idxB = sprites.indexOf(b);
                                    return idxA - idxB;
                                });

                            return (
                                <div style={{ display: 'flex', gap: '4px' }}>
                                    {selectedSprites.map((sprite, i) => (
                                        <TimelineFrame
                                            key={`overlay-${sprite.id}`}
                                            sprite={sprite}
                                            previewPixels={getPreviewPixels(sprite)}
                                            index={i}
                                            isActive={false}
                                            isSelected={true}
                                            onMouseDown={() => { }}
                                            onClick={() => { }}
                                            onPointerDown={() => { }}
                                            onPointerUp={() => { }}
                                            onPointerEnter={() => { }}
                                        />
                                    ))}
                                </div>
                            );
                        }

                        // Single item drag
                        const sprite = sprites.find(s => s.id === activeDragId);
                        if (!sprite) return null;
                        return (
                            <TimelineFrame
                                sprite={sprite}
                                previewPixels={getPreviewPixels(sprite)}
                                index={0} // Index doesn't matter for overlay
                                isActive={true}
                                onMouseDown={() => { }}
                                onClick={() => { }}
                                onPointerDown={() => { }}
                                onPointerUp={() => { }}
                                onPointerEnter={() => { }}
                            />
                        );
                    })() : null}
                </DragOverlay>
            </DndContext>
        </div >
    );
};
