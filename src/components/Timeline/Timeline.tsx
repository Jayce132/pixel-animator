import React from 'react';
import { useEditor } from '../../contexts/EditorContext';
import { TimelineFrame } from './TimelineFrame';

export const Timeline: React.FC = () => {
    const {
        sprites,
        activeSpriteId,
        activeSprite,
        setActiveSpriteId,
        addSprite,
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
        // We need access to currentBatch state, pass updater or check it
        // To keep handler stable we might need ref for currentBatch or use setState form
        // But BATCH_SIZE is 8 const.
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

        // Create 16x16 canvas
        const canvas = document.createElement('canvas');
        canvas.width = 16;
        canvas.height = 16;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        activeSprite.pixelData.forEach((color, i) => {
            if (color) {
                const x = i % 16; // Using hardcoded 16 for clarity or import GRID_SIZE
                const y = Math.floor(i / 16);
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
            width: 16,
            height: 16,
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

        // Convert FileList to array and sort by name to ensure consistent order
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

        // Reset input so same files can be imported again if needed
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const [draggedIndex, _setDraggedIndex] = React.useState<number | null>(null);
    const [isDeletePending, _setIsDeletePending] = React.useState(false);

    // Refs for the global event listener to avoid stale closures
    const draggedIndexRef = React.useRef<number | null>(null);
    const isDeletePendingRef = React.useRef(false);
    const spritesRef = React.useRef(sprites);
    const activeSpriteIdRef = React.useRef(activeSpriteId);
    const ghostRef = React.useRef<HTMLDivElement>(null);
    const timelineRef = React.useRef<HTMLDivElement>(null);

    // Sync refs with state
    React.useEffect(() => {
        spritesRef.current = sprites;
        activeSpriteIdRef.current = activeSpriteId;
    }, [sprites, activeSpriteId]);

    const [currentBatch, setCurrentBatch] = React.useState(0);
    const BATCH_SIZE = 8;

    // Sync active sprite to batch - Optional: Auto-switch batch if selection changes externally
    // But user requested specific manual control, so we might keep it manual for now or auto-follow.
    // Let's stick to manual control + hotkeys as requested.

    // Keyboard Shortcuts: 1-8 to switch frames relative to BATCH
    React.useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            const activeElement = document.activeElement;
            const isInput = activeElement instanceof HTMLInputElement ||
                activeElement instanceof HTMLTextAreaElement ||
                activeElement?.hasAttribute('contenteditable');

            if (isInput) return;

            // Frame Navigation: < (,) and > (.)
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

            // Map keys '1' through '8' relative to batch
            if (/^[1-8]$/.test(e.key)) {
                const localIndex = parseInt(e.key) - 1;
                const globalIndex = (currentBatch * BATCH_SIZE) + localIndex;

                const targetSprite = spritesRef.current[globalIndex];
                if (targetSprite) {
                    setActiveSpriteId(targetSprite.id);
                }
            }

            // Batch Navigation Shortcuts
            if (e.key === '9') {
                setCurrentBatch(prev => {
                    const newBatch = Math.max(0, prev - 1);
                    const firstIdx = newBatch * BATCH_SIZE;
                    if (spritesRef.current[firstIdx]) {
                        setActiveSpriteId(spritesRef.current[firstIdx].id);
                    }
                    return newBatch;
                });
            }
            if (e.key === '0') {
                setCurrentBatch(prev => {
                    const maxBatch = Math.floor((spritesRef.current.length - 1) / BATCH_SIZE);
                    const newBatch = Math.min(prev + 1, maxBatch);
                    // If we are already at max, newBatch == prev, no change
                    if (newBatch !== prev) {
                        const firstIdx = newBatch * BATCH_SIZE;
                        if (spritesRef.current[firstIdx]) {
                            setActiveSpriteId(spritesRef.current[firstIdx].id);
                        }
                    }
                    return newBatch;
                });
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [setActiveSpriteId, currentBatch]); // Re-bind when batch changes

    // Auto-scroll to active sprite
    const prevActiveIdRef = React.useRef(activeSpriteId);

    React.useEffect(() => {
        const container = timelineRef.current?.querySelector('.timeline-frame-list') as HTMLElement;

        if (container) {
            const index = sprites.findIndex(s => s.id === activeSpriteId);
            if (index === -1) return;

            // Mathematical scroll calculation (No layout reflow needed)
            // Use 100 for desktop, 75 for mobile (match index.css)
            const isSmall = window.innerWidth <= 1024;
            const FRAME_SIZE = isSmall ? 75 : 100;

            const listWidth = container.clientWidth;
            // The spacer at the start is 50% - FRAME_SIZE/2
            const spacerWidth = (listWidth / 2) - (FRAME_SIZE / 2);

            // Total distance from start of list: spacers + frames before it
            const targetScroll = (index * FRAME_SIZE) + (FRAME_SIZE / 2) - (listWidth / 2) + spacerWidth;

            // Direct DOM manipulation for maximum speed
            container.scrollTo({
                left: targetScroll,
                behavior: isPlaying ? 'auto' : 'smooth'
            });
        }
        prevActiveIdRef.current = activeSpriteId;
    }, [activeSpriteId, isPlaying, sprites.length]); // sprites.length for add/delete updates

    // Auto-switch batch when new frame is added OR when active frame changes (e.g. playback)
    // This ensures the current batch always matches the active frame
    React.useEffect(() => {
        const index = sprites.findIndex(s => s.id === activeSpriteId);
        if (index !== -1) {
            const batch = Math.floor(index / BATCH_SIZE);
            if (batch !== currentBatch) {
                // If we are playing, the scroll logic handles the view.
                // We just need to update state so opacity is correct.
                setCurrentBatch(batch);
            }
        }
    }, [activeSpriteId, sprites, currentBatch, BATCH_SIZE]);

    // ... (drag handlers restored below)

    const setDraggedIndex = (val: number | null) => {
        draggedIndexRef.current = val;
        _setDraggedIndex(val);
    };

    const setIsDeletePending = (val: boolean) => {
        isDeletePendingRef.current = val;
        _setIsDeletePending(val);
    };

    const handleDragGlobal = (e: DragEvent) => {
        e.preventDefault();
        if (draggedIndexRef.current === null || !timelineRef.current) return;

        if (ghostRef.current && e.clientX !== 0 && e.clientY !== 0) {
            ghostRef.current.style.left = `${e.clientX}px`;
            ghostRef.current.style.top = `${e.clientY}px`;
        }

        const rect = timelineRef.current.getBoundingClientRect();
        const buffer = 20;
        const isOutside = e.clientX < rect.left - buffer || e.clientX > rect.right + buffer ||
            e.clientY < rect.top - buffer || e.clientY > rect.bottom + buffer;

        const shouldDelete = isOutside && spritesRef.current.length > 1;
        if (isDeletePendingRef.current !== shouldDelete) {
            setIsDeletePending(shouldDelete);
        }
    };

    const handleDragStart = (e: React.DragEvent, index: number) => {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', index.toString());

        const img = new Image();
        img.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
        e.dataTransfer.setDragImage(img, 0, 0);

        if (ghostRef.current) {
            ghostRef.current.style.left = `${e.clientX}px`;
            ghostRef.current.style.top = `${e.clientY}px`;
        }

        window.addEventListener('dragover', handleDragGlobal);
        setTimeout(() => setDraggedIndex(index), 0);
    };

    const handleDragEnd = () => {
        window.removeEventListener('dragover', handleDragGlobal);
        if (isDeletePendingRef.current && draggedIndexRef.current !== null) {
            const spriteToDelete = spritesRef.current[draggedIndexRef.current];
            if (spriteToDelete) deleteSprite(spriteToDelete.id);
        }
        setDraggedIndex(null);
        setIsDeletePending(false);
    };

    const handleDragOver = (e: React.DragEvent, overIndex?: number) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        if (ghostRef.current) {
            ghostRef.current.style.left = `${e.clientX}px`;
            ghostRef.current.style.top = `${e.clientY}px`;
        }
        if (draggedIndexRef.current === null) return;
        if (overIndex !== undefined && draggedIndexRef.current !== overIndex) {
            moveSprite(draggedIndexRef.current, overIndex);
            setDraggedIndex(overIndex);
        }
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
    };


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
        // Immediate change
        setFps(prev => Math.max(1, Math.min(60, prev + delta)));

        // Delay before rapid change
        fpsTimeoutRef.current = setTimeout(() => {
            fpsIntervalRef.current = setInterval(() => {
                setFps(prev => Math.max(1, Math.min(60, prev + delta)));
            }, 80); // Fast repeat (80ms)
        }, 400); // Initial delay (400ms)
    }, [setFps]);


    return (
        <div
            ref={timelineRef}
            className="timeline-section"
            onDragOver={(e) => handleDragOver(e)}
            onDrop={handleDrop}
        >
            {/* Ghost ... */}
            {draggedIndex !== null && sprites[draggedIndex] && (
                <div
                    ref={ghostRef}
                    className="drag-ghost"
                    style={{
                        position: 'fixed',
                        pointerEvents: 'none',
                        zIndex: 9999
                    }}
                >
                    <TimelineFrame
                        sprite={sprites[draggedIndex]}
                        index={draggedIndex}
                        isActive={false}
                        isDeletePending={isDeletePending}
                        onMouseDown={() => { }}
                    />
                </div>
            )}
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

            <div className="timeline-frame-list" style={{ flex: 1, overflowX: 'auto', minWidth: 0 }}>
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
                {sprites.map((sprite, index) => {
                    const isInBatch = index >= currentBatch * BATCH_SIZE && index < (currentBatch + 1) * BATCH_SIZE;
                    return (
                        <TimelineFrame
                            key={sprite.id}
                            index={index}
                            sprite={sprite}
                            isActive={sprite.id === activeSpriteId}
                            onMouseDown={handleFrameMouseDown}
                            onDragStart={handleDragStart}
                            onDragEnd={handleDragEnd}
                            onDragOver={handleDragOver}
                            onDrop={handleDrop}
                            isDragging={index === draggedIndex}
                            isDeletePending={index === draggedIndex && isDeletePending}
                            isInBatch={isInBatch}
                        />
                    );
                })}

                {activeSprite && sprites.length < 64 && (
                    <TimelineFrame
                        sprite={activeSprite}
                        isAdd={true}
                        index={sprites.length}
                        isActive={false}
                        onMouseDown={handleAddFrameMouseDown}
                    />
                )}
                <div className="timeline-spacer" />
            </div>
        </div>
    );
};
