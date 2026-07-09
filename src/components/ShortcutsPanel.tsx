import React from 'react';

export const ShortcutsPanel: React.FC = () => {
    return (
        <div className="panel shortcuts-panel">
            <h3 className="shortcuts-title">Keyboard Shortcuts</h3>

            <table className="shortcuts-table">
                <tbody>
                    {/* Tools */}
                    <tr><td colSpan={2} className="shortcuts-section-heading">Tools</td></tr>
                    <ShortcutRow label="Brush" keys={['B']} />
                    <ShortcutRow label="Eraser" keys={['E']} />
                    <ShortcutRow label="Fill" keys={['G', 'F']} />
                    <ShortcutRow label="Select" keys={['M', 'S']} />
                    <ShortcutRow label="Deselect" keys={['Cmd+D']} />
                    <ShortcutRow label="Brush Size" keys={['[', ']']} />

                    {/* Actions */}
                    <tr><td colSpan={2} className="shortcuts-section-heading">Actions</td></tr>
                    <ShortcutRow label="Undo" keys={['Cmd+Z']} />
                    <ShortcutRow label="Redo" keys={['Shift+Z']} />
                    <ShortcutRow label="Clear" keys={['Del']} />

                    {/* Transform */}
                    <tr><td colSpan={2} className="shortcuts-section-heading">Transform</td></tr>
                    <ShortcutRow label="Flip H/V" keys={['Shift+H', 'V']} />
                    <ShortcutRow label="Rotate" keys={['R', 'Shift+R']} />
                    <ShortcutRow label="Stamp (Selection)" keys={['Enter']} />
                    <ShortcutRow label="Smudge Selection" keys={['Hold Enter + Arrows']} />

                    {/* Timeline */}
                    <tr><td colSpan={2} className="shortcuts-section-heading">Timeline</td></tr>
                    <ShortcutRow label="Play/Pause" keys={['Space']} />
                    <ShortcutRow label="Prev/Next Frame" keys={['<', '>']} />
                    <ShortcutRow label="Batch Nav" keys={['9', '0']} />
                    <ShortcutRow label="Select Frame" keys={['1..8']} />

                    <tr className="shortcuts-spacer" />

                    <ShortcutRow label="Duplicate Frame(s)" keys={['Shift+N']} />
                    <ShortcutRow label="Delete Frame(s)" keys={['Shift+Del']} />
                    <ShortcutRow label="Select All Frames" keys={['Cmd+A']} />
                    <ShortcutRow label="Deselect Frames" keys={['Cmd+Shift+A']} />
                </tbody>
            </table>
        </div>
    );
};

const ShortcutRow: React.FC<{ label: string, keys: string[] }> = ({ label, keys }) => (
    <tr>
        <td className="shortcuts-label">{label}</td>
        <td className="shortcuts-keys">
            {keys.map((k, i) => (
                <span key={i} className="shortcut-key">
                    {k}
                </span>
            ))}
        </td>
    </tr>
);
