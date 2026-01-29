import React from 'react';
import { useEditor } from '../../contexts/EditorContext';
import { RecentColors } from './RecentColors';
import { PaletteGrid } from './PaletteGrid';
import { SelectionTools } from './SelectionTools';
import { EditorControls } from './EditorControls';

export const Sidebar: React.FC = () => {
    const { selectedPixels } = useEditor();

    return (
        <aside className="panel tools-panel" style={{ width: '200px' }}>
            <EditorControls />

            <div className="palette-sidebar">
                <RecentColors />
                {selectedPixels.size > 0 ? (
                    <SelectionTools />
                ) : (
                    <PaletteGrid />
                )}
            </div>
        </aside>
    );
};
