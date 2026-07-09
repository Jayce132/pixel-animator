import type { SetStateAction } from 'react';
import type { StateCreator } from 'zustand';
import type { EditorNotification, FloatingLayerPixel, Layer, NotificationTone, Palette, Sprite, Tool } from '../../types';
import type { LayerExportMode } from '../../utils/export';

export type SpriteLayerKey = 'pixelData' | 'overlayPixelData';

export interface ImportedFrameFile {
    name: string;
    pixels: (string | null)[];
    overlayPixels?: (string | null)[];
}

export interface EditorUiState {
    activeActions: string[];
    activeLayer: Layer;
    activeSpriteId: number;
    brushSize: 1 | 2;
    currentColor: string | null;
    currentTool: Tool;
    floatingLayer: Map<number, FloatingLayerPixel>;
    fps: number;
    isOnionSkinning: boolean;
    isOverlayStacked: boolean;
    isDrawing: boolean;
    isPlaying: boolean;
    isStamping: boolean;
    layerExportMode: LayerExportMode;
    notification: EditorNotification | null;
    palette: Palette;
    projectName: string;
    recentColors: string[];
    selectedPixels: Set<number>;
    sprites: Sprite[];
    addSprite: () => void;
    addSelectionBatch: (indices: number[]) => void;
    addToSelection: (index: number) => void;
    cancelStroke: () => void;
    clearCanvas: () => void;
    clearSelection: () => void;
    commitHistory: () => void;
    deleteSprite: (id?: number) => void;
    duplicateSprite: () => void;
    exportFrame: (projectName: string, layerMode: LayerExportMode) => void;
    exportFrameJSON: (projectName: string, layerMode: LayerExportMode) => void;
    exportGIF: (projectName: string, layerMode: LayerExportMode) => void;
    exportSelectedJSON: (projectName: string, layerMode: LayerExportMode, spritesToExport: Sprite[]) => void;
    exportSelectedPNG: (projectName: string, layerMode: LayerExportMode, spritesToExport: Sprite[]) => void;
    exportSpriteSheet: (projectName: string, layerMode: LayerExportMode, spritesToExport?: Sprite[]) => void;
    fill: (startIndex: number) => void;
    flushPendingPixelUpdates: () => void;
    discardPendingPixelUpdates: () => void;
    flipSelectionHorizontal: () => void;
    flipSelectionVertical: () => void;
    importMultipleFromJSON: (files: ImportedFrameFile[]) => number[];
    liftSelection: (pixelsOverride?: Set<number>) => void;
    loadProject: (file: File) => Promise<void>;
    moveSprite: (oldIndex: number, newIndex: number) => void;
    moveSprites: (indices: number[], insertAtIndex: number, activeIndex?: number) => void;
    nudgeSelection: (dx: number, dy: number) => void;
    redo: () => void;
    rotateSelectionLeft: () => void;
    rotateSelectionRight: () => void;
    saveProject: (projectName: string) => void;
    undo: () => void;
    setActiveActions: (actions: string[]) => void;
    setActiveLayer: (layer: Layer) => void;
    setActiveSpriteId: (id: SetStateAction<number>) => void;
    setBrushSize: (size: 1 | 2) => void;
    setCurrentColor: (color: string | null) => void;
    setFps: (fps: SetStateAction<number>) => void;
    setIsDrawing: (drawing: boolean) => void;
    setIsOnionSkinning: (on: boolean) => void;
    setIsOverlayStacked: (stacked: boolean) => void;
    setIsPlaying: (playing: boolean) => void;
    setLayerExportMode: (mode: LayerExportMode) => void;
    setProjectName: (name: string) => void;
    setSelectedPixels: (pixels: SetStateAction<Set<number>>) => void;
    setTool: (tool: Tool) => void;
    stamp: (commit?: boolean, animate?: boolean) => void;
    updatePixel: (pixelIndex: number, maskConstraint?: 'inside' | 'outside' | null) => void;
    notify: (message: string, tone?: NotificationTone) => void;
    clearNotification: () => void;
}

export type EditorStoreSet = Parameters<StateCreator<EditorUiState>>[0];
export type EditorStoreGet = Parameters<StateCreator<EditorUiState>>[1];
