import React, { useEffect, useRef, useState } from 'react';
import type { LayerExportMode } from '../../utils/export';
import { selectActiveSprite } from '../../stores/editorSelectors';
import { useEditorUiStore } from '../../stores/editorStore';

interface ImportExportMenuProps {
    selectedSpriteIds: Set<string>;
    setSelectedSpriteIds: React.Dispatch<React.SetStateAction<Set<string>>>;
    setIsSelectionMode: React.Dispatch<React.SetStateAction<boolean>>;
    hideImport?: boolean;
}

export const ImportExportMenu: React.FC<ImportExportMenuProps> = ({
    selectedSpriteIds,
    setSelectedSpriteIds,
    setIsSelectionMode,
    hideImport = false
}) => {
    const [openMenu, setOpenMenu] = useState<'import' | 'export' | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const projectInputRef = useRef<HTMLInputElement>(null);

    const saveProject = useEditorUiStore(state => state.saveProject);
    const loadProject = useEditorUiStore(state => state.loadProject);
    const exportFrame = useEditorUiStore(state => state.exportFrame);
    const exportFrameJSON = useEditorUiStore(state => state.exportFrameJSON);
    const exportSpriteSheet = useEditorUiStore(state => state.exportSpriteSheet);
    const exportSelectedJSON = useEditorUiStore(state => state.exportSelectedJSON);
    const exportSelectedPNG = useEditorUiStore(state => state.exportSelectedPNG);
    const exportGIF = useEditorUiStore(state => state.exportGIF);
    const importMultipleFromJSON = useEditorUiStore(state => state.importMultipleFromJSON);
    const activeSprite = useEditorUiStore(selectActiveSprite);
    const sprites = useEditorUiStore(state => state.sprites);
    const notify = useEditorUiStore(state => state.notify);
    const layerExportMode = useEditorUiStore(state => state.layerExportMode);
    const setLayerExportMode = useEditorUiStore(state => state.setLayerExportMode);
    const projectName = useEditorUiStore(state => state.projectName);
    const setProjectName = useEditorUiStore(state => state.setProjectName);

    // Close menu when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setOpenMenu(null);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const toggleMenu = (menu: 'import' | 'export') => {
        setOpenMenu(prev => prev === menu ? null : menu);
    };

    const handleImportJSON = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const fileList = e.target.files;
        if (!fileList || fileList.length === 0) return;
        const filesArray = Array.from(fileList).sort((a, b) => a.name.localeCompare(b.name));
        try {
            const results = await Promise.all(
                filesArray.map(file => {
                    return new Promise<{ name: string; pixels: (string | null)[]; overlayPixels?: (string | null)[] }[]>((resolve, reject) => {
                        const reader = new FileReader();
                        reader.onload = (event) => {
                            try {
                                const json = JSON.parse(event.target?.result as string);
                                if (Array.isArray(json)) {
                                    // Handle new format where export is an array of frames
                                    resolve(json);
                                } else if (json.pixels) {
                                    // Handle legacy / single-frame format
                                    resolve([{ name: file.name, pixels: json.pixels, overlayPixels: json.overlayPixels }]);
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
            const importedIds = importMultipleFromJSON(results.flat());
            // Automatically select all newly imported frames so the user can easily manipulate or move them together
            if (importedIds && importedIds.length > 0) {
                setSelectedSpriteIds(new Set(importedIds));
                setIsSelectionMode(true);
            }
        } catch (err) {
            console.error('Failed to parse JSON import:', err);
            notify('One or more invalid JSON files');
        }
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
        setOpenMenu(null);
    };

    const handleLoadProject = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        try {
            if (file) {
                const { proposeWholesaleChange } = await import('../../collab/session');
                const bytes = await file.arrayBuffer();
                const digest = await crypto.subtle.digest('SHA-256', bytes);
                const contentHash = Array.from(new Uint8Array(digest), byte => (
                    byte.toString(16).padStart(2, '0')
                )).join('');
                const result = await proposeWholesaleChange('load-project', {
                    fileName: file.name,
                    fileSize: file.size,
                    contentHash
                });
                if (result.approved) {
                    await loadProject(file, { id: result.id, kind: 'load-project' });
                } else {
                    notify('Project replacement was not approved', 'info');
                }
            }
        } catch (error) {
            notify(error instanceof Error ? error.message : 'Could not load project');
        } finally {
            if (projectInputRef.current) projectInputRef.current.value = '';
            setOpenMenu(null);
        }
    };

    return (
        <div ref={containerRef} className="import-export-menu">
            {/* Import Button & File Input */}
            {!hideImport && (
                <div className="import-export-trigger">
                    <button className="secondary-btn-small" onClick={() => toggleMenu('import')}>
                        Import ▾
                    </button>
                    <input
                        type="file"
                        accept=".json"
                        className="hidden-file-input"
                        ref={fileInputRef}
                        onChange={handleImportJSON}
                        multiple
                    />
                    <input
                        type="file"
                        accept=".json"
                        className="hidden-file-input"
                        ref={projectInputRef}
                        onChange={(e) => { void handleLoadProject(e); }}
                    />
                    {openMenu === 'import' && (
                        <div className="import-export-dropdown">
                            <button
                                className="menu-action primary"
                                onClick={() => projectInputRef.current?.click()}
                            >
                                Load Project (.json)
                            </button>

                            <div className="menu-divider" />

                            <button
                                className="menu-action"
                                onClick={() => fileInputRef.current?.click()}
                            >
                                Import Frames (.json)
                            </button>
                        </div>
                    )}
                </div>
            )}

            {/* Export Menu */}
            <div className="import-export-trigger">
                <button className="secondary-btn-small" onClick={() => toggleMenu('export')}>
                    {selectedSpriteIds.size > 0 ? 'Export Selected ▾' : 'Export ▾'}
                </button>
                {openMenu === 'export' && (
                    <div className="import-export-dropdown wide">
                        {selectedSpriteIds.size === 0 && (
                            <>
                                <input
                                    type="text"
                                    className="project-name-input"
                                    value={projectName}
                                    onChange={(e) => setProjectName(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                            e.currentTarget.blur();
                                        }
                                    }}
                                    placeholder="Project Name"
                                />
                                <button
                                    className="menu-action primary"
                                    onClick={() => { saveProject(projectName); setOpenMenu(null); }}
                                >
                                    Save Project (.json)
                                </button>

                                <div className="menu-divider" />
                            </>
                        )}

                        <div className="menu-label">Target Layer:</div>
                        <select
                            value={layerExportMode}
                            onChange={(e) => setLayerExportMode(e.target.value as LayerExportMode)}
                            className="menu-select"
                        >
                            <option value="merged">Merged Image</option>
                            <option value="base">Base Layer</option>
                            <option value="top">Top Layer</option>
                        </select>
                        {selectedSpriteIds.size === 0 ? (
                            <>
                                <button
                                    className="menu-action"
                                    onClick={() => {
                                        if (activeSprite) {
                                            exportFrame(projectName, layerExportMode);
                                        }
                                        setOpenMenu(null);
                                    }}
                                >
                                    Export Frame (.png)
                                </button>
                                <button
                                    className="menu-action"
                                    onClick={() => {
                                        if (activeSprite) {
                                            exportFrameJSON(projectName, layerExportMode);
                                        }
                                        setOpenMenu(null);
                                    }}
                                >
                                    Export Frame (.json)
                                </button>
                            </>
                        ) : (
                            <>
                                <button
                                    className="menu-action"
                                    onClick={() => {
                                        const spritesToExport = sprites.filter(s => selectedSpriteIds.has(s.id));
                                        exportSelectedPNG(projectName, layerExportMode, spritesToExport);
                                        setOpenMenu(null);
                                    }}
                                >
                                    Export Selected (.png)
                                </button>
                                <button
                                    className="menu-action"
                                    onClick={() => {
                                        const spritesToExport = sprites.filter(s => selectedSpriteIds.has(s.id));
                                        exportSelectedJSON(projectName, layerExportMode, spritesToExport);
                                        setOpenMenu(null);
                                    }}
                                >
                                    Export Selected (.json)
                                </button>
                            </>
                        )}
                        {selectedSpriteIds.size === 0 && (
                            <>
                                <button
                                    className="menu-action"
                                    onClick={() => { exportSpriteSheet(projectName, layerExportMode); setOpenMenu(null); }}
                                >
                                    Export Sheet (.png)
                                </button>
                                <button
                                    className="menu-action"
                                    onClick={() => { exportGIF(projectName, layerExportMode); setOpenMenu(null); }}
                                >
                                    Export Animation (.gif)
                                </button>
                            </>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};
