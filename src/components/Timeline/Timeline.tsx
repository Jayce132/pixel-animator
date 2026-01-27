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
        importMultipleFromJSON
    } = useEditor();

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
    const ghostRef = React.useRef<HTMLDivElement>(null);
    const timelineRef = React.useRef<HTMLDivElement>(null);

    // Sync refs with state
    React.useEffect(() => {
        spritesRef.current = sprites;
    }, [sprites]);

    // Keyboard Shortcuts: 1-8 to switch frames
    React.useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Check if we're focused on an input/textarea to avoid intercepting typing
            const activeElement = document.activeElement;
            const isInput = activeElement instanceof HTMLInputElement ||
                activeElement instanceof HTMLTextAreaElement ||
                activeElement?.hasAttribute('contenteditable');

            if (isInput) return;

            // Map keys '1' through '8'
            if (/^[1-8]$/.test(e.key)) {
                const index = parseInt(e.key) - 1;
                const targetSprite = spritesRef.current[index];
                if (targetSprite) {
                    setActiveSpriteId(targetSprite.id);
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [setActiveSpriteId]);

    const setDraggedIndex = (val: number | null) => {
        draggedIndexRef.current = val;
        _setDraggedIndex(val);
    };

    const setIsDeletePending = (val: boolean) => {
        isDeletePendingRef.current = val;
        _setIsDeletePending(val);
    };

    const handleDragGlobal = (e: DragEvent) => {
        // Essential: Signal that the window is a valid drop target to prevent 
        // the browser's "snap-back" animation delay for drops outside the timeline.
        e.preventDefault();

        if (draggedIndexRef.current === null || !timelineRef.current) return;

        // Update ghost position (global tracking)
        if (ghostRef.current && e.clientX !== 0 && e.clientY !== 0) {
            ghostRef.current.style.left = `${e.clientX}px`;
            ghostRef.current.style.top = `${e.clientY}px`;
        }

        const rect = timelineRef.current.getBoundingClientRect();
        const buffer = 20;
        const isOutside = e.clientX < rect.left - buffer || e.clientX > rect.right + buffer ||
            e.clientY < rect.top - buffer || e.clientY > rect.bottom + buffer;

        // Only allow delete if more than 1 frame exists
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

        setTimeout(() => {
            setDraggedIndex(index);
        }, 0);
    };

    const handleDragEnd = () => {
        window.removeEventListener('dragover', handleDragGlobal);

        if (isDeletePendingRef.current && draggedIndexRef.current !== null) {
            const spriteToDelete = spritesRef.current[draggedIndexRef.current];
            if (spriteToDelete) {
                deleteSprite(spriteToDelete.id);
            }
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

    return (
        <div
            ref={timelineRef}
            className="timeline-section"
            onDragOver={(e) => handleDragOver(e)}
            onDrop={handleDrop}
        >
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
                        onClick={() => { }}
                    />
                </div>
            )}
            <div className="timeline-header">
                <div className="timeline-controls-left">
                    <span className="timeline-title">TIMELINE</span>
                    <button
                        className={`control-btn-small ${isPlaying ? 'active' : ''}`}
                        onClick={() => setIsPlaying(!isPlaying)}
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

            <div className="timeline-frame-list">
                {sprites.map((sprite, index) => (
                    <TimelineFrame
                        key={sprite.id}
                        index={index}
                        sprite={sprite}
                        isActive={sprite.id === activeSpriteId}
                        onClick={() => setActiveSpriteId(sprite.id)}
                        onDragStart={handleDragStart}
                        onDragEnd={handleDragEnd}
                        onDragOver={handleDragOver}
                        onDrop={handleDrop}
                        isDragging={index === draggedIndex}
                        isDeletePending={index === draggedIndex && isDeletePending}
                    />
                ))}

                {activeSprite && sprites.length < 8 && (
                    <TimelineFrame
                        sprite={activeSprite}
                        isAdd={true}
                        index={sprites.length}
                        isActive={false}
                        onClick={duplicateSprite}
                    />
                )}
            </div>
        </div>
    );
};
