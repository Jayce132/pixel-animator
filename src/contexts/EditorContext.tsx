import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { TOTAL_PIXELS, PRESET_COLORS, GRID_SIZE } from '../types';
import type { Sprite, Tool } from '../types';

interface EditorContextType {
    sprites: Sprite[];
    activeSpriteId: number;
    activeSprite: Sprite | undefined;
    currentColor: string;
    currentTool: Tool;
    isDrawing: boolean;
    recentColors: string[];
    setIsDrawing: (drawing: boolean) => void;
    updatePixel: (pixelIndex: number) => void;
    fill: (pixelIndex: number) => void;
    selectedPixels: Set<number>;
    setSelectedPixels: (pixels: Set<number>) => void;
    addToSelection: (index: number) => void;
    clearSelection: () => void;
    liftSelection: (pixelsOverride?: Set<number>) => void;
    floatingLayer: Map<number, string>;
    flipSelectionHorizontal: () => void;
    flipSelectionVertical: () => void;
    rotateSelectionLeft: () => void;
    rotateSelectionRight: () => void;
    nudgeSelection: (dx: number, dy: number) => void;
    setActiveSpriteId: (id: number) => void;
    setCurrentColor: (color: string) => void;
    setTool: (tool: Tool) => void;
    undo: () => void;
    redo: () => void;
    clearCanvas: () => void;
    addSprite: () => void;
    duplicateSprite: () => void;
    deleteSprite: (id?: number) => void;
    moveSprite: (oldIndex: number, newIndex: number) => void;
    isPlaying: boolean;
    setIsPlaying: (playing: boolean) => void;
    isOnionSkinning: boolean;
    setIsOnionSkinning: (on: boolean) => void;
    importMultipleFromJSON: (files: { name: string; pixels: (string | null)[] }[]) => void;
    stamp: () => void;
    isStamping: boolean;
    fps: number;
    setFps: React.Dispatch<React.SetStateAction<number>>;
    brushSize: 1 | 2;
    setBrushSize: (size: 1 | 2) => void;
    addSelectionBatch: (indices: number[]) => void;
}

const EditorContext = createContext<EditorContextType | undefined>(undefined);

export const EditorProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [sprites, setSprites] = useState<Sprite[]>([
        {
            id: 0,
            name: 'Sprite 0',
            pixelData: new Array(TOTAL_PIXELS).fill(null),
            history: [new Array(TOTAL_PIXELS).fill(null)],
            redoHistory: []
        }
    ]);
    const [activeSpriteId, setActiveSpriteId] = useState<number>(0);
    const [currentColor, setCurrentColor] = useState<string>(PRESET_COLORS[0]);
    const [currentTool, setTool] = useState<Tool>('brush');
    const [isDrawingState, setIsDrawingState] = useState(false);
    const [recentColors, setRecentColors] = useState<string[]>([]);
    const [selectedPixels, setSelectedPixelsState] = useState<Set<number>>(new Set());
    const [floatingLayerState, setFloatingLayerState] = useState<Map<number, string>>(new Map());
    const [isPlaying, setIsPlaying] = useState(false);
    const [isOnionSkinning, setIsOnionSkinning] = useState(false);
    const [isStamping, setIsStamping] = useState(false);
    const [fps, setFps] = useState(8);
    const [brushSize, setBrushSize] = useState<1 | 2>(2);

    // Helper to save history
    const saveHistory = useCallback((currentSprites: Sprite[], spriteId: number) => {
        return currentSprites.map(s => {
            if (s.id === spriteId) {
                const newHistory = [...s.history];
                if (newHistory.length > 20) newHistory.shift();
                newHistory.push([...s.pixelData]); // Save COPY of pixelData

                return {
                    ...s,
                    history: newHistory,
                    redoHistory: [] // Clear redo on new action
                };
            }
            return s;
        });
    }, []);

    const setSelectedPixels = useCallback((pixels: Set<number>) => {
        setSelectedPixelsState(pixels);
    }, []);

    const addToSelection = useCallback((index: number) => {
        setSelectedPixelsState(prev => {
            const newSet = new Set(prev);
            newSet.add(index);
            return newSet;
        });
    }, []);

    const addSelectionBatch = useCallback((indices: number[]) => {
        setSelectedPixelsState(prev => {
            const newSet = new Set(prev);
            let changed = false;
            indices.forEach(idx => {
                if (!newSet.has(idx)) {
                    newSet.add(idx);
                    changed = true;
                }
            });
            return changed ? newSet : prev;
        });
    }, []);

    const stamp = useCallback(() => {
        if (floatingLayerState.size > 0) {
            // Trigger Animation
            setIsStamping(true);
            setTimeout(() => setIsStamping(false), 200);

            // Stamp to background (commit COPY)
            setSprites(prevSprites => {
                const nextSprites = prevSprites.map(sprite => {
                    if (sprite.id !== activeSpriteId) return sprite;
                    const newPixelData = [...sprite.pixelData];
                    floatingLayerState.forEach((color, idx) => {
                        newPixelData[idx] = color;
                    });
                    return { ...sprite, pixelData: newPixelData };
                });
                return saveHistory(nextSprites, activeSpriteId);
            });
            // DO NOT Clear floating layer (Stay floating)
        }
    }, [floatingLayerState, activeSpriteId, saveHistory]);

    const clearSelection = useCallback(() => {
        // Commits current floating layer and clears selection
        if (floatingLayerState.size > 0) {
            setSprites(prevSprites => {
                const nextSprites = prevSprites.map(sprite => {
                    if (sprite.id !== activeSpriteId) return sprite;
                    const newPixelData = [...sprite.pixelData];
                    floatingLayerState.forEach((color, idx) => {
                        newPixelData[idx] = color;
                    });
                    return { ...sprite, pixelData: newPixelData };
                });
                return saveHistory(nextSprites, activeSpriteId);
            });
            setFloatingLayerState(new Map());
        }
        setSelectedPixelsState(new Set());
    }, [floatingLayerState, activeSpriteId, saveHistory]);

    const liftSelection = useCallback((pixelsOverride?: Set<number>) => {
        const pixelsToLift = pixelsOverride || selectedPixels;

        setSprites(prevSprites => {
            const nextSprites = prevSprites.map(sprite => {
                if (sprite.id !== activeSpriteId) return sprite;

                const newPixelData = [...sprite.pixelData];
                const newFloatingLayer = new Map<number, string>();

                pixelsToLift.forEach(idx => {
                    if (sprite.pixelData[idx]) {
                        newFloatingLayer.set(idx, sprite.pixelData[idx]);
                        newPixelData[idx] = null; // Clear from canvas
                    }
                });

                setFloatingLayerState(newFloatingLayer);
                return { ...sprite, pixelData: newPixelData };
            });
            return saveHistory(nextSprites, activeSpriteId);
        });
    }, [activeSpriteId, selectedPixels, saveHistory]);

    const flipSelectionHorizontal = useCallback(() => {
        if (floatingLayerState.size === 0 && selectedPixels.size > 0) return;

        setFloatingLayerState(prev => {
            const newLayer = new Map();
            let minX = GRID_SIZE, maxX = -1;
            selectedPixels.forEach(idx => {
                const x = idx % GRID_SIZE;
                minX = Math.min(minX, x);
                maxX = Math.max(maxX, x);
            });

            const newSelection = new Set<number>();
            selectedPixels.forEach(idx => {
                const x = idx % GRID_SIZE;
                const y = Math.floor(idx / GRID_SIZE);
                const flippedX = minX + (maxX - x);
                const flippedIdx = y * GRID_SIZE + flippedX;

                newSelection.add(flippedIdx);
                if (prev.has(idx)) {
                    newLayer.set(flippedIdx, prev.get(idx)!);
                }
            });
            setSelectedPixelsState(newSelection);
            return newLayer;
        });
    }, [floatingLayerState, selectedPixels]);

    const flipSelectionVertical = useCallback(() => {
        if (floatingLayerState.size === 0 && selectedPixels.size > 0) return;

        setFloatingLayerState(prev => {
            const newLayer = new Map();
            let minY = GRID_SIZE, maxY = -1;
            selectedPixels.forEach(idx => {
                const y = Math.floor(idx / GRID_SIZE);
                minY = Math.min(minY, y);
                maxY = Math.max(maxY, y);
            });

            const newSelection = new Set<number>();
            selectedPixels.forEach(idx => {
                const x = idx % GRID_SIZE;
                const y = Math.floor(idx / GRID_SIZE);
                const flippedY = minY + (maxY - y);
                const flippedIdx = flippedY * GRID_SIZE + x;

                newSelection.add(flippedIdx);
                if (prev.has(idx)) {
                    newLayer.set(flippedIdx, prev.get(idx)!);
                }
            });
            setSelectedPixelsState(newSelection);
            return newLayer;
        });
    }, [floatingLayerState, selectedPixels]);

    const rotateSelectionLeft = useCallback(() => {
        if (floatingLayerState.size === 0 && selectedPixels.size > 0) return;

        setFloatingLayerState(prev => {
            const newLayer = new Map();
            let minX = GRID_SIZE, maxX = -1;
            let minY = GRID_SIZE, maxY = -1;

            selectedPixels.forEach(idx => {
                const x = idx % GRID_SIZE;
                const y = Math.floor(idx / GRID_SIZE);
                minX = Math.min(minX, x);
                maxX = Math.max(maxX, x);
                minY = Math.min(minY, y);
                maxY = Math.max(maxY, y);
            });

            const width = maxX - minX + 1;
            const height = maxY - minY + 1;
            const newSelection = new Set<number>();

            selectedPixels.forEach(idx => {
                const x = idx % GRID_SIZE;
                const y = Math.floor(idx / GRID_SIZE);
                const relX = x - minX;
                const relY = y - minY;
                // 90 CCW: (x, y) -> (y, w - 1 - x)
                const newRelX = relY;
                const newRelY = width - 1 - relX;

                if (newRelX < height && newRelY < width) {
                    const newX = minX + newRelX;
                    const newY = minY + newRelY;
                    if (newX >= 0 && newX < GRID_SIZE && newY >= 0 && newY < GRID_SIZE) {
                        const newIdx = newY * GRID_SIZE + newX;
                        newSelection.add(newIdx);
                        if (prev.has(idx)) {
                            newLayer.set(newIdx, prev.get(idx)!);
                        }
                    }
                }
            });

            setSelectedPixelsState(newSelection);
            return newLayer;
        });
    }, [floatingLayerState, selectedPixels]);

    const rotateSelectionRight = useCallback(() => {
        if (floatingLayerState.size === 0 && selectedPixels.size > 0) return;

        setFloatingLayerState(prev => {
            const newLayer = new Map();
            let minX = GRID_SIZE, maxX = -1;
            let minY = GRID_SIZE, maxY = -1;

            selectedPixels.forEach(idx => {
                const x = idx % GRID_SIZE;
                const y = Math.floor(idx / GRID_SIZE);
                minX = Math.min(minX, x);
                maxX = Math.max(maxX, x);
                minY = Math.min(minY, y);
                maxY = Math.max(maxY, y);
            });

            const width = maxX - minX + 1;
            const height = maxY - minY + 1;
            const newSelection = new Set<number>();

            selectedPixels.forEach(idx => {
                const x = idx % GRID_SIZE;
                const y = Math.floor(idx / GRID_SIZE);
                const relX = x - minX;
                const relY = y - minY;
                // 90 CW: (x, y) -> (h - 1 - y, x)
                const newRelX = height - 1 - relY;
                const newRelY = relX;

                if (newRelX < height && newRelY < width) {
                    const newX = minX + newRelX;
                    const newY = minY + newRelY;
                    if (newX >= 0 && newX < GRID_SIZE && newY >= 0 && newY < GRID_SIZE) {
                        const newIdx = newY * GRID_SIZE + newX;
                        newSelection.add(newIdx);
                        if (prev.has(idx)) {
                            newLayer.set(newIdx, prev.get(idx)!);
                        }
                    }
                }
            });
            setSelectedPixelsState(newSelection);
            return newLayer;
        });
    }, [floatingLayerState, selectedPixels]);

    const nudgeSelection = useCallback((dx: number, dy: number) => {
        if (floatingLayerState.size === 0 && selectedPixels.size > 0) return;

        // 1. Boundary Check
        let isValidMove = true;
        selectedPixels.forEach(idx => {
            const x = idx % GRID_SIZE;
            const y = Math.floor(idx / GRID_SIZE);
            const newX = x + dx;
            const newY = y + dy;
            if (newX < 0 || newX >= GRID_SIZE || newY < 0 || newY >= GRID_SIZE) {
                isValidMove = false;
            }
        });
        if (!isValidMove) return;

        // 2. Move Floating Layer
        setFloatingLayerState(prev => {
            const newLayer = new Map();
            const newSelection = new Set<number>();

            selectedPixels.forEach(idx => {
                const x = idx % GRID_SIZE;
                const y = Math.floor(idx / GRID_SIZE);
                const newX = x + dx;
                const newY = y + dy;
                const newIdx = newY * GRID_SIZE + newX;

                newSelection.add(newIdx);
                if (prev.has(idx)) {
                    newLayer.set(newIdx, prev.get(idx)!);
                }
            });

            setSelectedPixelsState(newSelection);
            return newLayer;
        });
    }, [floatingLayerState, selectedPixels]);



    const setIsDrawing = (drawing: boolean) => {
        setIsDrawingState(drawing);
    };

    // Use a ref to track transition of isDrawing from true -> false to save history
    const wasDrawingRef = useRef(false);

    useEffect(() => {
        if (wasDrawingRef.current && !isDrawingState) {
            // Did just stop drawing
            setSprites(prevSprites => saveHistory(prevSprites, activeSpriteId));
        }
        wasDrawingRef.current = isDrawingState;
    }, [isDrawingState, activeSpriteId, saveHistory]);

    const undo = useCallback(() => {
        setSprites(prevSprites => prevSprites.map(s => {
            if (s.id === activeSpriteId) {
                if (s.history.length <= 1) return s;

                const newHistory = [...s.history];
                const currentState = newHistory.pop(); // Pop current
                const previousState = newHistory[newHistory.length - 1]; // Peek previous

                if (!currentState || !previousState) return s;

                return {
                    ...s,
                    pixelData: [...previousState],
                    history: newHistory,
                    redoHistory: [...s.redoHistory, currentState]
                };
            }
            return s;
        }));
    }, [activeSpriteId]);

    const redo = useCallback(() => {
        setSprites(prevSprites => prevSprites.map(s => {
            if (s.id === activeSpriteId) {
                if (s.redoHistory.length === 0) return s;

                const newRedoHistory = [...s.redoHistory];
                const nextState = newRedoHistory.pop();

                if (!nextState) return s;

                const newHistory = [...s.history, nextState];

                return {
                    ...s,
                    pixelData: [...nextState],
                    history: newHistory,
                    redoHistory: newRedoHistory
                };
            }
            return s;
        }));
    }, [activeSpriteId]);

    const activeSprite = sprites.find(s => s.id === activeSpriteId);

    const fill = useCallback((startIndex: number) => {
        // Floating Layer Fill
        if (selectedPixels.has(startIndex)) {
            const targetColor = floatingLayerState.get(startIndex) || null; // Handle transparency within selection
            const replacementColor = currentColor;

            if (targetColor === replacementColor) return;

            setFloatingLayerState(prev => {
                const newLayer = new Map(prev);
                const queue = [startIndex];
                const visited = new Set<number>();

                while (queue.length > 0) {
                    const currentIndex = queue.shift()!;
                    if (visited.has(currentIndex)) continue;
                    visited.add(currentIndex);

                    if (!selectedPixels.has(currentIndex)) continue;

                    const currentColorAtIdx = newLayer.get(currentIndex) || null;
                    if (currentColorAtIdx === targetColor) {
                        if (replacementColor) {
                            newLayer.set(currentIndex, replacementColor);
                        } else {
                            newLayer.delete(currentIndex);
                        }

                        const x = currentIndex % GRID_SIZE;
                        const y = Math.floor(currentIndex / GRID_SIZE);
                        if (y > 0) queue.push(currentIndex - GRID_SIZE);
                        if (y < GRID_SIZE - 1) queue.push(currentIndex + GRID_SIZE);
                        if (x > 0) queue.push(currentIndex - 1);
                        if (x < GRID_SIZE - 1) queue.push(currentIndex + 1);
                    }
                }
                return newLayer;
            });
            setTool('brush');
            return;
        }

        // Standard Sprite Fill
        setSprites(prevSprites => {
            const nextSprites = prevSprites.map(sprite => {
                if (sprite.id !== activeSpriteId) return sprite;

                const targetColor = sprite.pixelData[startIndex];
                const replacementColor = currentColor; // Fill with current color

                if (targetColor === replacementColor) return sprite;

                const newPixelData = [...sprite.pixelData];
                const queue = [startIndex];
                const visited = new Set<number>();

                while (queue.length > 0) {
                    const currentIndex = queue.shift()!;
                    if (visited.has(currentIndex)) continue;
                    visited.add(currentIndex);

                    // Masking Check for Fill: Don't fill INTO the selection if we are outside
                    if (selectedPixels.size > 0 && selectedPixels.has(currentIndex)) {
                        continue;
                    }

                    const x = currentIndex % GRID_SIZE;
                    const y = Math.floor(currentIndex / GRID_SIZE);

                    if (newPixelData[currentIndex] === targetColor) {
                        newPixelData[currentIndex] = replacementColor;

                        // Check neighbors
                        if (y > 0) queue.push(currentIndex - GRID_SIZE); // Up
                        if (y < GRID_SIZE - 1) queue.push(currentIndex + GRID_SIZE); // Down
                        if (x > 0) queue.push(currentIndex - 1); // Left
                        if (x < GRID_SIZE - 1) queue.push(currentIndex + 1); // Right
                    }
                }

                return { ...sprite, pixelData: newPixelData };
            });

            // Save history explicitly after fill
            const spritesWithHistory = saveHistory(nextSprites, activeSpriteId);
            return spritesWithHistory;
        });

        // Legacy behavior: switch back to brush after fill
        setTool('brush');
    }, [activeSpriteId, currentColor, saveHistory, selectedPixels, floatingLayerState]);

    const updatePixel = useCallback((pixelIndex: number) => {
        const targetColor = currentTool === 'eraser' ? null : currentColor;

        // Calculate pixels based on brush size
        const pixelsToUpdate: number[] = [];
        const x = pixelIndex % GRID_SIZE;
        const y = Math.floor(pixelIndex / GRID_SIZE);

        pixelsToUpdate.push(pixelIndex);

        if (brushSize === 2) {
            // 2x2 brush: Pixel + Right + Bottom + BottomRight
            if (x + 1 < GRID_SIZE) pixelsToUpdate.push(pixelIndex + 1);
            if (y + 1 < GRID_SIZE) pixelsToUpdate.push(pixelIndex + GRID_SIZE);
            if (x + 1 < GRID_SIZE && y + 1 < GRID_SIZE) pixelsToUpdate.push(pixelIndex + GRID_SIZE + 1);
        }

        // Helper to update a map (for floating layer)
        const updateMap = (prev: Map<number, string>) => {
            const newLayer = new Map(prev);
            pixelsToUpdate.forEach(idx => {
                if (selectedPixels.size > 0 && !selectedPixels.has(idx)) return; // Mask check for floating layer? 
                // Actually floating layer masking is strict: only pixels IN selection are floating.
                // So we only update if idx is in selection.
                if (selectedPixels.has(idx)) {
                    if (targetColor === null) {
                        newLayer.delete(idx);
                    } else {
                        newLayer.set(idx, targetColor);
                    }
                }
            });
            return newLayer;
        };

        // If ANY of the target pixels are in selection, we treat this as a potentially mixed operation
        // But simplifying: update floating layer if we are interacting with selection
        const hitsSelection = pixelsToUpdate.some(idx => selectedPixels.has(idx));

        if (hitsSelection) {
            setFloatingLayerState(prev => updateMap(prev));
            // We might also need to update base sprite for pixels NOT in selection if we allow cross-boundary painting
            // But usually selection acts as a mask. 
            // Let's assume if you are painting "in selection", you are masked TO selection.
            return;
        }

        // Otherwise update active sprite (respecting mask)
        setSprites(prevSprites => prevSprites.map(sprite => {
            if (sprite.id === activeSpriteId) {
                // If selection exists but we didn't hit it (controlled by hitsSelection), we are outside.
                // If selection exists, we should NOT paint outside? 
                // Editor.tsx controls "dragOrigin" to prevent crossing boundaries during a stroke.
                // Here we just apply to whatever is valid.

                // However, we must not paint INSIDE the selection on the base layer if it's floating.
                // But hitsSelection check handles that (moves to floating layer).

                // So here we only paint pixels that are NOT in selection.

                const newPixelData = [...sprite.pixelData];
                let changed = false;

                pixelsToUpdate.forEach(idx => {
                    // Safety check for array bounds (though x/y checks should handle it)
                    if (idx >= 0 && idx < TOTAL_PIXELS) {
                        // Don't overwrite if masked by selection (logic above handles 'hitsSelection', so here we know we are targeting outside?)
                        // Actually, with a 2x2 brush, some pixels might be in, some out.
                        // The 'hitsSelection' logic above effectively captures the whole stroke if ANY part touches?! 
                        // No, that's buggy. We should split.

                        // Correct logic:
                        // 1. Pixels IN selection update floating layer.
                        // 2. Pixels OUT selection update base layer (unless masked by tool behavior).

                        // For simplicity in this step, let's assume strict masking:
                        // If selection exists, you can ONLY paint inside it.
                        if (selectedPixels.size > 0 && !selectedPixels.has(idx)) return;

                        if (newPixelData[idx] !== targetColor) {
                            newPixelData[idx] = targetColor;
                            changed = true;
                        }
                    }
                });

                if (!changed) return sprite;
                return { ...sprite, pixelData: newPixelData };
            }
            return sprite;
        }));
    }, [activeSpriteId, currentTool, currentColor, selectedPixels, brushSize]);

    const addSprite = useCallback(() => {
        setSprites(prev => {
            if (prev.length >= 64) {
                alert('Frame limit reached (64)');
                return prev;
            }
            const newId = prev.length > 0 ? Math.max(...prev.map(s => s.id)) + 1 : 0;
            const newSprite: Sprite = {
                id: newId,
                name: `Sprite ${newId}`,
                pixelData: new Array(TOTAL_PIXELS).fill(null),
                history: [new Array(TOTAL_PIXELS).fill(null)],
                redoHistory: []
            };
            setActiveSpriteId(newId);
            return [...prev, newSprite];
        });
    }, [setActiveSpriteId]);

    const duplicateSprite = useCallback(() => {
        setSprites(prev => {
            if (prev.length >= 64) {
                alert('Frame limit reached (64)');
                return prev;
            }
            const activeIndex = prev.findIndex(s => s.id === activeSpriteId);
            if (activeIndex === -1) return prev;

            const sourceSprite = prev[activeIndex];
            const newId = Math.max(...prev.map(s => s.id)) + 1;

            const newSprite: Sprite = {
                ...sourceSprite,
                id: newId,
                name: `${sourceSprite.name} (Copy)`,
                pixelData: [...sourceSprite.pixelData], // Deep copy pixel data
                // History? Typically we start fresh or copy. Let's start fresh to save memory.
                history: [[...sourceSprite.pixelData]],
                redoHistory: []
            };

            const newSprites = [...prev, newSprite]; // Always append to end
            setActiveSpriteId(newId);
            return newSprites;
        });
    }, [activeSpriteId, setActiveSpriteId]);

    const deleteSprite = useCallback((idToDelete?: number) => {
        setSprites(prev => {
            if (prev.length <= 1) return prev; // Cannot delete last sprite

            const targetId = idToDelete ?? activeSpriteId;
            const targetIndex = prev.findIndex(s => s.id === targetId);
            if (targetIndex === -1) return prev;

            const newSprites = prev.filter(s => s.id !== targetId);

            // If we deleted the active sprite, we need to pick a new one
            if (targetId === activeSpriteId) {
                let newActiveId = prev[0].id;
                if (targetIndex > 0) {
                    newActiveId = prev[targetIndex - 1].id;
                } else if (newSprites.length > 0) {
                    newActiveId = newSprites[0].id;
                }
                setActiveSpriteId(newActiveId);
            }

            return newSprites;
        });
    }, [activeSpriteId, setActiveSpriteId]);

    const moveSprite = useCallback((oldIndex: number, newIndex: number) => {
        setSprites(prev => {
            const newSprites = [...prev];
            const [movedSprite] = newSprites.splice(oldIndex, 1);
            newSprites.splice(newIndex, 0, movedSprite);
            return newSprites;
        });
    }, []);

    // Animation Playback
    // Animation Playback with RAF
    const lastFrameTimeRef = useRef<number>(0);
    const requestRef = useRef<number | undefined>(undefined);

    const animate = useCallback((time: number) => {
        if (!lastFrameTimeRef.current) lastFrameTimeRef.current = time;
        const deltaTime = time - lastFrameTimeRef.current;
        const targetInterval = 1000 / fps;

        if (deltaTime >= targetInterval) {
            setActiveSpriteId(prevActiveId => {
                const currentIndex = sprites.findIndex(s => s.id === prevActiveId);
                if (currentIndex === -1) return sprites[0].id;
                const nextIndex = (currentIndex + 1) % sprites.length;
                return sprites[nextIndex].id;
            });
            // Adjust for drift, keeping remainder
            lastFrameTimeRef.current = time - (deltaTime % targetInterval);
        }
        requestRef.current = requestAnimationFrame(animate);
    }, [fps, sprites]);

    useEffect(() => {
        if (isPlaying && sprites.length > 1) {
            lastFrameTimeRef.current = 0;
            requestRef.current = requestAnimationFrame(animate);
        } else {
            if (requestRef.current) cancelAnimationFrame(requestRef.current);
        }
        return () => {
            if (requestRef.current) cancelAnimationFrame(requestRef.current);
        };
    }, [isPlaying, animate, sprites.length]);

    const handleSetCurrentColor = useCallback((color: string) => {
        setCurrentColor(color);

        // Legacy behavior: Don't switch tool if we are using fill
        if (currentTool !== 'fill') {
            setTool('brush');
        }

        setRecentColors(prev => {
            if (prev.includes(color)) return prev;
            return [color, ...prev].slice(0, 7);
        });
    }, [currentTool]);

    const isSpriteBlank = (pixels: (string | null)[]) => {
        return pixels.every(p => p === null);
    };

    const importMultipleFromJSON = useCallback((files: { name: string; pixels: (string | null)[] }[]) => {
        let nextSprites = [...sprites];
        let currentActiveId = activeSpriteId;

        let reachedLimit = false;

        files.forEach((file, index) => {
            if (nextSprites.length >= 64) {
                reachedLimit = true;
                return;
            }

            const activeIndex = nextSprites.findIndex(s => s.id === currentActiveId);
            const activeSprite = nextSprites[activeIndex];

            if (index === 0 && activeSprite && isSpriteBlank(activeSprite.pixelData)) {
                // REPLACE: ONLY if first file AND current active frame is blank
                nextSprites[activeIndex] = {
                    ...activeSprite,
                    pixelData: [...file.pixels],
                    redoHistory: []
                };
                // Make this replacement undoable immediately
                nextSprites = saveHistory(nextSprites, activeSprite.id);
            } else {
                // ADD NEW: For subsequent files or if current wasn't blank
                const newId = Math.max(...nextSprites.map(s => s.id), -1) + 1;
                const newSprite: Sprite = {
                    id: newId,
                    name: `Sprite ${nextSprites.length}`,
                    pixelData: [...file.pixels],
                    history: [[...file.pixels]],
                    redoHistory: []
                };
                // Always append to the end
                nextSprites.push(newSprite);
                currentActiveId = newId;
            }
        });

        if (reachedLimit) {
            alert('Frame limit reached (64). Some files were not imported.');
        }

        setSprites(nextSprites);
        setActiveSpriteId(currentActiveId);
    }, [activeSpriteId, saveHistory, setActiveSpriteId, sprites]);

    const clearCanvas = useCallback(() => {
        // Update pixel data AND save history immediately (atomic action)
        setSprites(prevSprites => {
            const updated = prevSprites.map(s => {
                if (s.id === activeSpriteId) {
                    return { ...s, pixelData: new Array(TOTAL_PIXELS).fill(null) };
                }
                return s;
            });
            // Save history for this atomic action
            return saveHistory(updated, activeSpriteId);
        });
    }, [activeSpriteId, saveHistory]);

    return (
        <EditorContext.Provider
            value={{
                sprites,
                activeSpriteId,
                activeSprite,
                currentColor,
                currentTool,
                isDrawing: isDrawingState,
                recentColors,
                setIsDrawing,
                updatePixel,
                fill,
                setActiveSpriteId,
                setCurrentColor: handleSetCurrentColor,
                setTool,
                undo,
                redo,
                clearCanvas,
                addSprite,
                duplicateSprite,
                deleteSprite,
                moveSprite,
                selectedPixels,
                setSelectedPixels,
                addToSelection,
                clearSelection,
                liftSelection,
                floatingLayer: floatingLayerState,
                flipSelectionHorizontal,
                flipSelectionVertical,
                rotateSelectionLeft,
                rotateSelectionRight,
                nudgeSelection,
                isPlaying,
                setIsPlaying,
                isOnionSkinning,
                setIsOnionSkinning,
                importMultipleFromJSON,
                stamp,
                isStamping,
                fps,
                setFps,
                brushSize,
                setBrushSize,
                addSelectionBatch
            }}
        >
            {children}
        </EditorContext.Provider>
    );
};

export const useEditor = () => {
    const context = useContext(EditorContext);
    if (!context) {
        throw new Error('useEditor must be used within an EditorProvider');
    }
    return context;
};
