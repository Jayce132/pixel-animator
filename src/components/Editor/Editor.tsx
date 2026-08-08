import React, { useRef, useEffect, useState } from 'react';
import { calculateLassoSelection } from '../../utils/lasso';
import { getLinePixels } from '../../utils/draw';
import {
    getCompositePixelData,
    getEditorDisplayPixels,
    getInactiveLayerPixels,
    getSpriteLayerPixels,
    getVisibleLayerColorAtIndex
} from '../../utils/compositing';
import { MagnifyingGlass } from '../MagnifyingGlass';
import { GRID_SIZE } from '../../types';
import { useEditorUiStore } from '../../stores/editorStore';
import { selectActiveSprite } from '../../stores/editorSelectors';
import { useEditorCursorStyles } from '../../hooks/useEditorCursorStyles';
import { EYEDROPPER_HOLD_ANIMATION_MS, useEyedropperHold } from '../../hooks/useEyedropperHold';
import { usePanZoom } from '../../hooks/usePanZoom';
import { SHAPE_HOLD_RING_DELAY_MS, SHAPE_HOLD_RING_SWEEP_MS, useShapeAssist } from '../../hooks/useShapeAssist';
import {
    paintFloatingPixels,
    paintLayerPreview,
    paintMainCanvas,
    paintOverlayCanvas,
    paintPeerSelectionOverlay,
    paintStampCanvas,
    syncCanvasBackingStore
} from './canvasPainting';
import { createBlankPixelData, getPixelColor, TRANSPARENT_PIXEL } from '../../utils/pixelData';
import { PresenceCursors } from '../Collab/PresenceCursors';
import { updateLocalCollabCursor } from '../../collab/presenceRuntime';
import { useCollabStore } from '../../stores/collabStore';

interface PointerCoords {
    clientX: number;
    clientY: number;
}

type DropperHoldCellVars = React.CSSProperties & Record<
    '--dropper-left' | '--dropper-top' | '--dropper-width' | '--dropper-height',
    string
>;

type DropperHoldFillVars = React.CSSProperties & Record<
    '--dropper-progress' | '--dropper-color',
    string
>;

type EditorWorkspaceVars = React.CSSProperties & Record<
    '--editor-pan-x' | '--editor-pan-y' | '--editor-zoom' | '--inverse-zoom' | '--editor-size',
    string
>;

type EditorCanvasVars = React.CSSProperties & Record<
    '--cursor-normal' | '--cursor-faint' | '--selection-cursor',
    string
>;

const EMPTY_SPRITE = {
    pixelData: createBlankPixelData(GRID_SIZE * GRID_SIZE),
    overlayPixelData: createBlankPixelData(GRID_SIZE * GRID_SIZE)
};

export const Editor: React.FC = () => {
    const MIN_VIEW_ZOOM = 0.5;
    const MAX_VIEW_ZOOM = 4;
    const editorContainerRef = useRef<HTMLDivElement>(null);
    // Track if drag started inside or outside selection to mask cursor visibility
    const [dragOrigin, setDragOrigin] = React.useState<'inside' | 'outside' | null>(null);
    const dragOriginRef = useRef<'inside' | 'outside' | null>(null);

    const activeSprite = useEditorUiStore(selectActiveSprite);
    const updatePixel = useEditorUiStore(state => state.updatePixel);
    const isDrawing = useEditorUiStore(state => state.isDrawing);
    const setIsDrawing = useEditorUiStore(state => state.setIsDrawing);
    const currentTool = useEditorUiStore(state => state.currentTool);
    const fill = useEditorUiStore(state => state.fill);
    const selectedPixels = useEditorUiStore(state => state.selectedPixels);
    const addToSelection = useEditorUiStore(state => state.addToSelection);
    const setSelectedPixels = useEditorUiStore(state => state.setSelectedPixels);
    const clearSelection = useEditorUiStore(state => state.clearSelection);
    const liftSelection = useEditorUiStore(state => state.liftSelection);
    const floatingLayer = useEditorUiStore(state => state.floatingLayer);
    const isPlaying = useEditorUiStore(state => state.isPlaying);
    const isOnionSkinning = useEditorUiStore(state => state.isOnionSkinning);
    const sprites = useEditorUiStore(state => state.sprites);
    const activeSpriteId = useEditorUiStore(state => state.activeSpriteId);
    // v1 collab sessions cap at one guest, so there's ever at most one peer
    // whose selection could be relevant to the frame you're looking at.
    const activePeerSelection = useCollabStore(state => (
        state.peers.find(peer => peer.frameId === activeSpriteId) ?? null
    ));
    const currentColor = useEditorUiStore(state => state.currentColor);
    const setCurrentColor = useEditorUiStore(state => state.setCurrentColor);
    const brushSize = useEditorUiStore(state => state.brushSize);
    const addSelectionBatch = useEditorUiStore(state => state.addSelectionBatch);
    const cancelStroke = useEditorUiStore(state => state.cancelStroke);
    const setTool = useEditorUiStore(state => state.setTool);
    const activeLayer = useEditorUiStore(state => state.activeLayer);
    const setActiveLayer = useEditorUiStore(state => state.setActiveLayer);
    const isOverlayStacked = useEditorUiStore(state => state.isOverlayStacked);
    const setIsOverlayStacked = useEditorUiStore(state => state.setIsOverlayStacked);
    const palette = useEditorUiStore(state => state.palette);
    const isStamping = useEditorUiStore(state => state.isStamping);
    const activeActions = useEditorUiStore(state => state.activeActions);

    const activeSpriteIndex = sprites.findIndex(s => s.id === activeSpriteId);
    const prevSprite = activeSpriteIndex > 0 ? sprites[activeSpriteIndex - 1] : null;
    const workingSprite = React.useMemo(
        () => activeSprite ?? sprites[0] ?? EMPTY_SPRITE,
        [activeSprite, sprites]
    );
    const editingLayer: 'base' | 'top' = isOverlayStacked ? 'top' : activeLayer;
    const activeLayerPixels = getSpriteLayerPixels(workingSprite, editingLayer);
    const inactiveLayerPixels = getInactiveLayerPixels(workingSprite, editingLayer);
    const showTopOnlyWhileSelecting = isOverlayStacked && currentTool === 'select' && isDrawing;
    const displayPixels = React.useMemo(
        () => {
            if (showTopOnlyWhileSelecting) return workingSprite.overlayPixelData;
            return getEditorDisplayPixels(workingSprite, editingLayer, isOverlayStacked);
        },
        [
            editingLayer,
            isOverlayStacked,
            showTopOnlyWhileSelecting,
            workingSprite
        ]
    );

    // Use a ref to track if we stamped/ lasso-ed on this specific interaction
    const isLassoingRef = useRef(false);
    // Track last pixel for interpolation
    const lastPixelIndexRef = useRef<number | null>(null);

    const isNudging = activeActions.some(action => action === 'up' || action === 'down' || action === 'left' || action === 'right');
    const showStampAnimation = isStamping && floatingLayer.size > 0 && !isNudging && !isPlaying;
    const { cursorStyle, faintCursorStyle, selectionCursorStyle } = useEditorCursorStyles({
        brushSize,
        currentColor,
        currentTool
    });

    const isPointerDownRef = useRef(false);
    const activePointerIdRef = useRef<number | null>(null);
    const activeTargetIndexRef = useRef<number | null>(null);
    const pendingPresenceCursorRef = useRef<{ x: number; y: number } | null>(null);
    const presenceFrameRef = useRef<number | null>(null);
    const mouseHoverIndexRef = useRef<number | null>(null);
    const pendingFillPixelRef = useRef<number | null>(null);
    const workspaceRef = useRef<HTMLDivElement>(null);
    const stackButtonRef = useRef<HTMLButtonElement>(null);

    const publishPresenceCursor = React.useCallback((index: number | null) => {
        pendingPresenceCursorRef.current = index === null
            ? null
            : { x: index % GRID_SIZE, y: Math.floor(index / GRID_SIZE) };
        if (presenceFrameRef.current !== null) return;
        presenceFrameRef.current = window.requestAnimationFrame(() => {
            presenceFrameRef.current = null;
            updateLocalCollabCursor(pendingPresenceCursorRef.current);
        });
    }, []);

    useEffect(() => () => {
        if (presenceFrameRef.current !== null) window.cancelAnimationFrame(presenceFrameRef.current);
        updateLocalCollabCursor(null);
    }, []);

    // Canvas refs for editor rendering (replaces the old DOM pixel grid)
    const mainCanvasRef = useRef<HTMLCanvasElement>(null);
    const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
    const stampCanvasRef = useRef<HTMLCanvasElement>(null);
    const peerSelectionCanvasRef = useRef<HTMLCanvasElement>(null);
    const leftPreviewCanvasRef = useRef<HTMLCanvasElement>(null);
    const rightPreviewCanvasRef = useRef<HTMLCanvasElement>(null);
    // Track hover index for canvas-based cursor highlight
    const [hoverIndex, setHoverIndex] = useState<number | null>(null);
    const [overlayResizeTick, setOverlayResizeTick] = useState(0);
    const {
        beginEyedropperHold,
        cancelPendingHoldForMovement,
        clearEyedropperPointerState,
        clearPendingHold,
        dropperHoldOverlay,
        eyedropperTargetIndex,
        eyedropperTargetIndexRef,
        finishEyedropper,
        isEyedropperActive,
        pointerPos,
        setEyedropperPointerPosition,
        setEyedropperTarget,
        showDropperHint
    } = useEyedropperHold({
        activeLayerPixels,
        brushSize,
        cancelStroke,
        currentColor,
        currentTool,
        editorContainerRef,
        isPointerDownRef,
        palette,
        setIsDrawing
    });
    const {
        beginShapeStroke,
        circlePreviewSet,
        clearShapeHint,
        shapeHoldIndex,
        commitActiveShape,
        handleShapePointerTargetChange,
        linePreviewSet,
        resetShapeAssist,
        shapeHintMode
    } = useShapeAssist({
        brushSize,
        cancelStroke,
        currentTool,
        dragOriginRef,
        isDrawing,
        isPointerDownRef,
        selectedPixels
    });

    useEffect(() => {
        if (isOverlayStacked && activeLayer !== 'top') {
            setActiveLayer('top');
        }
    }, [isOverlayStacked, activeLayer, setActiveLayer]);

    useEffect(() => {
        const editor = editorContainerRef.current;
        if (!editor || typeof ResizeObserver === 'undefined') return;

        const resizeObserver = new ResizeObserver(() => {
            setOverlayResizeTick(tick => tick + 1);
        });
        resizeObserver.observe(editor);

        return () => {
            resizeObserver.disconnect();
        };
    }, []);
    const getGridIndexFromClientPoint = (clientX: number, clientY: number): number | null => {
        const editor = editorContainerRef.current;
        if (!editor) return null;

        const rect = editor.getBoundingClientRect();
        const computedStyle = window.getComputedStyle(editor);
        const scaleX = editor.offsetWidth > 0 ? rect.width / editor.offsetWidth : 1;
        const scaleY = editor.offsetHeight > 0 ? rect.height / editor.offsetHeight : 1;
        const borderLeft = (Number.parseFloat(computedStyle.borderLeftWidth) || 0) * scaleX;
        const borderRight = (Number.parseFloat(computedStyle.borderRightWidth) || 0) * scaleX;
        const borderTop = (Number.parseFloat(computedStyle.borderTopWidth) || 0) * scaleY;
        const borderBottom = (Number.parseFloat(computedStyle.borderBottomWidth) || 0) * scaleY;
        const gridLeft = rect.left + borderLeft;
        const gridTop = rect.top + borderTop;
        const gridWidth = rect.width - borderLeft - borderRight;
        const gridHeight = rect.height - borderTop - borderBottom;

        if (gridWidth <= 0 || gridHeight <= 0) return null;
        if (clientX < gridLeft || clientX >= gridLeft + gridWidth || clientY < gridTop || clientY >= gridTop + gridHeight) {
            return null;
        }

        const col = Math.min(GRID_SIZE - 1, Math.floor(((clientX - gridLeft) / gridWidth) * GRID_SIZE));
        const row = Math.min(GRID_SIZE - 1, Math.floor(((clientY - gridTop) / gridHeight) * GRID_SIZE));
        return row * GRID_SIZE + col;
    };

    const setMouseHoverTarget = (index: number | null) => {
        mouseHoverIndexRef.current = index;
        setHoverIndex(index);
    };

    const clearMouseHoverState = () => {
        setMouseHoverTarget(null);
    };

    const beginResolvedPointerInteraction = (
        index: number,
        point: PointerCoords,
        pointerType: 'mouse' | 'touch' | 'pen'
    ) => {
        activeTargetIndexRef.current = index;
        if (pointerType === 'mouse') {
            setMouseHoverTarget(index);
        } else {
            clearMouseHoverState();
        }

        if (isEyedropperActive) return;

        isPointerDownRef.current = true;
        beginEyedropperHold(index, point, pointerType);

        beginShapeStroke(index);

        // Reset last pixel on new stroke
        lastPixelIndexRef.current = index;

        // Check where drag started (Masking only for Brush/Eraser to Faint, not Select or Fill)
        if (currentTool === 'brush' || currentTool === 'eraser') {
            const region = selectedPixels.has(index) ? 'inside' : 'outside';
            setDragOrigin(region);
            dragOriginRef.current = region;
        }

        if (currentTool === 'fill') {
            pendingFillPixelRef.current = index;
            // fill(index); // Deferred until Pointer Up (Safety Catch)
            return;
        }

        if (currentTool === 'select') {
            if (!selectedPixels.has(index)) {
                // No selecting mid-playback: keep the existing selection (its
                // stamp stays usable) and never start a new lasso.
                if (isPlaying) return;
                if (selectedPixels.size > 0) {
                    clearSelection();
                }
                isLassoingRef.current = true;
                setIsDrawing(true);
                addToSelection(index);
            }
            return;
        }

        setIsDrawing(true);
        updatePixel(index, dragOriginRef.current);
    };

    const handleResolvedPointerTargetChange = (
        index: number,
        pointerType: 'mouse' | 'touch' | 'pen'
    ) => {
        activeTargetIndexRef.current = index;
        if (pointerType === 'mouse') {
            setMouseHoverTarget(index);
        } else {
            clearMouseHoverState();
        }

        if (isEyedropperActive) {
            setEyedropperTarget(index);
            return;
        }

        const shapeHandled = handleShapePointerTargetChange(index, () => {
            clearPendingHold();
        });
        if (shapeHandled) return;

        if (isDrawing) {
            if (currentTool === 'brush' || currentTool === 'eraser') {
                if (lastPixelIndexRef.current !== null && lastPixelIndexRef.current !== index) {
                    clearPendingHold();
                }
            }

            // Optimization & Constraint:
            // If masked (drag started 'inside' but now 'outside', or vice-versa),
            // update cursor visuals.
            const isMasked = (dragOrigin === 'inside' && !selectedPixels.has(index)) ||
                (dragOrigin === 'outside' && selectedPixels.has(index));

            if (isMasked) {
                if (editorContainerRef.current) editorContainerRef.current.classList.add('cursor-masked');
            } else {
                if (editorContainerRef.current) editorContainerRef.current.classList.remove('cursor-masked');
            }

            // Helper to check if a specific pixel can be painted based on start origin
            const canPaint = (idx: number) => {
                if (dragOriginRef.current === 'inside') return selectedPixels.has(idx);
                if (dragOriginRef.current === 'outside') return !selectedPixels.has(idx);
                return true;
            };

            if (currentTool === 'select') {
                if (lastPixelIndexRef.current !== null && lastPixelIndexRef.current !== index) {
                    const pixels = getLinePixels(lastPixelIndexRef.current, index);
                    // Batch update for performance
                    addSelectionBatch(pixels);
                } else {
                    addSelectionBatch([index]);
                }
                lastPixelIndexRef.current = index;
                return;
            }

            // Interpolate line from last pixel to current
            if (lastPixelIndexRef.current !== null && lastPixelIndexRef.current !== index) {
                const pixels = getLinePixels(lastPixelIndexRef.current, index);
                pixels.forEach(idx => {
                    if (canPaint(idx)) updatePixel(idx, dragOriginRef.current);
                });
            } else {
                if (canPaint(index)) updatePixel(index, dragOriginRef.current);
            }

            // Always update last position so the line 'follows' even through masks
            // This prevents "slashing" artifacts if you exit and re-enter a valid zone
            lastPixelIndexRef.current = index;
        }
    };

    const handleMouseUp = () => {
        activePointerIdRef.current = null;
        activeTargetIndexRef.current = null;
        isPointerDownRef.current = false;
        clearPendingHold({ clearPointerStart: true });
        commitActiveShape((idx) => {
            updatePixel(idx, dragOriginRef.current);
        }, () => {
            setTool('brush');
            clearPendingHold();
        });

        if (currentTool === 'select' && isLassoingRef.current) {
            // Lasso Release Logic
            const fullSelection = calculateLassoSelection(selectedPixels);

            // Auto-Trim: Filter selection to only pixels that have content
            const trimmedSelection = new Set<number>();
            fullSelection.forEach(idx => {
                if (activeLayerPixels[idx] !== TRANSPARENT_PIXEL) {
                    trimmedSelection.add(idx);
                }
            });

            // Use trimmed selection if it has content, otherwise (e.g. selecting empty space) keep the full shape
            let finalSelection = fullSelection;
            if (trimmedSelection.size > 0) {
                finalSelection = trimmedSelection;
            }

            setSelectedPixels(finalSelection);
            liftSelection(finalSelection);

            isLassoingRef.current = false;
        }

        setIsDrawing(false);
        lastPixelIndexRef.current = null;
        resetShapeAssist();
        clearPendingHold();
        setDragOrigin(null);
        if (editorContainerRef.current) editorContainerRef.current.classList.remove('cursor-masked');
    };

    const resetEditorInteractionState = () => {
        activePointerIdRef.current = null;
        activeTargetIndexRef.current = null;
        isPointerDownRef.current = false;
        clearPendingHold({ clearPointerStart: true });
        resetShapeAssist();

        clearMouseHoverState();
        setIsDrawing(false);
        isLassoingRef.current = false;
        lastPixelIndexRef.current = null;
        setDragOrigin(null);
        if (editorContainerRef.current) editorContainerRef.current.classList.remove('cursor-masked');
    };

    const handlePointerLeave = (e: React.PointerEvent<HTMLDivElement>) => {
        if (e.pointerType !== 'mouse') return;
        publishPresenceCursor(null);
        activeTargetIndexRef.current = null;
        clearMouseHoverState();
    };

    const hideHighlightOverlay = () => {
        clearMouseHoverState();
    };

    const clearTransientPointerState = () => {
        activeTargetIndexRef.current = null;
        clearEyedropperPointerState();
        clearMouseHoverState();
    };

    const cancelActiveInteractionRef = useRef<() => void>(() => { });
    const {
        beginPan,
        beginTouchGesture,
        clearGestureTransform,
        containerRef,
        endPan,
        getTouchPointerCount,
        isGestureZooming,
        isPanning,
        panOffset,
        removeTouchPointer,
        stopGestureZooming,
        trackTouchPointer,
        updatePan,
        updateTouchGestureZoom,
        updateTouchPointer,
        viewZoom
    } = usePanZoom({
        minZoom: MIN_VIEW_ZOOM,
        maxZoom: MAX_VIEW_ZOOM,
        workspaceRef,
        stackButtonRef,
        cancelActiveInteractionRef
    });

    const cancelActiveInteraction = () => {
        activePointerIdRef.current = null;
        activeTargetIndexRef.current = null;
        pendingFillPixelRef.current = null;

        if (isPanning()) {
            endPan();
        }

        if (isEyedropperActive) {
            finishEyedropper();
        }

        resetEditorInteractionState();
    };

    useEffect(() => {
        cancelActiveInteractionRef.current = cancelActiveInteraction;
    });

    const eyedropperColor = (isEyedropperActive && eyedropperTargetIndex !== null)
        ? getVisibleLayerColorAtIndex(activeLayerPixels, floatingLayer, palette, eyedropperTargetIndex)
        : null;

    // === Canvas Paint Effects ===

    // Compute onion skin pixel data for overlay
    const onionSkinPixels = React.useMemo(() => {
        if (!isOnionSkinning || isPlaying || !prevSprite) return null;
        return isOverlayStacked
            ? getCompositePixelData(prevSprite)
            : getSpriteLayerPixels(prevSprite, editingLayer);
    }, [isOnionSkinning, isPlaying, prevSprite, isOverlayStacked, editingLayer]);

    // Paint main canvas whenever pixel data changes
    useEffect(() => {
        const canvas = mainCanvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        if (isPlaying) {
            // Playback mode: clean render, no checkerboard, no selection dimming
            ctx.clearRect(0, 0, GRID_SIZE, GRID_SIZE);
            const playbackPixels = getEditorDisplayPixels(workingSprite, editingLayer, isOverlayStacked);
            for (let i = 0; i < GRID_SIZE * GRID_SIZE; i++) {
                const color = getPixelColor(playbackPixels, i, palette);
                if (color) {
                    ctx.fillStyle = color;
                    ctx.fillRect(i % GRID_SIZE, Math.floor(i / GRID_SIZE), 1, 1);
                }
            }
            // The floating stamp still sits on top so it can be aimed while
            // the animation plays underneath.
            paintFloatingPixels(ctx, floatingLayer);
        } else {
            paintMainCanvas(ctx, displayPixels, floatingLayer, palette, selectedPixels, selectedPixels.size > 0);
        }
    }, [isPlaying, workingSprite, displayPixels, floatingLayer, palette, selectedPixels, isOverlayStacked, editingLayer]);

    // Paint stamp feedback on a transparent layer so only the floating pixels jump.
    useEffect(() => {
        if (!showStampAnimation) return;
        const canvas = stampCanvasRef.current;
        if (!canvas) return;
        syncCanvasBackingStore(canvas);
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        paintStampCanvas(ctx, floatingLayer);
    }, [showStampAnimation, floatingLayer]);

    // Paint overlay canvas for selection, previews, onion skin, highlight
    useEffect(() => {
        if (isPlaying) return; // No overlays during playback
        const canvas = overlayCanvasRef.current;
        if (!canvas) return;
        syncCanvasBackingStore(canvas);
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        paintOverlayCanvas(ctx, {
            selectedPixels,
            floatingLayer,
            linePreviewSet,
            circlePreviewSet,
            currentColor,
            currentTool,
            onionSkinPixels,
            palette,
            hoverIndex,
            brushSize,
            isDrawing
        });
    }, [isPlaying, selectedPixels, linePreviewSet, circlePreviewSet,
        floatingLayer, currentColor, currentTool, onionSkinPixels, palette, hoverIndex, brushSize, isDrawing, overlayResizeTick]);

    // Paint the peer's selection outline + in-progress drag, read-only —
    // this never reads from or writes to the local selectedPixels/
    // floatingLayer above, so it cannot affect this canvas's own editing.
    useEffect(() => {
        const canvas = peerSelectionCanvasRef.current;
        if (!canvas) return;
        syncCanvasBackingStore(canvas);
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        if (isPlaying || !activePeerSelection) {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            return;
        }

        paintPeerSelectionOverlay(ctx, {
            selectedPixels: activePeerSelection.selectedPixels,
            floatingLayer: activePeerSelection.floatingLayer,
            peerColor: activePeerSelection.color
        });
    }, [isPlaying, activePeerSelection, overlayResizeTick]);

    // Paint inactive layer preview canvas (unstacked mode)
    useEffect(() => {
        const canvas = editingLayer === 'top' ? leftPreviewCanvasRef.current : rightPreviewCanvasRef.current;
        if (!canvas || isOverlayStacked) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        paintLayerPreview(ctx, inactiveLayerPixels, palette);
    }, [inactiveLayerPixels, palette, editingLayer, isOverlayStacked]);

    // Scale editor based on brushSize (1x = 'Zoomed' 2x Scale, 2x = Normal 1x Scale)
    // Only apply scale if we are in the zoomed state
    // Pointer Events for Long Press (Container Level)
    const handlePointerDown = (e: React.PointerEvent) => {
        const pointerType = e.pointerType as 'mouse' | 'touch' | 'pen';
        if (pointerType === 'touch') {
            hideHighlightOverlay();
            e.preventDefault();
            e.currentTarget.setPointerCapture(e.pointerId);
            trackTouchPointer(e.pointerId, { x: e.clientX, y: e.clientY });
            if (getTouchPointerCount() > 1) {
                cancelActiveInteraction();
                beginTouchGesture();
                return;
            }
            if (isGestureZooming()) return;
        }

        if (e.button !== 0 || !e.isPrimary) return;
        const target = e.target as HTMLElement;
        const hitEditor = !!editorContainerRef.current && editorContainerRef.current.contains(target);
        const hitButton = !!target.closest('button');
        if (!hitEditor) {
            if (!hitButton) {
                activePointerIdRef.current = e.pointerId;
                e.currentTarget.setPointerCapture(e.pointerId);
                beginPan(e.clientX, e.clientY);
            }
            return;
        }
        if (target.closest('.layer-preview')) return;

        const index = getGridIndexFromClientPoint(e.clientX, e.clientY);
        if (pointerType === 'mouse' || isPointerDownRef.current) {
            publishPresenceCursor(index);
        }
        if (index === null) return;

        activePointerIdRef.current = e.pointerId;
        activeTargetIndexRef.current = index;
        e.currentTarget.setPointerCapture(e.pointerId);
        beginResolvedPointerInteraction(
            index,
            { clientX: e.clientX, clientY: e.clientY },
            pointerType
        );
    };

    const handlePointerMove = (e: React.PointerEvent) => {
        const pointerType = e.pointerType as 'mouse' | 'touch' | 'pen';
        if (pointerType === 'touch') {
            updateTouchPointer(e.pointerId, { x: e.clientX, y: e.clientY });

            if (isGestureZooming()) {
                updateTouchGestureZoom();
                return;
            }
        }
        if (activePointerIdRef.current !== null && e.pointerId !== activePointerIdRef.current) return;

        if (updatePan(e.clientX, e.clientY)) {
            return;
        }

        if (isEyedropperActive) {
            setEyedropperPointerPosition({ clientX: e.clientX, clientY: e.clientY });
        }

        const index = getGridIndexFromClientPoint(e.clientX, e.clientY);
        if (pointerType === 'mouse' || isPointerDownRef.current) {
            publishPresenceCursor(index);
        }

        if (index === null) {
            activeTargetIndexRef.current = null;
            if (pointerType === 'mouse') {
                clearMouseHoverState();
            }
            if (isEyedropperActive) {
                setEyedropperTarget(null);
            }
        } else {
            const needsTargetUpdate =
                activeTargetIndexRef.current !== index ||
                (pointerType === 'mouse' && mouseHoverIndexRef.current !== index) ||
                (isEyedropperActive && eyedropperTargetIndexRef.current !== index);

            if (needsTargetUpdate) {
                handleResolvedPointerTargetChange(index, pointerType);
            }
        }

        if (!isPointerDownRef.current || isEyedropperActive) return;

        // Optimization: if the hold timer is already gone, this is a no-op.
        if (cancelPendingHoldForMovement({ clientX: e.clientX, clientY: e.clientY })) {
            clearShapeHint();
        }
    };

    const handlePointerUp = (e: React.PointerEvent) => {
        const pointerType = e.pointerType as 'mouse' | 'touch' | 'pen';
        if (pointerType === 'touch') publishPresenceCursor(null);
        if (pointerType === 'touch') {
            removeTouchPointer(e.pointerId);
            if (isGestureZooming()) {
                if (getTouchPointerCount() < 2) {
                    clearGestureTransform();
                }
                if (getTouchPointerCount() === 0) {
                    stopGestureZooming();
                    clearTransientPointerState();
                }
                return;
            }
        }

        if (activePointerIdRef.current !== null && e.pointerId !== activePointerIdRef.current) return;

        if (isPanning()) {
            endPan();
            activePointerIdRef.current = null;
            activeTargetIndexRef.current = null;
            if (e.currentTarget.hasPointerCapture(e.pointerId)) {
                e.currentTarget.releasePointerCapture(e.pointerId);
            }
            return;
        }

        activePointerIdRef.current = null;
        activeTargetIndexRef.current = null;
        if (e.currentTarget.hasPointerCapture(e.pointerId)) {
            e.currentTarget.releasePointerCapture(e.pointerId);
        }
        isPointerDownRef.current = false;
        clearPendingHold({ clearPointerStart: true });

        if (isEyedropperActive) {
            const pickedIndex = eyedropperTargetIndexRef.current;
            if (pickedIndex !== null && pickedIndex >= 0 && pickedIndex < GRID_SIZE * GRID_SIZE) {
                const color = getVisibleLayerColorAtIndex(activeLayerPixels, floatingLayer, palette, pickedIndex);

                if (color) {
                    setCurrentColor(color);
                    if (currentTool === 'eraser') setTool('brush');
                } else {
                    setTool('eraser');
                }
            }

            finishEyedropper();
            setIsDrawing(false);
            setDragOrigin(null);
            pendingFillPixelRef.current = null; // Discard any pending fill
            resetShapeAssist();
        } else {
            // Normal Release
            // Check for pending fill execution (Safety Catch: User released quickly)
            if (currentTool === 'fill' && pendingFillPixelRef.current !== null) {
                fill(pendingFillPixelRef.current);
                pendingFillPixelRef.current = null;
            }
            clearPendingHold();
            clearShapeHint();
        }

        handleMouseUp();
        if (pointerType !== 'mouse') {
            clearTransientPointerState();
        }
    };

    const handlePointerCancel = (e: React.PointerEvent) => {
        if (e.pointerType === 'touch') publishPresenceCursor(null);
        if (e.currentTarget.hasPointerCapture(e.pointerId)) {
            e.currentTarget.releasePointerCapture(e.pointerId);
        }
        if (e.pointerType === 'touch') {
            removeTouchPointer(e.pointerId);
            if (getTouchPointerCount() < 2) {
                clearGestureTransform();
            }
            if (getTouchPointerCount() === 0) {
                stopGestureZooming();
                clearTransientPointerState();
            }
        }

        cancelActiveInteraction();
    };

    const editorSizeCss = `min(620px, 50vw, 70vh)`;

    const topStatusText = React.useMemo(() => {
        if (isEyedropperActive) return 'DROPPER TOOL';
        if (showDropperHint) return 'KEEP HOLDING STILL';

        if (currentTool === 'select' && isDrawing) {
            return 'SELECTION MASK TOOL: RELEASE TO CREATE A FLOATING STAMP';
        }
        if (currentTool === 'select' && selectedPixels.size === 0) {
            return 'SELECTION MASK TOOL';
        }
        if (currentTool === 'select' && selectedPixels.size > 0 && !isDrawing) {
            return 'PRESS ENTER TO STAMP OR HOLD ENTER THEN ARROW KEYS TO SMUDGE';
        }

        const hasStampMask = selectedPixels.size > 0;
        const isPaintLikeTool = currentTool === 'brush' || currentTool === 'eraser' || currentTool === 'fill';
        if (hasStampMask && isPaintLikeTool) {
            if (isDrawing && dragOrigin === 'inside') {
                return 'DRAWING ON STAMP MASK: ONLY THE STAMP IS EDITED';
            }
            if (isDrawing && dragOrigin === 'outside') {
                return 'DRAWING OUTSIDE MASK: STAMP STAYS UNCHANGED';
            }
            return 'STAMP MASK ACTIVE: DRAW ON THE STAMP TO EDIT IT';
        }

        if (shapeHintMode) {
            return `HOLD STILL FOR ${shapeHintMode.toUpperCase()}`;
        }
        if (brushSize === 1) return 'MOUSE WHEEL TO ZOOM';
        return isOverlayStacked ? 'CURRENTLY DRAWING ON TOP LAYER' : (editingLayer === 'base' ? 'BASE' : 'TOP');
    }, [
        isEyedropperActive,
        showDropperHint,
        currentTool,
        isDrawing,
        selectedPixels.size,
        dragOrigin,
        shapeHintMode,
        brushSize,
        isOverlayStacked,
        editingLayer
    ]);

    return (
        <div
            ref={containerRef}
            className="main-editor-container"
            onPointerLeave={handlePointerLeave}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerCancel}
        >
            {isEyedropperActive && pointerPos && eyedropperTargetIndex !== null && (
                <MagnifyingGlass
                    screenX={pointerPos.x}
                    screenY={pointerPos.y}
                    gridX={eyedropperTargetIndex % 32}
                    gridY={Math.floor(eyedropperTargetIndex / 32)}
                    pixelData={activeLayerPixels}
                    floatingLayer={floatingLayer}
                    palette={palette}
                    targetColor={eyedropperColor || null}
                />
            )}
            <div
                ref={workspaceRef}
                className="editor-workspace"
                style={{
                    '--editor-pan-x': `${panOffset.x}px`,
                    '--editor-pan-y': `${panOffset.y}px`,
                    '--editor-zoom': `${viewZoom}`,
                    '--inverse-zoom': `${1 / viewZoom}`,
                    '--editor-size': editorSizeCss
                } as EditorWorkspaceVars}
            >
                {editingLayer === 'top' && !isOverlayStacked && (
                    <div className="editor-layer-preview-column is-left">
                        <div className="editor-layer-label">BASE</div>
                        <div
                            className="layer-preview"
                            onPointerDown={(e) => { e.stopPropagation(); setActiveLayer('base'); }}
                        >
                            <canvas
                                ref={leftPreviewCanvasRef}
                                width={GRID_SIZE}
                                height={GRID_SIZE}
                                className="layer-preview-canvas"
                            />
                        </div>
                    </div>
                )}
                <div className="editor-main-column">
                    <div className="editor-layer-label is-active">
                        {topStatusText}
                    </div>
                    <div
                        ref={editorContainerRef}
                        className={`main-sprite-editor tool-${currentTool} ${selectedPixels.size > 0 ? 'has-selection' : ''} ${isPlaying ? 'playing' : ''} ${isOnionSkinning ? 'onion-on' : ''} ${isDrawing ? 'is-drawing' : ''} ${isDrawing && dragOrigin ? `drag-start-${dragOrigin}` : ''}`}
                        style={{
                            '--cursor-normal': cursorStyle.cursor,
                            '--cursor-faint': faintCursorStyle,
                            '--selection-cursor': selectionCursorStyle.cursor
                        } as EditorCanvasVars}
                    >
                        {/* Main pixel canvas — replaces the old DOM pixel grid */}
                        <canvas
                            ref={mainCanvasRef}
                            width={GRID_SIZE}
                            height={GRID_SIZE}
                            className="editor-canvas-layer editor-main-canvas"
                        />
                        {showStampAnimation && (
                            <canvas
                                ref={stampCanvasRef}
                                width={GRID_SIZE}
                                height={GRID_SIZE}
                                className="editor-canvas-layer editor-stamp-canvas stamp-animation-canvas"
                            />
                        )}
                        {/* Overlay canvas — selection, onion skin, line/circle previews, cursor highlight */}
                        {!isPlaying && (
                            <canvas
                                ref={overlayCanvasRef}
                                width={GRID_SIZE}
                                height={GRID_SIZE}
                                className="editor-canvas-layer editor-overlay-canvas"
                            />
                        )}
                        {/* Read-only preview of the peer's selection/drag — never wired to local editing state */}
                        {!isPlaying && (
                            <canvas
                                ref={peerSelectionCanvasRef}
                                width={GRID_SIZE}
                                height={GRID_SIZE}
                                className="editor-canvas-layer editor-peer-selection-canvas"
                            />
                        )}
                        <PresenceCursors />

                        {/* Dropper hold overlay — kept as DOM for CSS transitions */}
                        {dropperHoldOverlay && !isEyedropperActive && (
                            <div
                                className="dropper-hold-overlay"
                                style={{
                                    '--dropper-transition-ms': `${EYEDROPPER_HOLD_ANIMATION_MS}ms`
                                } as React.CSSProperties & Record<'--dropper-transition-ms', string>}
                            >
                                {dropperHoldOverlay.kind === 'cells' && dropperHoldOverlay.indices.map((idx) => (
                                    <div
                                        key={`dropper-hold-${idx}`}
                                        style={{
                                            '--dropper-left': `${(idx % GRID_SIZE) * (100 / GRID_SIZE)}%`,
                                            '--dropper-top': `${Math.floor(idx / GRID_SIZE) * (100 / GRID_SIZE)}%`,
                                            '--dropper-width': `${100 / GRID_SIZE}%`,
                                            '--dropper-height': `${100 / GRID_SIZE}%`
                                        } as DropperHoldCellVars}
                                        className="dropper-hold-cell"
                                    >
                                        <div
                                            style={{
                                                '--dropper-progress': `${dropperHoldOverlay.progress * 100}%`,
                                                '--dropper-color': dropperHoldOverlay.baseColors[idx] ?? 'var(--grid-bg)'
                                            } as DropperHoldFillVars}
                                            className="dropper-hold-fill"
                                        />
                                    </div>
                                ))}
                                {dropperHoldOverlay.kind === 'block' && (
                                    <div
                                        style={{
                                            '--dropper-left': `${dropperHoldOverlay.x * (100 / GRID_SIZE)}%`,
                                            '--dropper-top': `${dropperHoldOverlay.y * (100 / GRID_SIZE)}%`,
                                            '--dropper-width': `${dropperHoldOverlay.w * (100 / GRID_SIZE)}%`,
                                            '--dropper-height': `${dropperHoldOverlay.h * (100 / GRID_SIZE)}%`
                                        } as DropperHoldCellVars}
                                        className="dropper-hold-cell"
                                    >
                                        <div
                                            style={{
                                                '--dropper-progress': `${dropperHoldOverlay.progress * 100}%`,
                                                '--dropper-color': dropperHoldOverlay.baseColor ?? 'var(--grid-bg)'
                                            } as DropperHoldFillVars}
                                            className="dropper-hold-fill"
                                        />
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Shape hold countdown ring — keyed by cell so the sweep restarts on movement */}
                        {shapeHoldIndex !== null && (
                            <div className="shape-hold-overlay">
                                <div
                                    key={shapeHoldIndex}
                                    className="shape-hold-ring"
                                    style={{
                                        '--ring-left': `${((shapeHoldIndex % GRID_SIZE) + 0.5) * (100 / GRID_SIZE)}%`,
                                        '--ring-top': `${(Math.floor(shapeHoldIndex / GRID_SIZE) + 0.5) * (100 / GRID_SIZE)}%`,
                                        '--ring-delay': `${SHAPE_HOLD_RING_DELAY_MS}ms`,
                                        '--ring-sweep': `${SHAPE_HOLD_RING_SWEEP_MS}ms`,
                                        '--ring-color': currentColor ?? '#ffffff'
                                    } as React.CSSProperties}
                                />
                            </div>
                        )}
                    </div>
                    <button
                        ref={stackButtonRef}
                        className="secondary-btn-small editor-stack-button"
                        onPointerDown={(e) => {
                            e.stopPropagation();
                            setIsOverlayStacked(!isOverlayStacked);
                        }}
                    >
                        {isOverlayStacked ? 'Unstack Layers' : 'Stack Layers'}
                    </button>
                    <div
                        className="editor-frame-number"
                        aria-label={`Current frame ${activeSpriteIndex >= 0 ? activeSpriteIndex + 1 : 1}`}
                    >
                        {activeSpriteIndex >= 0 ? activeSpriteIndex + 1 : 1}
                    </div>
                </div>
                {editingLayer === 'base' && !isOverlayStacked && (
                    <div className="editor-layer-preview-column is-right">
                        <div className="editor-layer-label">TOP</div>
                        <div
                            className="layer-preview"
                            onPointerDown={(e) => { e.stopPropagation(); setActiveLayer('top'); }}
                        >
                            <canvas
                                ref={rightPreviewCanvasRef}
                                width={GRID_SIZE}
                                height={GRID_SIZE}
                                className="layer-preview-canvas"
                            />
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
