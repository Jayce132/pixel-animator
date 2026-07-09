import { useEffect, useRef } from 'react';
import Mousetrap from 'mousetrap';
import { useEditorUiStore } from '../stores/editorStore';

const NUDGE_ACTIONS = ['left', 'right', 'up', 'down'] as const;
type NudgeAction = typeof NUDGE_ACTIONS[number];
type NudgeRepeatState = {
    startedAt: number;
    nextAt: number;
};

const NUDGE_VECTOR: Record<NudgeAction, { dx: number; dy: number }> = {
    left: { dx: -1, dy: 0 },
    right: { dx: 1, dy: 0 },
    up: { dx: 0, dy: -1 },
    down: { dx: 0, dy: 1 }
};

const isNudgeAction = (action: string): action is NudgeAction => (
    (NUDGE_ACTIONS as readonly string[]).includes(action)
);

const getNudgeRepeatDelay = (heldForMs: number) => {
    if (heldForMs < 260) return 220;
    if (heldForMs < 520) return 130;
    if (heldForMs < 850) return 85;
    if (heldForMs < 1200) return 60;
    if (heldForMs < 1800) return 40;
    return 20;
};

export const useKeyboardShortcuts = () => {
    const setTool = useEditorUiStore(state => state.setTool);
    const undo = useEditorUiStore(state => state.undo);
    const redo = useEditorUiStore(state => state.redo);
    const setBrushSize = useEditorUiStore(state => state.setBrushSize);
    const isPlaying = useEditorUiStore(state => state.isPlaying);
    const setIsPlaying = useEditorUiStore(state => state.setIsPlaying);
    const stamp = useEditorUiStore(state => state.stamp);
    const activeSpriteId = useEditorUiStore(state => state.activeSpriteId);
    const setActiveSpriteId = useEditorUiStore(state => state.setActiveSpriteId);
    const sprites = useEditorUiStore(state => state.sprites);
    const selectedPixelsSize = useEditorUiStore(state => state.selectedPixels.size);
    const floatingLayerSize = useEditorUiStore(state => state.floatingLayer.size);
    const clearSelection = useEditorUiStore(state => state.clearSelection);
    const nudgeSelection = useEditorUiStore(state => state.nudgeSelection);
    const flipSelectionHorizontal = useEditorUiStore(state => state.flipSelectionHorizontal);
    const flipSelectionVertical = useEditorUiStore(state => state.flipSelectionVertical);
    const rotateSelectionLeft = useEditorUiStore(state => state.rotateSelectionLeft);
    const rotateSelectionRight = useEditorUiStore(state => state.rotateSelectionRight);
    const clearCanvas = useEditorUiStore(state => state.clearCanvas);
    const commitHistory = useEditorUiStore(state => state.commitHistory);
    const setActiveActions = useEditorUiStore(state => state.setActiveActions);
    const activeLayer = useEditorUiStore(state => state.activeLayer);
    const floatingLayerSignature = useEditorUiStore(state => (
        Array.from(state.floatingLayer.entries())
            .sort(([a], [b]) => a - b)
            .map(([index, color]) => `${index}:${color}`)
            .join('|')
    ));
    const activeActionsRef = useRef(new Set<string>());
    const stationaryStampKeyRef = useRef<string | null>(null);
    const nudgeRepeatStateRef = useRef(new Map<NudgeAction, NudgeRepeatState>());
    const animationFrameRef = useRef<number | null>(null);

    // Refs for current state to avoid stale closures in the loop
    const stateRefs = useRef({
        selectedPixelsSize,
        floatingLayerSize,
        activeLayer,
        activeSpriteId,
        floatingLayerSignature,
        nudgeSelection,
        stamp,
        commitHistory
    });

    useEffect(() => {
        stateRefs.current = {
            selectedPixelsSize,
            floatingLayerSize,
            activeLayer,
            activeSpriteId,
            floatingLayerSignature,
            nudgeSelection,
            stamp,
            commitHistory
        };
    }, [
        selectedPixelsSize,
        floatingLayerSize,
        activeLayer,
        activeSpriteId,
        floatingLayerSignature,
        nudgeSelection,
        stamp,
        commitHistory
    ]);

    useEffect(() => {
        const getDueNudgeStep = (actions: Set<string>, timestamp: number) => {
            let dx = 0;
            let dy = 0;
            let hasDueNudge = false;

            for (const action of NUDGE_ACTIONS) {
                if (!actions.has(action)) {
                    nudgeRepeatStateRef.current.delete(action);
                    continue;
                }

                let repeatState = nudgeRepeatStateRef.current.get(action);
                if (!repeatState) {
                    repeatState = { startedAt: timestamp, nextAt: 0 };
                    nudgeRepeatStateRef.current.set(action, repeatState);
                }

                if (timestamp < repeatState.nextAt) continue;

                const vector = NUDGE_VECTOR[action];
                dx += vector.dx;
                dy += vector.dy;
                hasDueNudge = true;
                repeatState.nextAt = timestamp + getNudgeRepeatDelay(timestamp - repeatState.startedAt);
            }

            return {
                dx,
                dy,
                hasNudgeInput: NUDGE_ACTIONS.some(action => actions.has(action)),
                hasNudgeStep: hasDueNudge && (dx !== 0 || dy !== 0)
            };
        };

        const gameLoop = (timestamp: number) => {
            const {
                selectedPixelsSize,
                floatingLayerSize,
                activeLayer,
                activeSpriteId,
                floatingLayerSignature,
                nudgeSelection,
                stamp
            } = stateRefs.current;
            const actions = activeActionsRef.current;
            const stationaryStampKey = `${activeSpriteId}:${activeLayer}:${floatingLayerSignature}`;

            if (selectedPixelsSize > 0) {
                const { dx, dy, hasNudgeInput, hasNudgeStep } = getDueNudgeStep(actions, timestamp);

                if (hasNudgeStep) {
                    nudgeSelection(dx, dy);
                    // Auto-stamp if holding enter/stamp AND floating layer exists
                    if (actions.has('stamp') && floatingLayerSize > 0) {
                        stamp(false, false);
                        stationaryStampKeyRef.current = stationaryStampKey;
                    }
                } else if (!hasNudgeInput && actions.has('stamp') && floatingLayerSize > 0) {
                    // Just stamping, no movement. Apply once per frame/stamp state
                    // so the stamp animation does not replay every tick.
                    if (stationaryStampKeyRef.current !== stationaryStampKey) {
                        stamp(false);
                        stationaryStampKeyRef.current = stationaryStampKey;
                    }
                }
            }
            animationFrameRef.current = requestAnimationFrame(gameLoop);
        };

        animationFrameRef.current = requestAnimationFrame(gameLoop);

        return () => {
            if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
        };
    }, []);

    useEffect(() => {
        // Helper to safely bind/unbind continuous actions
        const notifyActionsChanged = () => {
            setActiveActions(Array.from(activeActionsRef.current));
        };

        const bindAction = (key: string | string[], action: string) => {
            Mousetrap.bind(key, (e) => {
                e.preventDefault();
                if (!activeActionsRef.current.has(action)) {
                    activeActionsRef.current.add(action);
                    notifyActionsChanged();
                }
            }, 'keydown');
            Mousetrap.bind(key, (e) => {
                e.preventDefault();
                if (activeActionsRef.current.has(action)) {
                    activeActionsRef.current.delete(action);
                    if (isNudgeAction(action)) {
                        nudgeRepeatStateRef.current.delete(action);
                    }
                    notifyActionsChanged();
                    if (action === 'stamp') {
                        stationaryStampKeyRef.current = null;
                        stateRefs.current.commitHistory();
                    }
                }
            }, 'keyup');
        };

        const bindSingleUIAction = (key: string | string[], action: string, callback: (e: KeyboardEvent) => void) => {
            Mousetrap.bind(key, (e) => {
                if (!activeActionsRef.current.has(action)) {
                    activeActionsRef.current.add(action);
                    notifyActionsChanged();
                    callback(e);
                }
            }, 'keydown');
            Mousetrap.bind(key, () => {
                if (activeActionsRef.current.has(action)) {
                    activeActionsRef.current.delete(action);
                    notifyActionsChanged();
                }
            }, 'keyup');
        };

        // Continuous actions (Game Loop powered)
        bindAction('left', 'left');
        bindAction('right', 'right');
        bindAction('up', 'up');
        bindAction('down', 'down');
        bindAction('enter', 'stamp');

        // Note: Mousetrap automatically handles preventing defaults
        // and ignoring inputs inside of textareas/inputs by default!

        // Tools (Single Press)
        Mousetrap.bind('b', () => setTool('brush'));
        Mousetrap.bind('e', () => setTool('eraser'));
        Mousetrap.bind(['f', 'g'], () => setTool('fill'));
        Mousetrap.bind(['s', 'm'], () => setTool('select'));

        // Brush Size
        Mousetrap.bind('[', () => setBrushSize(1));
        Mousetrap.bind(']', () => setBrushSize(2));

        // Transport
        Mousetrap.bind('space', (e) => { e.preventDefault(); setIsPlaying(!isPlaying); });

        // Selection Actions
        Mousetrap.bind('esc', () => {
            if (selectedPixelsSize > 0) clearSelection();
        });
        bindSingleUIAction('r', 'rotR', (e) => {
            if (selectedPixelsSize > 0) {
                e.preventDefault();
                rotateSelectionRight();
                if (activeActionsRef.current.has('stamp')) stateRefs.current.stamp(false);
            }
        });
        bindSingleUIAction('shift+r', 'rotL', (e) => {
            if (selectedPixelsSize > 0) {
                e.preventDefault();
                rotateSelectionLeft();
                if (activeActionsRef.current.has('stamp')) stateRefs.current.stamp(false);
            }
        });
        bindSingleUIAction('shift+h', 'flipH', (e) => {
            if (selectedPixelsSize > 0) {
                e.preventDefault();
                flipSelectionHorizontal();
                if (activeActionsRef.current.has('stamp')) stateRefs.current.stamp(false);
            }
        });
        bindSingleUIAction('shift+v', 'flipV', (e) => {
            if (selectedPixelsSize > 0) {
                e.preventDefault();
                flipSelectionVertical();
                if (activeActionsRef.current.has('stamp')) stateRefs.current.stamp(false);
            }
        });

        // Timeline Navigation
        Mousetrap.bind([',', '<'], (e) => {
            e.preventDefault();
            const idx = sprites.findIndex(s => s.id === activeSpriteId);
            if (idx !== -1) {
                const count = sprites.length;
                setActiveSpriteId(sprites[(idx - 1 + count) % count].id);
            }
        });
        Mousetrap.bind(['.', '>'], (e) => {
            e.preventDefault();
            const idx = sprites.findIndex(s => s.id === activeSpriteId);
            if (idx !== -1) {
                setActiveSpriteId(sprites[(idx + 1) % sprites.length].id);
            }
        });

        // Undo / Redo
        Mousetrap.bind('mod+z', (e) => { e.preventDefault(); undo(); });
        Mousetrap.bind('mod+shift+z', (e) => { e.preventDefault(); redo(); });
        Mousetrap.bind('mod+y', (e) => { e.preventDefault(); redo(); });

        // Deselect
        Mousetrap.bind('mod+d', (e) => {
            if (selectedPixelsSize > 0) {
                e.preventDefault();
                clearSelection();
                setTool('brush');
            }
        });

        // Delete
        Mousetrap.bind(['backspace', 'del'], () => clearCanvas());

        const handleWindowBlur = () => {
            if (activeActionsRef.current.size > 0) {
                activeActionsRef.current.clear();
                stationaryStampKeyRef.current = null;
                nudgeRepeatStateRef.current.clear();
                notifyActionsChanged();
            }
        };

        const handleVirtualKeyPress = (e: Event) => {
            const customEvent = e as CustomEvent<{ action: string, type: 'down' | 'up' }>;
            const { action, type } = customEvent.detail;

            if (type === 'down') {
                if (!activeActionsRef.current.has(action)) {
                    activeActionsRef.current.add(action);
                    notifyActionsChanged();
                }
            } else {
                if (activeActionsRef.current.has(action)) {
                    activeActionsRef.current.delete(action);
                    if (isNudgeAction(action)) {
                        nudgeRepeatStateRef.current.delete(action);
                    }
                    notifyActionsChanged();
                    if (action === 'stamp') {
                        stationaryStampKeyRef.current = null;
                        stateRefs.current.commitHistory();
                    }
                }
            }
        };

        window.addEventListener('blur', handleWindowBlur);
        window.addEventListener('virtual-key', handleVirtualKeyPress);

        return () => {
            Mousetrap.reset();
            window.removeEventListener('blur', handleWindowBlur);
            window.removeEventListener('virtual-key', handleVirtualKeyPress);
        };
    }, [
        setTool,
        undo,
        redo,
        setBrushSize,
        isPlaying,
        setIsPlaying,
        stamp,
        activeSpriteId,
        setActiveSpriteId,
        sprites,
        selectedPixelsSize,
        clearSelection,
        nudgeSelection,
        flipSelectionHorizontal,
        flipSelectionVertical,
        rotateSelectionLeft,
        rotateSelectionRight,
        clearCanvas,
        setActiveActions
    ]);
};
