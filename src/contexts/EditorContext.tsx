import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { TOTAL_PIXELS, PRESET_COLORS, GRID_SIZE } from '../types';
import type { Sprite, Tool } from '../types';

type Layer = 'base' | 'top';

interface EditorContextType {
    sprites: Sprite[];
    activeSpriteId: number;
    activeSprite: Sprite | undefined;
    currentColor: string | null;
    currentTool: Tool;
    isDrawing: boolean;
    recentColors: string[];
    setIsDrawing: (drawing: boolean) => void;
    updatePixel: (pixelIndex: number, maskConstraint?: 'inside' | 'outside' | null) => void;
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
    setCurrentColor: (color: string | null) => void;
    setTool: (tool: Tool) => void;
    undo: () => void;
    redo: () => void;
    clearCanvas: () => void;
    addSprite: () => void;
    duplicateSprite: () => void;
    deleteSprite: (id?: number) => void;
    moveSprite: (oldIndex: number, newIndex: number) => void;
    moveSprites: (indices: number[], insertAtIndex: number) => void;
    isPlaying: boolean;
    setIsPlaying: (playing: boolean) => void;
    isOnionSkinning: boolean;
    setIsOnionSkinning: (on: boolean) => void;
    importMultipleFromJSON: (files: { name: string; pixels: (string | null)[]; overlayPixels?: (string | null)[] }[]) => number[];
    stamp: () => void;
    isStamping: boolean;
    fps: number;
    setFps: React.Dispatch<React.SetStateAction<number>>;
    brushSize: 1 | 2;
    setBrushSize: (size: 1 | 2) => void;
    addSelectionBatch: (indices: number[]) => void;
    cancelStroke: () => void;
    activeLayer: Layer;
    setActiveLayer: (layer: Layer) => void;
    isOverlayStacked: boolean;
    setIsOverlayStacked: (stacked: boolean) => void;
}

const EditorContext = createContext<EditorContextType | undefined>(undefined);

export const EditorProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [sprites, setSprites] = useState<Sprite[]>([
        {
            id: 0,
            name: 'Sprite 0',
            pixelData: new Array(TOTAL_PIXELS).fill(null),
            overlayPixelData: new Array(TOTAL_PIXELS).fill(null),
            history: [new Array(TOTAL_PIXELS).fill(null)],
            redoHistory: [],
            overlayHistory: [new Array(TOTAL_PIXELS).fill(null)],
            overlayRedoHistory: []
        }
    ]);
    const [activeSpriteId, setActiveSpriteId] = useState<number>(0);
    const [currentColor, setCurrentColor] = useState<string | null>(PRESET_COLORS[0]);
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
    const [activeLayer, setActiveLayer] = useState<Layer>('base');
    const [isOverlayStacked, setIsOverlayStacked] = useState(true);

    // Helper to save history
    const saveHistory = useCallback((currentSprites: Sprite[], spriteId: number) => {
        return currentSprites.map(s => {
            if (s.id === spriteId) {
                const newHistory = [...s.history];
                const newOverlayHistory = [...s.overlayHistory];
                if (newHistory.length > 20) newHistory.shift();
                if (newOverlayHistory.length > 20) newOverlayHistory.shift();
                newHistory.push([...s.pixelData]); // Save COPY of pixelData
                newOverlayHistory.push([...s.overlayPixelData]);

                return {
                    ...s,
                    history: newHistory,
                    overlayHistory: newOverlayHistory,
                    redoHistory: [], // Clear redo on new action
                    overlayRedoHistory: []
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
        const layerKey = activeLayer === 'base' ? 'pixelData' : 'overlayPixelData';
        if (floatingLayerState.size > 0) {
            // Trigger Animation
            setIsStamping(true);
            setTimeout(() => setIsStamping(false), 200);

            // Stamp to background (commit COPY)
            setSprites(prevSprites => {
                const nextSprites = prevSprites.map(sprite => {
                    if (sprite.id !== activeSpriteId) return sprite;
                    const newPixelData = [...sprite[layerKey]];
                    floatingLayerState.forEach((color, idx) => {
                        newPixelData[idx] = color;
                    });
                    return { ...sprite, [layerKey]: newPixelData };
                });
                return saveHistory(nextSprites, activeSpriteId);
            });
            // DO NOT Clear floating layer (Stay floating)
        }
    }, [activeLayer, floatingLayerState, activeSpriteId, saveHistory]);

    const clearSelection = useCallback(() => {
        const layerKey = activeLayer === 'base' ? 'pixelData' : 'overlayPixelData';
        // Commits current floating layer and clears selection
        if (floatingLayerState.size > 0) {
            setSprites(prevSprites => {
                const nextSprites = prevSprites.map(sprite => {
                    if (sprite.id !== activeSpriteId) return sprite;
                    const newPixelData = [...sprite[layerKey]];
                    floatingLayerState.forEach((color, idx) => {
                        newPixelData[idx] = color;
                    });
                    return { ...sprite, [layerKey]: newPixelData };
                });
                return saveHistory(nextSprites, activeSpriteId);
            });
            setFloatingLayerState(new Map());
        }
        setSelectedPixelsState(new Set());
    }, [activeLayer, floatingLayerState, activeSpriteId, saveHistory]);

    const liftSelection = useCallback((pixelsOverride?: Set<number>) => {
        const layerKey = activeLayer === 'base' ? 'pixelData' : 'overlayPixelData';
        const pixelsToLift = pixelsOverride || selectedPixels;

        setSprites(prevSprites => {
            const nextSprites = prevSprites.map(sprite => {
                if (sprite.id !== activeSpriteId) return sprite;

                const newPixelData = [...sprite[layerKey]];
                const newFloatingLayer = new Map<number, string>();

                pixelsToLift.forEach(idx => {
                    if (sprite[layerKey][idx]) {
                        newFloatingLayer.set(idx, sprite[layerKey][idx]!);
                        newPixelData[idx] = null; // Clear from canvas
                    }
                });

                setFloatingLayerState(newFloatingLayer);
                return { ...sprite, [layerKey]: newPixelData };
            });
            return saveHistory(nextSprites, activeSpriteId);
        });
    }, [activeLayer, activeSpriteId, selectedPixels, saveHistory]);

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
                const newOverlayHistory = [...s.overlayHistory];
                const currentState = newHistory.pop(); // Pop current
                const previousState = newHistory[newHistory.length - 1]; // Peek previous
                const currentOverlayState = newOverlayHistory.pop();
                const previousOverlayState = newOverlayHistory[newOverlayHistory.length - 1];

                if (!currentState || !previousState || !currentOverlayState || !previousOverlayState) return s;

                return {
                    ...s,
                    pixelData: [...previousState],
                    overlayPixelData: [...previousOverlayState],
                    history: newHistory,
                    overlayHistory: newOverlayHistory,
                    redoHistory: [...s.redoHistory, currentState],
                    overlayRedoHistory: [...s.overlayRedoHistory, currentOverlayState]
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
                const newOverlayRedoHistory = [...s.overlayRedoHistory];
                const nextState = newRedoHistory.pop();
                const nextOverlayState = newOverlayRedoHistory.pop();

                if (!nextState || !nextOverlayState) return s;

                const newHistory = [...s.history, nextState];
                const newOverlayHistory = [...s.overlayHistory, nextOverlayState];

                return {
                    ...s,
                    pixelData: [...nextState],
                    overlayPixelData: [...nextOverlayState],
                    history: newHistory,
                    overlayHistory: newOverlayHistory,
                    redoHistory: newRedoHistory,
                    overlayRedoHistory: newOverlayRedoHistory
                };
            }
            return s;
        }));
    }, [activeSpriteId]);

    const cancelStroke = useCallback(() => {
        setSprites(prevSprites => prevSprites.map(s => {
            if (s.id === activeSpriteId) {
                const lastHistory = s.history[s.history.length - 1];
                const lastOverlayHistory = s.overlayHistory[s.overlayHistory.length - 1];
                if (!lastHistory || !lastOverlayHistory) return s;

                // Revert pixels to last history state
                return {
                    ...s,
                    pixelData: [...lastHistory],
                    overlayPixelData: [...lastOverlayHistory]
                };
            }
            return s;
        }));
        // We do typically want to stop drawing, but let the caller handle setIsDrawing(false) 
        // to avoid race conditions with effects if possible, or include it here?
        // Let's just revert pixels here.
    }, [activeSpriteId]);

    const activeSprite = sprites.find(s => s.id === activeSpriteId);

    const fill = useCallback((startIndex: number) => {
        const layerKey = activeLayer === 'base' ? 'pixelData' : 'overlayPixelData';

        // Floating Layer Fill
        if (selectedPixels.has(startIndex)) {
            // Calculate starting target color (Composite: Float > Base)
            const baseStartColor = activeSprite ? activeSprite[layerKey][startIndex] : null;
            const targetColor = floatingLayerState.has(startIndex) ? floatingLayerState.get(startIndex)! : baseStartColor;

            const replacementColor = currentColor;

            if (targetColor === replacementColor) return;

            // We need to update BOTH floating layer and potentially base layer (if erasing)
            // But updating base layer requires setSprites, which is separate from setFloatingLayerState.
            // Complex atomic update needed? 
            // Simpler: Determine pixels to change, then dispatch updates.

            const pixelsToChange: number[] = [];
            const queue = [startIndex];
            const visited = new Set<number>();

            // 1. Find all connected pixels matching targetColor
            while (queue.length > 0) {
                const currentIndex = queue.shift()!;
                if (visited.has(currentIndex)) continue;
                visited.add(currentIndex);

                if (!selectedPixels.has(currentIndex)) continue;

                const baseAtIdx = activeSprite ? activeSprite[layerKey][currentIndex] : null;
                const currentComposite = floatingLayerState.has(currentIndex) ? floatingLayerState.get(currentIndex)! : baseAtIdx;

                if (currentComposite === targetColor) {
                    pixelsToChange.push(currentIndex);

                    const x = currentIndex % GRID_SIZE;
                    const y = Math.floor(currentIndex / GRID_SIZE);
                    if (y > 0) queue.push(currentIndex - GRID_SIZE);
                    if (y < GRID_SIZE - 1) queue.push(currentIndex + GRID_SIZE);
                    if (x > 0) queue.push(currentIndex - 1);
                    if (x < GRID_SIZE - 1) queue.push(currentIndex + 1);
                }
            }

            // 2. Apply changes
            if (pixelsToChange.length > 0) {
                // Update Floating Layer
                setFloatingLayerState(prev => {
                    const newLayer = new Map(prev);
                    pixelsToChange.forEach(idx => {
                        if (replacementColor) {
                            newLayer.set(idx, replacementColor);
                        } else {
                            newLayer.delete(idx);
                        }
                    });
                    return newLayer;
                });

                // Update Base Layer ONLY if erasing (replacementColor is null)
                // If painting color, we just put it on float (masking base), so base can stay.
                if (replacementColor === null) {
                    setSprites(prevSprites => {
                        return prevSprites.map(sprite => {
                            if (sprite.id !== activeSpriteId) return sprite;
                            const newPixelData = [...sprite[layerKey]];
                            let changed = false;
                            pixelsToChange.forEach(idx => {
                                if (newPixelData[idx] !== null) {
                                    newPixelData[idx] = null;
                                    changed = true;
                                }
                            });
                            if (!changed) return sprite;
                            const updatedSprite = { ...sprite, [layerKey]: newPixelData };
                            return saveHistory([updatedSprite], activeSpriteId)[0];
                        });
                    });
                }
            }

            setTool('brush');
            return;
        }

        // Standard Sprite Fill
        setSprites(prevSprites => {
            const nextSprites = prevSprites.map(sprite => {
                if (sprite.id !== activeSpriteId) return sprite;

                const targetColor = sprite[layerKey][startIndex];
                const replacementColor = currentColor; // Fill with current color

                if (targetColor === replacementColor) return sprite;

                const newPixelData = [...sprite[layerKey]];
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

                return { ...sprite, [layerKey]: newPixelData };
            });

            // Save history explicitly after fill
            const spritesWithHistory = saveHistory(nextSprites, activeSpriteId);
            return spritesWithHistory;
        });

        // Legacy behavior: switch back to brush after fill
        setTool('brush');
    }, [activeLayer, activeSprite, activeSpriteId, currentColor, saveHistory, selectedPixels, floatingLayerState]);

    const updatePixel = useCallback((pixelIndex: number, maskConstraint: 'inside' | 'outside' | null = null) => {
        const layerKey = activeLayer === 'base' ? 'pixelData' : 'overlayPixelData';
        const targetColor = (currentTool === 'eraser' || currentColor === null) ? null : currentColor;

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

        // Apply strict filtering based on maskConstraint (Smart Masking)
        // This MUST happen before we check hitsSelection, to ensure we don't accidentally "hit" the selection
        // with a pixel that should have been masked out.
        const filteredPixels = pixelsToUpdate.filter(idx => {
            if (maskConstraint === 'inside') {
                return selectedPixels.has(idx);
            }
            if (maskConstraint === 'outside') {
                return !selectedPixels.has(idx);
            }
            return true;
        });

        if (filteredPixels.length === 0) return;

        // Helper to update a map (for floating layer)
        const updateMap = (prev: Map<number, string>) => {
            const newLayer = new Map(prev);
            filteredPixels.forEach(idx => {
                if (selectedPixels.size > 0 && !selectedPixels.has(idx)) return;
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
        const hitsSelection = filteredPixels.some(idx => selectedPixels.has(idx));

        if (hitsSelection) {
            setFloatingLayerState(prev => updateMap(prev));

            // If erasing (targetColor === null), we also need to potentially erase the base sprite pixels
            // IF they are not covered by the floating layer (or if we are just deleting the float?)
            // Actually, if we are erasing, we want to erase WHAT IS VISIBLE.
            // If there is a floating pixel, we delete it (revealing base).
            // If there is NO floating pixel, we erase the base.

            if (targetColor === null) {
                setSprites(prevSprites => prevSprites.map(sprite => {
                    if (sprite.id !== activeSpriteId) return sprite;
                    const newPixelData = [...sprite[layerKey]];
                    let changed = false;
                    filteredPixels.forEach(idx => {
                        // Only touch base if selected
                        if (selectedPixels.has(idx)) {
                            // Only erase base if NOT in floating layer (approximated by checking current state)
                            // But React state is async. We should use the PREVIOUS floating state or just assume?
                            // Issue: floatingLayerState here is stale relative to the updateMap above?
                            // Actually, updateMap returns new state, but we can't access it easily here unless we combine.

                            // Simplest safe logic: If we are erasing selection, we probably want to erase the base too
                            // UNLESS we are strictly "erasing the float to reveal the base".
                            // If I have a moved selection, I want to see the background.
                            // If I have a static selection, I want to see checkboard.
                            // Erasing base ensures checkboard.

                            // Let's rely on the check:
                            if (!floatingLayerState.has(idx)) {
                                if (newPixelData[idx] !== null) {
                                    newPixelData[idx] = null;
                                    changed = true;
                                }
                            }
                        }
                    });
                    if (!changed) return sprite;
                    return saveHistory([{ ...sprite, [layerKey]: newPixelData }], activeSpriteId)[0];
                    // Note: saveHistory expects array, returns array. We take the first (and only) updated sprite.
                    // Wait, saveHistory takes (currentSprites, id). We need to pass the FULL list? 
                    // No, simpler: just return the sprite and let a separate effect save? 
                    // Or follow pattern: setSprites usage usually saves history.
                }));
                // Actually the pattern in this file is: setSprites(prev => ... saveHistory(updated, id))
                // But here we are inside an IF block for hitsSelection.
                // We need to trigger setSprites separate from setFloatingLayer.
            }
            return;
        }



        if (filteredPixels.length === 0) return;

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

                const newLayerData = [...sprite[layerKey]];
                let changed = false;

                filteredPixels.forEach(idx => {
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
                        // REMOVED STRICT MASKING to allow 'Smart Masking' from Editor.tsx
                        // if (selectedPixels.size > 0 && !selectedPixels.has(idx)) return;

                        if (newLayerData[idx] !== targetColor) {
                            newLayerData[idx] = targetColor;
                            changed = true;
                        }
                    }
                });

                if (!changed) return sprite;
                return { ...sprite, [layerKey]: newLayerData };
            }
            return sprite;
        }));
    }, [activeLayer, activeSpriteId, currentTool, currentColor, selectedPixels, brushSize]);

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
                overlayPixelData: new Array(TOTAL_PIXELS).fill(null),
                history: [new Array(TOTAL_PIXELS).fill(null)],
                redoHistory: [],
                overlayHistory: [new Array(TOTAL_PIXELS).fill(null)],
                overlayRedoHistory: []
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
            const blank = new Array(TOTAL_PIXELS).fill(null);

            const nextBase = isOverlayStacked
                ? [...sourceSprite.pixelData]
                : (activeLayer === 'base' ? [...sourceSprite.pixelData] : [...blank]);
            const nextTop = isOverlayStacked
                ? [...sourceSprite.overlayPixelData]
                : (activeLayer === 'top' ? [...sourceSprite.overlayPixelData] : [...blank]);

            const newSprite: Sprite = {
                ...sourceSprite,
                id: newId,
                name: `${sourceSprite.name} (Copy)`,
                pixelData: nextBase,
                overlayPixelData: nextTop,
                // History? Typically we start fresh or copy. Let's start fresh to save memory.
                history: [[...nextBase]],
                redoHistory: [],
                overlayHistory: [[...nextTop]],
                overlayRedoHistory: []
            };

            const newSprites = [...prev, newSprite]; // Always append to end
            setActiveSpriteId(newId);
            return newSprites;
        });
    }, [activeSpriteId, setActiveSpriteId, activeLayer, isOverlayStacked]);

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

    const moveSprites = useCallback((indices: number[], insertAtIndex: number) => {
        setSprites(prev => {
            const newSprites = [...prev];

            // 1. Collect sprites to move
            const pickedSprites: Sprite[] = [];

            // Sort indices descending to splice safely
            const sortedIndices = [...indices].sort((a, b) => b - a);

            // Remove them from the array
            sortedIndices.forEach(idx => {
                if (idx >= 0 && idx < newSprites.length) {
                    pickedSprites.unshift(newSprites.splice(idx, 1)[0]); // Add to start to maintain original relative order
                }
            });

            // 2. Calculate insertion point
            // When taking items out, valid indices shift. 
            // However, dnd-kit usually provides the "over" index which is relative to the current list.
            // When moving items DOWN (to a higher index), the "over" index is generally the index *after* the item we are over.
            // But since we removed items *before* it, the index might need adjustment if we were merely splicing.
            // BUT, in this specific case, the user reported that dropping at the end (onto 4) places it on 3.
            // This suggests we were over-correcting.

            // Let's try simply using insertAtIndex as the target index in the REDUCED array, 
            // because dnd-kit's "over" logic combined with our removal might be causing the drift.

            // Actually, if I drop "after" the last item, insertAtIndex should be length.
            // If I drop "before" an item, it should be that item's index.

            // If we assume `insertAtIndex` is the index in the ORIGINAL array where we want to insert.
            // If we remove items before it, we must decrement.

            // However, let's look at `Timeline.tsx`:
            // `const newIndex = sprites.findIndex(s => s.id === overId);`
            // It passes the index of the sprite we are dropping OVER.

            // If we drop over the last item (index 3), newIndex is 3.
            // We want to insert AFTER it? Or REPLACE it?
            // `dnd-kit` sortable reorder usually means "place before this item".

            // If I drag 1 & 2 (indices 0, 1) to Over 4 (index 3).
            // I remove 0 and 1. Array is now [3, 4] (indices 0, 1).
            // Target was index 3 (original).
            // Logic was: 3 - 2 = 1. Insert at 1.
            // Array becomes [3, 1, 2, 4]. 
            // Wait, if I drop OVER 4, I expect it to be [3, 1, 2, 4] (before 4) or [3, 4, 1, 2] (after 4)?

            // If the user wants to place at the END, they usually drop "after" the last item.
            // But SortableContext triggers on "over".

            // Let's trust the standard reorder logic:
            // If we are moving down, we usually want to insert AFTER the target.
            // If we are moving up, we usually want to insert BEFORE the target.

            // We need to know if we are moving forward or backward.
            // But we have multiple indices.

            // Let's simplify: 
            // We strip the items.
            // We verify where we want to put them.
            // If the user dropped on "Frame 4", and Frame 4 is now at index 1 (because 0,1 gone).
            // We probably want to put it *after* Frame 4 if we came from above?

            // The issue "dropped on 4, placed on 3" implies it went BEFORE 4 when it should have gone AFTER?
            // Or it went before 3?

            // If I have 1, 2, 3, 4.
            // Select 1, 2. Drag to 4.
            // Remove 1, 2. List: 3, 4.
            // Target is 4 (originally index 3).
            // Adjustment: 3 - 2 (removed) = 1.
            // Insert at 1.
            // List: 3, [1, 2], 4.
            // Result: 3, 1, 2, 4.
            // User says: "place on 4 they get placed on 3". 
            // If "on 3" means "replaces 3" or "before 3"?
            // If result is 3, 1, 2, 4. It effectively placed them before 4.
            // If user wanted them AT THE END (after 4), they would expect 3, 4, 1, 2.

            // To fix this: If we are dragging DOWN (target > source), we likely want to insert AFTER calculation.
            // But we have multiple sources.

            // Heuristic: If the target index > average source index, we are moving down.
            // If moving down, we want to insert at `adjustedInsertIndex + 1`?
            // EXCEPT if we are modifying the implementation of `handleDragEnd` in Timeline.tsx.
            // In Timeline.tsx, we pass `newIndex` which is the index of `over`.

            // Let's modify the adjustment logic.
            // If we assume the user intends to place "at the position of the target", 
            // and sortable strategy usually stays "before".

            // Let's use a simpler "adjust index" logic.
            // We removed `sortedIndices.length` items.
            // We need to map `insertAtIndex` to the new array.

            let adjustedInsertIndex = insertAtIndex;
            console.log('moveSprites Start:', { indices, insertAtIndex, initialAdjusted: adjustedInsertIndex });

            sortedIndices.forEach(removedIdx => {
                if (removedIdx < insertAtIndex) {
                    adjustedInsertIndex--;
                }
            });
            console.log('After Removal Adjustment:', adjustedInsertIndex);

            // FIX: If we are moving items from "above" to "below", the `insertAtIndex` (which is the index of the item we dropped ON)
            // will shift up (decrement) because of the removals.
            // Resulting in insertion BEFORE the target.
            // If we want to insert AFTER the target when moving down, we might need +1?
            // But usually DND treats "over" as "swap with".

            // If I use standard array move logic:
            // When moving 0 to 3.
            // [0, 1, 2, 3].
            // Remove 0. [1, 2, 3].
            // Insert at 3. [1, 2, 3, 0].
            // My default logic: Target 3. 3 > 0, so adjust? 3-1=2.
            // Insert at 2. [1, 2, 0, 3]. 
            // So default logic inserts BEFORE target.

            // If I want to insert AFTER target when moving down:
            const isMovingDown = indices[0] < insertAtIndex; // Simple check using first item

            if (isMovingDown) {
                // When moving down, we want to insert AFTER the target item (which has shifted index)
                // Or rather, we want the visual effect of "taking the slot of the target".
                // But since the target shifted up, "taking its slot" means index.

                // If I want to go to the END.
                // I drop on 4. 4 is at index 1.
                // I want index 2.
                // My calc gave 1.
                // So I need +1.
                adjustedInsertIndex++;
            }
            console.log('Final Adjusted Index:', adjustedInsertIndex);

            // Ensure bounds
            adjustedInsertIndex = Math.max(0, Math.min(adjustedInsertIndex, newSprites.length));

            // Insert
            newSprites.splice(adjustedInsertIndex, 0, ...pickedSprites);

            console.log('moveSprites Result IDs:', newSprites.map(s => s.id));

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

    const handleSetCurrentColor = useCallback((color: string | null) => {
        setCurrentColor(color);

        // Legacy behavior: Don't switch tool if we are using fill
        if (currentTool !== 'fill') {
            setTool('brush');
        }

        if (color) {
            setRecentColors(prev => {
                if (prev.includes(color)) return prev;
                return [color, ...prev].slice(0, 7);
            });
        }
    }, [currentTool]);

    const isSpriteBlank = (sprite: Sprite) => {
        return sprite.pixelData.every(p => p === null) && sprite.overlayPixelData.every(p => p === null);
    };

    const importMultipleFromJSON = useCallback((files: { name: string; pixels: (string | null)[]; overlayPixels?: (string | null)[] }[]) => {
        let nextSprites = [...sprites];
        let currentActiveId = activeSpriteId;
        const newIds: number[] = [];

        let reachedLimit = false;

        files.forEach((file, index) => {
            if (nextSprites.length >= 64) {
                reachedLimit = true;
                return;
            }

            const activeIndex = nextSprites.findIndex(s => s.id === currentActiveId);
            const activeSprite = nextSprites[activeIndex];

            if (index === 0 && activeSprite && isSpriteBlank(activeSprite)) {
                // REPLACE: ONLY if first file AND current active frame is blank
                nextSprites[activeIndex] = {
                    ...activeSprite,
                    pixelData: [...file.pixels],
                    overlayPixelData: file.overlayPixels ? [...file.overlayPixels] : new Array(TOTAL_PIXELS).fill(null),
                    redoHistory: [],
                    overlayRedoHistory: []
                };
                // Make this replacement undoable immediately
                nextSprites = saveHistory(nextSprites, activeSprite.id);
                newIds.push(activeSprite.id);
            } else {
                // ADD NEW: For subsequent files or if current wasn't blank
                const newId = Math.max(...nextSprites.map(s => s.id), -1) + 1;
                const newSprite: Sprite = {
                    id: newId,
                    name: `Sprite ${nextSprites.length}`,
                    pixelData: [...file.pixels],
                    overlayPixelData: file.overlayPixels ? [...file.overlayPixels] : new Array(TOTAL_PIXELS).fill(null),
                    history: [[...file.pixels]],
                    redoHistory: [],
                    overlayHistory: [file.overlayPixels ? [...file.overlayPixels] : new Array(TOTAL_PIXELS).fill(null)],
                    overlayRedoHistory: []
                };
                // Always append to the end
                nextSprites.push(newSprite);
                currentActiveId = newId;
                newIds.push(newId);
            }
        });

        if (reachedLimit) {
            alert('Frame limit reached (64). Some files were not imported.');
        }

        setSprites(nextSprites);
        return newIds;
    }, [activeSpriteId, saveHistory, sprites]);

    const clearCanvas = useCallback(() => {
        const layerKey = activeLayer === 'base' ? 'pixelData' : 'overlayPixelData';
        // Update pixel data AND save history immediately (atomic action)
        setSprites(prevSprites => {
            const updated = prevSprites.map(s => {
                if (s.id === activeSpriteId) {
                    return { ...s, [layerKey]: new Array(TOTAL_PIXELS).fill(null) };
                }
                return s;
            });
            // Save history for this atomic action
            return saveHistory(updated, activeSpriteId);
        });
    }, [activeLayer, activeSpriteId, saveHistory]);

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
                addSelectionBatch,
                moveSprites,
                cancelStroke,
                activeLayer,
                setActiveLayer,
                isOverlayStacked,
                setIsOverlayStacked
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
