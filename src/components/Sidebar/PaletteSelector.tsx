import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, RotateCcw, X } from 'lucide-react';
import { useEditorUiStore } from '../../stores/editorStore';
import {
    loadCustomPalettes,
    loadHiddenPresetIds,
    nearestPaletteIndex,
    nextCustomPaletteName,
    normalizeHex,
    PRESET_PALETTES,
    saveCustomPalettes,
    saveHiddenPresetIds
} from '../../utils/palettes';
import type { PresetPalette } from '../../utils/palettes';
import { getCompositePixelData } from '../../utils/compositing';
import { getPixelColor, MAX_PALETTE_COLORS } from '../../utils/pixelData';
import { GRID_SIZE } from '../../types';
import type { Palette, PixelData, Sprite } from '../../types';
import type { PaletteSnapshot } from '../../stores/editor/types';

type SwatchVars = React.CSSProperties & Record<'--swatch-color', string>;

type Pending =
    | { kind: 'palette'; name: string; colors: string[] }
    | { kind: 'slots'; changes: { index: number; color: string }[] };

interface PaletteSelectorProps {
    onClose: () => void;
}

const toDraft = (colors: string[]) => colors.map(color => color.replace('#', '')).join('\n');

// The editable palette renders as fixed-height tables of 32 rows (matching the
// template columns); longer palettes wrap into additional tables side by side.
const TABLE_ROWS = 32;

const toTables = (lines: string[]): string[][] => {
    const tables: string[][] = [];
    for (let i = 0; i < lines.length; i += TABLE_ROWS) {
        tables.push(lines.slice(i, i + TABLE_ROWS));
    }
    return tables.length > 0 ? tables : [['']];
};

const takeSnapshot = (): PaletteSnapshot => {
    const state = useEditorUiStore.getState();
    return {
        palette: [...state.palette],
        presetCount: state.presetCount,
        layers: state.sprites.map(sprite => ({
            id: sprite.id,
            pixelData: sprite.pixelData.slice(),
            overlayPixelData: sprite.overlayPixelData.slice()
        }))
    };
};

const mapConvertColor = (
    value: number,
    color: string,
    previewColors: string[] | null,
    isSlotEdit: boolean
): string => {
    if (!previewColors) return color;
    if (isSlotEdit) {
        return value - 1 < previewColors.length ? previewColors[value - 1] : color;
    }
    return previewColors[nearestPaletteIndex(color, previewColors)];
};

const drawFrame = (
    canvas: HTMLCanvasElement | null,
    composite: PixelData,
    palette: Palette,
    mapColor: (value: number, color: string) => string
) => {
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    ctx.clearRect(0, 0, GRID_SIZE, GRID_SIZE);
    for (let index = 0; index < composite.length; index++) {
        const color = getPixelColor(composite, index, palette);
        if (!color) continue;
        ctx.fillStyle = mapColor(composite[index], color);
        ctx.fillRect(index % GRID_SIZE, Math.floor(index / GRID_SIZE), 1, 1);
    }
};

interface FrameThumbProps {
    sprite: Sprite;
    palette: Palette;
    index: number;
    isActive: boolean;
    onSelect: () => void;
}

const FrameThumb: React.FC<FrameThumbProps> = ({ sprite, palette, index, isActive, onSelect }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const composite = useMemo(() => getCompositePixelData(sprite), [sprite]);

    useEffect(() => {
        drawFrame(canvasRef.current, composite, palette, (_value, color) => color);
    }, [composite, palette]);

    return (
        <button
            type="button"
            className={`palette-frame-thumb ${isActive ? 'active' : ''}`}
            onClick={onSelect}
            title={`Frame ${index + 1}`}
        >
            <canvas ref={canvasRef} width={GRID_SIZE} height={GRID_SIZE} />
        </button>
    );
};

export const PaletteSelector: React.FC<PaletteSelectorProps> = ({ onClose }) => {
    const palette = useEditorUiStore(state => state.palette);
    const presetCount = useEditorUiStore(state => state.presetCount);
    const setPaletteColor = useEditorUiStore(state => state.setPaletteColor);
    const applyPalette = useEditorUiStore(state => state.applyPalette);
    const restorePaletteSnapshot = useEditorUiStore(state => state.restorePaletteSnapshot);
    const sprites = useEditorUiStore(state => state.sprites);
    const activeSpriteId = useEditorUiStore(state => state.activeSpriteId);
    const setActiveSpriteId = useEditorUiStore(state => state.setActiveSpriteId);
    const projectName = useEditorUiStore(state => state.projectName);
    const activeSprite = useEditorUiStore(
        state => state.sprites.find(sprite => sprite.id === state.activeSpriteId)
    );

    const currentColors = useMemo(() => palette.slice(0, presetCount), [palette, presetCount]);
    const [draft, setDraft] = useState(() => toDraft(currentColors));
    const [pending, setPending] = useState<Pending | null>(null);
    const [undoStack, setUndoStack] = useState<PaletteSnapshot[]>([]);
    const [copiedKey, setCopiedKey] = useState<string | null>(null);
    const [hoveredColor, setHoveredColor] = useState<string | null>(null);
    const [wasCapped, setWasCapped] = useState(false);
    const [customPalettes, setCustomPalettes] = useState<PresetPalette[]>(() => loadCustomPalettes());
    const [hiddenPresetIds, setHiddenPresetIds] = useState<string[]>(() => loadHiddenPresetIds());
    const [importError, setImportError] = useState<string | null>(null);
    // Non-null while the download-name prompt is open.
    const [downloadName, setDownloadName] = useState<string | null>(null);
    const keepCanvasRef = useRef<HTMLCanvasElement>(null);
    const convertCanvasRef = useRef<HTMLCanvasElement>(null);
    const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const importErrorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const tableRefs = useRef<(HTMLTextAreaElement | null)[]>([]);

    // Steps the active frame (wraps around); the previews follow it.
    const stepFrame = (delta: number) => {
        const index = sprites.findIndex(sprite => sprite.id === activeSpriteId);
        if (index === -1 || sprites.length < 2) return;
        setActiveSpriteId(sprites[(index + delta + sprites.length) % sprites.length].id);
    };

    // Re-sync the draft whenever the real palette changes (render-time
    // adjustment instead of an effect, per react.dev guidance).
    const [syncedColors, setSyncedColors] = useState(currentColors);
    if (syncedColors !== currentColors) {
        setSyncedColors(currentColors);
        setDraft(toDraft(currentColors));
        setWasCapped(false);
    }

    const cancelPending = () => {
        setPending(null);
        setDraft(toDraft(currentColors));
        setWasCapped(false);
    };

    useEffect(() => () => {
        if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
        if (importErrorTimerRef.current) clearTimeout(importErrorTimerRef.current);
    }, []);

    // All valid hex lines of the draft, or null while the draft has errors.
    const draftColors = useMemo(() => {
        const lines = draft.split('\n').map(line => line.trim()).filter(line => line !== '');
        const colors = lines.map(normalizeHex);
        if (lines.length === 0 || colors.some(color => color === null)) return null;
        return colors as string[];
    }, [draft]);

    const composite = useMemo(
        () => (activeSprite ? getCompositePixelData(activeSprite) : null),
        [activeSprite]
    );

    // "Keep art" preview: the frame exactly as it is.
    useEffect(() => {
        if (!composite) return;
        drawFrame(keepCanvasRef.current, composite, palette, (_value, color) => color);
    }, [composite, palette]);

    // "Convert art" preview, updated live: a pending preset takes priority,
    // otherwise the textarea draft drives it while typing. Same slot count as
    // the current palette means positional recolor (in-place swaps); a
    // different count previews the nearest-color conversion.
    const previewColors = pending?.kind === 'palette' ? pending.colors : draftColors;
    const isPreviewingChange = previewColors !== null
        && (pending !== null || draft !== toDraft(currentColors));

    const isSlotEdit = pending?.kind !== 'palette'
        && previewColors !== null
        && previewColors.length === currentColors.length;

    useEffect(() => {
        if (!composite) return;
        drawFrame(convertCanvasRef.current, composite, palette, (value, color) =>
            mapConvertColor(value, color, previewColors, isSlotEdit));
    }, [composite, palette, previewColors, isSlotEdit]);

    // Hovering a preview canvas highlights the hovered pixel's color wherever
    // it appears in the palettes (mapped color on the Convert canvas).
    const handleCanvasHover = (e: React.PointerEvent<HTMLCanvasElement>, mapped: boolean) => {
        if (!composite) {
            setHoveredColor(null);
            return;
        }
        const rect = e.currentTarget.getBoundingClientRect();
        const x = Math.floor(((e.clientX - rect.left) / rect.width) * GRID_SIZE);
        const y = Math.floor(((e.clientY - rect.top) / rect.height) * GRID_SIZE);
        if (x < 0 || x >= GRID_SIZE || y < 0 || y >= GRID_SIZE) {
            setHoveredColor(null);
            return;
        }
        const index = y * GRID_SIZE + x;
        const color = getPixelColor(composite, index, palette);
        setHoveredColor(color
            ? (mapped ? mapConvertColor(composite[index], color, previewColors, isSlotEdit) : color)
            : null);
    };

    const draftTables = toTables(draft.split('\n'));

    const handleTableChange = (tableIndex: number, value: string) => {
        const tables = toTables(draft.split('\n'));
        tables[tableIndex] = value.split('\n');
        // A paste with the caret at the end of a line runs codes together
        // (e.g. "c28569be4a2f") — split lines made of whole hex codes apart.
        const lines = tables.flat().flatMap(line => {
            const compact = line.trim().replace(/^#/, '');
            return compact.length > 6 && /^([0-9a-fA-F]{6})+$/.test(compact)
                ? compact.match(/.{6}/g) ?? [line]
                : [line];
        });
        // Pixel bytes reserve 0 for transparency, so a palette holds at most
        // 255 colors — drop pasted lines beyond that up front.
        setWasCapped(lines.length > MAX_PALETTE_COLORS);
        const capped = lines.slice(0, MAX_PALETTE_COLORS);
        setDraft(capped.join('\n'));

        // After the re-chunk renders: undo any horizontal scroll the paste
        // caused, and if the content overflowed this table, follow it — focus
        // the table where the pasted colors ended, caret at the end.
        const overflowed = value.split('\n').length > TABLE_ROWS;
        requestAnimationFrame(() => {
            tableRefs.current[tableIndex]?.scrollTo?.({ left: 0 });
            if (!overflowed) return;
            const lastTable = tableRefs.current[Math.floor((capped.length - 1) / TABLE_ROWS)];
            if (lastTable) {
                lastTable.focus();
                lastTable.setSelectionRange(lastTable.value.length, lastTable.value.length);
                lastTable.scrollLeft = 0;
            }
        });
    };

    // Commit only when focus leaves the whole editor group, so tabbing between
    // the tables of a long palette doesn't raise the prompt mid-edit.
    const handleTablesBlur = (e: React.FocusEvent<HTMLDivElement>) => {
        if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
        commitDraft();
    };

    const commitDraft = () => {
        if (!draftColors) {
            setDraft(toDraft(currentColors));
            return;
        }

        if (draftColors.length === currentColors.length) {
            const changes = draftColors
                .map((color, index) => ({ color, index }))
                .filter(({ color, index }) => color !== currentColors[index]);
            if (changes.length > 0) {
                setPending({ kind: 'slots', changes });
            }
            return;
        }

        // Different length: it's a new palette — ask how to treat existing art.
        setPending({ kind: 'palette', name: 'PASTED PALETTE', colors: draftColors });
    };

    const pushSnapshot = () => {
        setUndoStack(stack => [...stack, takeSnapshot()]);
    };

    const confirmSlotSwap = () => {
        if (pending?.kind !== 'slots') return;
        pushSnapshot();
        pending.changes.forEach(({ index, color }) => setPaletteColor(index, color));
        setPending(null);
    };

    const confirmApply = (mode: 'convert' | 'keep') => {
        if (pending?.kind !== 'palette') return;
        pushSnapshot();
        applyPalette(pending.colors, mode);
        setPending(null);
    };

    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                if (downloadName !== null) {
                    setDownloadName(null);
                } else if (pending) {
                    setPending(null);
                    setDraft(toDraft(currentColors));
                } else {
                    onClose();
                }
                return;
            }
            if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) return;
            if (e.key === 'Enter' && pending?.kind === 'slots') {
                confirmSlotSwap();
            }
            if (e.key === 'ArrowLeft') stepFrame(-1);
            if (e.key === 'ArrowRight') stepFrame(1);
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    });

    const handleUndo = () => {
        setUndoStack(stack => {
            const snapshot = stack[stack.length - 1];
            if (!snapshot) return stack;
            restorePaletteSnapshot(snapshot);
            return stack.slice(0, -1);
        });
        setPending(null);
    };

    const copyHex = (key: string, color: string) => {
        navigator.clipboard?.writeText(color.replace('#', ''));
        setCopiedKey(key);
        if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
        copiedTimerRef.current = setTimeout(() => setCopiedKey(null), 1000);
    };

    // --- Custom palettes + hidden built-ins (persisted in localStorage) ---

    const updateCustomPalettes = (next: PresetPalette[]) => {
        setCustomPalettes(next);
        saveCustomPalettes(next);
    };

    const updateHiddenPresets = (next: string[]) => {
        setHiddenPresetIds(next);
        saveHiddenPresetIds(next);
    };

    const addCustomPalette = (colors: string[], name?: string) => {
        updateCustomPalettes([
            {
                id: `custom-${Date.now()}`,
                name: name || nextCustomPaletteName(customPalettes),
                colors: [...colors]
            },
            ...customPalettes
        ]);
    };

    const showImportError = (message: string) => {
        setImportError(message);
        if (importErrorTimerRef.current) clearTimeout(importErrorTimerRef.current);
        importErrorTimerRef.current = setTimeout(() => setImportError(null), 4000);
    };

    // Import: pick a Lospec-style .hex file (one hex code per line) and add it
    // as a custom template. Does not apply it to the art.
    const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file) return;

        try {
            const text = await file.text();
            const colors = text
                .split(/\r?\n/)
                .map(line => line.trim())
                .filter(line => line !== '')
                .map(normalizeHex)
                .filter((color): color is string => color !== null);

            if (colors.length === 0) {
                showImportError(`No hex colors found in ${file.name}`);
                return;
            }
            const name = file.name.replace(/\.hex$/i, '').trim();
            addCustomPalette(colors.slice(0, MAX_PALETTE_COLORS), name || undefined);
        } catch {
            showImportError(`Could not read ${file.name}`);
        }
    };

    // Download: save the current palette as a Lospec-compatible .hex file,
    // after asking for a file name.
    const confirmDownload = () => {
        const name = downloadName?.trim();
        if (!name) return;

        const content = currentColors.map(color => color.replace('#', '')).join('\n');
        const blob = new Blob([content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = `${name}.hex`;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        URL.revokeObjectURL(url);
        setDownloadName(null);
    };

    const handleDeleteTemplate = (preset: PresetPalette, isCustom: boolean) => {
        if (isCustom) {
            updateCustomPalettes(customPalettes.filter(palette => palette.id !== preset.id));
        } else {
            updateHiddenPresets([...hiddenPresetIds, preset.id]);
        }
    };

    const visiblePresets = PRESET_PALETTES.filter(preset => !hiddenPresetIds.includes(preset.id));

    return createPortal(
        <div className="palette-selector-overlay">
            <div className="palette-selector-header">
                <h2>Palettes</h2>
                <div className="palette-frames-bar">
                    <button
                        type="button"
                        className="secondary-btn-small"
                        onClick={() => stepFrame(-1)}
                        disabled={sprites.length < 2}
                        aria-label="Previous frame"
                    >
                        <ChevronLeft size={14} />
                    </button>
                    <div className="palette-frames-strip">
                        {sprites.map((sprite, index) => (
                            <FrameThumb
                                key={sprite.id}
                                sprite={sprite}
                                palette={palette}
                                index={index}
                                isActive={sprite.id === activeSpriteId}
                                onSelect={() => setActiveSpriteId(sprite.id)}
                            />
                        ))}
                    </div>
                    <button
                        type="button"
                        className="secondary-btn-small"
                        onClick={() => stepFrame(1)}
                        disabled={sprites.length < 2}
                        aria-label="Next frame"
                    >
                        <ChevronRight size={14} />
                    </button>
                </div>
                <button
                    type="button"
                    className="palette-selector-close"
                    onClick={onClose}
                    aria-label="Close palette selector"
                >
                    <X size={18} />
                </button>
            </div>

            <div className="palette-selector-body">
                <aside className="palette-canvas-preview">
                    <div className="palette-previews-row">
                        <div className="palette-preview-block">
                            <div className="palette-column-title">Convert art</div>
                            <canvas
                                ref={convertCanvasRef}
                                width={GRID_SIZE}
                                height={GRID_SIZE}
                                className={isPreviewingChange ? 'previewing' : ''}
                                onPointerMove={(e) => handleCanvasHover(e, true)}
                                onPointerLeave={() => setHoveredColor(null)}
                            />
                        </div>
                        <div className="palette-preview-block">
                            <div className="palette-column-title">Keep art</div>
                            <canvas
                                ref={keepCanvasRef}
                                width={GRID_SIZE}
                                height={GRID_SIZE}
                                onPointerMove={(e) => handleCanvasHover(e, false)}
                                onPointerLeave={() => setHoveredColor(null)}
                            />
                        </div>
                    </div>

                    <button
                        type="button"
                        className="secondary-btn-small palette-undo-btn"
                        onClick={handleUndo}
                        disabled={undoStack.length === 0}
                    >
                        <RotateCcw size={12} />
                        Undo palette change
                    </button>

                    <div className="palette-manual">
                        <div className="palette-column-title">How it works</div>
                        <ul>
                            <li>Both canvases preview the outcome live before you confirm.</li>
                            <li>Hover a preview to highlight that pixel's color in the palettes.</li>
                        </ul>
                    </div>
                </aside>

                <div className="palette-selector-columns">
                    <div
                        className="palette-column palette-column-current"
                        onBlur={handleTablesBlur}
                        style={{ gridColumn: `span ${draftTables.length}` }}
                    >
                        <div className="palette-column-title">Current · editable</div>
                        <div className="palette-hex-tables">
                            {draftTables.map((tableLines, tableIndex) => (
                                <div className="palette-hex-editor" key={tableIndex}>
                                    <div className="palette-hex-gutter">
                                        {tableLines.map((line, index) => {
                                            const color = normalizeHex(line);
                                            const isHighlighted = color !== null && color === hoveredColor;
                                            return (
                                                <span
                                                    key={index}
                                                    className={`palette-hex-gutter-swatch ${color ? '' : 'invalid'} ${isHighlighted ? 'highlight' : ''}`}
                                                    style={color ? ({ '--swatch-color': color } as SwatchVars) : undefined}
                                                />
                                            );
                                        })}
                                    </div>
                                    <textarea
                                        ref={(el) => { tableRefs.current[tableIndex] = el; }}
                                        className="palette-hex-textarea"
                                        value={tableLines.join('\n')}
                                        rows={Math.max(tableLines.length, 1)}
                                        spellCheck={false}
                                        autoComplete="off"
                                        wrap="off"
                                        onChange={(e) => handleTableChange(tableIndex, e.target.value)}
                                    />
                                </div>
                            ))}
                        </div>
                        {wasCapped && (
                            <div className="palette-cap-note">
                                Palette limit is {MAX_PALETTE_COLORS} colors — extra lines were dropped
                            </div>
                        )}
                        <div className="palette-column-actions">
                            <button
                                type="button"
                                className="secondary-btn-small"
                                title="Download the current palette as a .hex file"
                                onClick={() => setDownloadName(`${projectName || 'palette'}_palette`)}
                            >
                                Download
                            </button>
                            <button
                                type="button"
                                className="secondary-btn-small"
                                title="Import a .hex palette file as a template"
                                onClick={() => fileInputRef.current?.click()}
                            >
                                Import
                            </button>
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept=".hex,text/plain"
                                className="hidden-file-input"
                                onChange={handleImportFile}
                            />
                        </div>
                        {importError && (
                            <div className="palette-cap-note">{importError}</div>
                        )}
                    </div>

                    <div className="palette-column palette-column-hints">
                        <div className="palette-column-title">Hints</div>
                        <div className="palette-hints-body">
                            <div className="palette-hints-group">
                                <div className="palette-hints-heading">Current</div>
                                <p>Edit a line to swap that exact color everywhere it's painted — you confirm first.</p>
                                <p>Paste any hex list to convert to it — one code per line, # optional, up to {MAX_PALETTE_COLORS} colors.</p>
                            </div>
                            <div className="palette-hints-group">
                                <div className="palette-hints-heading">.hex files</div>
                                <p>Import adds a Lospec-style .hex file as a template.</p>
                                <p>Download saves your palette as one — share it or re-import later.</p>
                            </div>
                            <div className="palette-hints-group">
                                <div className="palette-hints-heading">Templates</div>
                                <p>Select applies: Convert restyles your art to the nearest colors, Keep leaves it untouched.</p>
                                <p>Click any color to copy its hex.</p>
                            </div>
                            <div className="palette-hints-group palette-hints-hotkeys">
                                <div className="palette-hints-heading">Hotkeys</div>
                                <p>← / → — switch frame</p>
                                <p>1–8 — pick frame · 9 / 0 — prev / next batch</p>
                                <p>Space — play / pause</p>
                                <p>Enter — apply a color swap</p>
                                <p>Esc — cancel / close</p>
                            </div>
                            {hiddenPresetIds.length > 0 && (
                                <button
                                    type="button"
                                    className="secondary-btn-small"
                                    onClick={() => updateHiddenPresets([])}
                                >
                                    Restore built-ins
                                </button>
                            )}
                        </div>
                    </div>

                    {[
                        ...customPalettes.map(preset => ({ preset, isCustom: true })),
                        ...visiblePresets.map(preset => ({ preset, isCustom: false }))
                    ].map(({ preset, isCustom }) => (
                        // Palettes beyond 32 colors grow wider (extra 32-row
                        // tables), spanning whole grid tracks to keep alignment.
                        <div
                            key={preset.id}
                            className="palette-column palette-column-preset"
                            style={{ gridColumn: `span ${toTables(preset.colors).length}` }}
                        >
                            <div
                                className="palette-column-title"
                                title={preset.author ? `${preset.name} — ${preset.author}` : preset.name}
                            >
                                {preset.name}
                            </div>
                            <div className="palette-preset-tables">
                                {toTables(preset.colors).map((tableColors, tableIndex) => (
                                    <div className="palette-preset-list" key={tableIndex}>
                                        {tableColors.map((color, index) => {
                                            const key = `${preset.id}-${tableIndex * TABLE_ROWS + index}`;
                                            const isHighlighted = color === hoveredColor;
                                            return (
                                                <button
                                                    key={key}
                                                    type="button"
                                                    className={`palette-preset-row ${isHighlighted ? 'highlight' : ''}`}
                                                    onClick={() => copyHex(key, color)}
                                                    title={`Copy ${color}`}
                                                >
                                                    <span
                                                        className={`palette-hex-gutter-swatch ${isHighlighted ? 'highlight' : ''}`}
                                                        style={{ '--swatch-color': color } as SwatchVars}
                                                    />
                                                    <span className={`palette-preset-hex ${copiedKey === key ? 'copied' : ''}`}>
                                                        {copiedKey === key ? 'copied' : color.replace('#', '')}
                                                    </span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                ))}
                            </div>
                            <div className="palette-column-actions">
                                <button
                                    type="button"
                                    className="secondary-btn-small"
                                    onClick={() => setPending({ kind: 'palette', name: preset.name, colors: preset.colors })}
                                >
                                    Select
                                </button>
                                <button
                                    type="button"
                                    className="secondary-btn-small palette-danger"
                                    title={isCustom ? 'Delete this custom template' : 'Remove this template (restorable via Hints)'}
                                    onClick={() => handleDeleteTemplate(preset, isCustom)}
                                >
                                    Delete
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {pending?.kind === 'slots' && (
                <div className="palette-apply-bar">
                    <span className="palette-apply-label">
                        Swap {pending.changes.length} color{pending.changes.length === 1 ? '' : 's'} in place?
                    </span>
                    <button type="button" className="secondary-btn-small" onClick={confirmSlotSwap}>
                        Apply
                    </button>
                    <button type="button" className="secondary-btn-small" onClick={cancelPending}>
                        Cancel
                    </button>
                </div>
            )}

            {downloadName !== null && (
                <div className="palette-apply-bar">
                    <span className="palette-apply-label">Download as</span>
                    <input
                        className="palette-download-input"
                        value={downloadName}
                        autoFocus
                        spellCheck={false}
                        autoComplete="off"
                        onChange={(e) => setDownloadName(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') confirmDownload();
                        }}
                    />
                    <span className="palette-apply-label">.hex</span>
                    <button
                        type="button"
                        className="secondary-btn-small"
                        onClick={confirmDownload}
                        disabled={!downloadName.trim()}
                    >
                        Download
                    </button>
                    <button type="button" className="secondary-btn-small" onClick={() => setDownloadName(null)}>
                        Cancel
                    </button>
                </div>
            )}

            {pending?.kind === 'palette' && (
                <div className="palette-apply-bar">
                    <span className="palette-apply-label">Apply {pending.name}?</span>
                    <button type="button" className="secondary-btn-small" onClick={() => confirmApply('convert')}>
                        Convert art
                    </button>
                    <button type="button" className="secondary-btn-small" onClick={() => confirmApply('keep')}>
                        Keep art
                    </button>
                    <button type="button" className="secondary-btn-small" onClick={cancelPending}>
                        Cancel
                    </button>
                </div>
            )}
        </div>,
        document.body
    );
};
