import React from 'react';
import { useEditor } from '../../contexts/EditorContext';
import { TimelineFrame } from './TimelineFrame';
import { SortableFrame } from './SortableFrame';
import { GRID_SIZE } from '../../types';
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
        isPlaying,
        setIsPlaying,
        isOnionSkinning,
        setIsOnionSkinning,
        importMultipleFromJSON,
        fps,
        setFps
    } = useEditor();

    // Stable handler for frame clicks to prevent re-renders
    const handleFrameMouseDown = React.useCallback((e: React.MouseEvent, index: number, sprite: any) => {
        setIsPlaying(false);
        const targetBatch = Math.floor(index / 8);
        setCurrentBatch(prev => {
            if (targetBatch !== prev) return targetBatch;
            return prev;
        });
        setActiveSpriteId(sprite.id);
    }, [setIsPlaying, setActiveSpriteId]);

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

        activeSprite.pixelData.forEach((color, i) => {
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
            pixels: activeSprite.pixelData
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
                    return new Promise<{ name: string; pixels: (string | null)[] }>((resolve, reject) => {
                        const reader = new FileReader();
                        reader.onload = (event) => {
                            try {
                                const json = JSON.parse(event.target?.result as string);
                                if (json.pixels) {
                                    resolve({ name: file.name, pixels: json.pixels });
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

    // Keyboard Shortcuts
    React.useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            const activeElement = document.activeElement;
            const isInput = activeElement instanceof HTMLInputElement ||
                activeElement instanceof HTMLTextAreaElement ||
                activeElement?.hasAttribute('contenteditable');

            if (isInput) return;

            if (e.key === ',' || e.key === '<') {
                const currentId = activeSpriteIdRef.current;
                const idx = spritesRef.current.findIndex(s => s.id === currentId);
                if (idx !== -1) {
                    const count = spritesRef.current.length;
                    const prevIdx = (idx - 1 + count) % count;
                    setActiveSpriteId(spritesRef.current[prevIdx].id);
                }
            }
            if (e.key === '.' || e.key === '>') {
                const currentId = activeSpriteIdRef.current;
                const idx = spritesRef.current.findIndex(s => s.id === currentId);
                if (idx !== -1) {
                    const count = spritesRef.current.length;
                    const nextIdx = (idx + 1) % count;
                    setActiveSpriteId(spritesRef.current[nextIdx].id);
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
    }, [setActiveSpriteId, currentBatch]);

    // Auto-scroll to active sprite
    const prevActiveIdRef = React.useRef(activeSpriteId);

    // DND-KIT Setup
    const [activeDragId, setActiveDragId] = React.useState<number | null>(null);
    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: {
                distance: 5, // Requires 5px movement to start drag, prevents accidental drag on click
            },
        })
    );

    const [isDragCoolingDown, setIsDragCoolingDown] = React.useState(false);

    const handleDragStart = (event: DragStartEvent) => {
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
            const oldIndex = sprites.findIndex(s => s.id === Number(active.id));
            const newIndex = sprites.findIndex(s => s.id === Number(over.id));

            if (oldIndex !== -1 && newIndex !== -1) {
                moveSprite(oldIndex, newIndex);
            }
        }
    };

    // Auto-scroll effect
    React.useEffect(() => {
        const container = timelineRef.current?.querySelector('.timeline-frame-list') as HTMLElement;
        if (container && activeDragId === null && !isDragCoolingDown) {
            // activeDragId checks drag, isDragCoolingDown checks pause
            const index = sprites.findIndex(s => s.id === activeSpriteId);
            if (index === -1) return;

            const isSmall = window.innerWidth <= 1024;
            const FRAME_SIZE = isSmall ? 75 : 100;
            const listWidth = container.clientWidth;
            const spacerWidth = (listWidth / 2) - (FRAME_SIZE / 2);
            const targetScroll = (index * FRAME_SIZE) + (FRAME_SIZE / 2) - (listWidth / 2) + spacerWidth;

            container.scrollTo({
                left: targetScroll,
                behavior: isPlaying ? 'auto' : 'smooth'
            });
        }
        prevActiveIdRef.current = activeSpriteId;
    }, [activeSpriteId, isPlaying, sprites.length, activeDragId, isDragCoolingDown]);

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

    // Overlay sprite 
    const activeDragSprite = sprites.find(s => s.id === activeDragId);

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
                            color: pendingDeleteId === activeSpriteId ? 'white' : ''
                        }}
                        disabled={sprites.length <= 1}
                    >
                        {pendingDeleteId === activeSpriteId ? 'Confirm' : 'Delete'}
                    </button>
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
                <div ref={timelineContainerRef} className="timeline-frame-list" style={{ flex: 1, overflowX: 'auto', minWidth: 0 }}>
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
                    >
                        {sprites.map((sprite, index) => {
                            const isInBatch = index >= currentBatch * BATCH_SIZE && index < (currentBatch + 1) * BATCH_SIZE;
                            return (
                                <React.Fragment key={sprite.id}>
                                    <SortableFrame
                                        id={sprite.id}
                                        index={index}
                                        sprite={sprite}
                                        isActive={activeDragId === null && sprite.id === activeSpriteId}
                                        onMouseDown={handleFrameMouseDown}
                                        isDeletePending={pendingDeleteId === sprite.id}
                                        isInBatch={isInBatch}
                                    />
                                </React.Fragment>
                            );
                        })}
                    </SortableContext>

                    {/* Add Frame Button (Outside sortable context) */}
                    {activeSprite && sprites.length < 64 && (
                        <div style={{ display: 'inline-block' }}>
                            <TimelineFrame
                                sprite={activeSprite}
                                isAdd={true}
                                index={sprites.length}
                                isActive={false}
                                onMouseDown={handleAddFrameMouseDown}
                            />
                        </div>
                    )}
                    <div className="timeline-spacer" />
                </div>

                <DragOverlay>
                    {activeDragSprite ? (
                        <div className="timeline-frame-wrapper" style={{ opacity: 0.8 }}>
                            <TimelineFrame
                                sprite={activeDragSprite}
                                index={sprites.findIndex(s => s.id === activeDragSprite.id)}
                                isActive={true}
                                onMouseDown={() => { }}
                            />
                        </div>
                    ) : null}
                </DragOverlay>
            </DndContext>
        </div>
    );
};
