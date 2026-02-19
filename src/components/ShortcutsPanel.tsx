import React from 'react';

export const ShortcutsPanel: React.FC = () => {
    return (
        <div className="panel shortcuts-panel" style={{ width: '240px', marginLeft: '12px', padding: '12px', fontSize: '0.8rem' }}>
            <h3 style={{ margin: '0 0 12px 0', fontSize: '0.9rem', color: '#888' }}>Keyboard Shortcuts</h3>

            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <tbody>
                    {/* Tools */}
                    <tr><td colSpan={2} style={headerStyle}>Tools</td></tr>
                    <ShortcutRow label="Brush" keys={['B']} />
                    <ShortcutRow label="Eraser" keys={['E']} />
                    <ShortcutRow label="Fill" keys={['G', 'F']} />
                    <ShortcutRow label="Select" keys={['M', 'S']} />
                    <ShortcutRow label="Deselect" keys={['Cmd+D']} />
                    <ShortcutRow label="Brush Size" keys={['[', ']']} />

                    {/* Actions */}
                    <tr><td colSpan={2} style={headerStyle}>Actions</td></tr>
                    <ShortcutRow label="Undo" keys={['Cmd+Z']} />
                    <ShortcutRow label="Redo" keys={['Shift+Z']} />
                    <ShortcutRow label="Clear" keys={['Del']} />

                    {/* Transform */}
                    <tr><td colSpan={2} style={headerStyle}>Transform</td></tr>
                    <ShortcutRow label="Flip H/V" keys={['Shift+H', 'V']} />
                    <ShortcutRow label="Rotate" keys={['R', 'Shift+R']} />
                    <ShortcutRow label="Stamp (Selection)" keys={['Enter']} />
                    <ShortcutRow label="Smudge Selection" keys={['Hold Enter + Arrows']} />

                    {/* Timeline */}
                    <tr><td colSpan={2} style={headerStyle}>Timeline</td></tr>
                    <ShortcutRow label="Play/Pause" keys={['Space']} />
                    <ShortcutRow label="Prev/Next Frame" keys={['<', '>']} />
                    <ShortcutRow label="Batch Nav" keys={['9', '0']} />
                    <ShortcutRow label="Select Frame" keys={['1..8']} />

                    <tr style={{ height: '8px' }}></tr>

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
        <td style={{ padding: '3px 0', color: '#ccc' }}>{label}</td>
        <td style={{ padding: '3px 0', textAlign: 'right' }}>
            {keys.map((k, i) => (
                <span key={i} style={{
                    background: '#333',
                    padding: '2px 5px',
                    borderRadius: '3px',
                    marginLeft: '4px',
                    fontSize: '0.75rem',
                    fontFamily: 'monospace',
                    display: 'inline-block'
                }}>
                    {k}
                </span>
            ))}
        </td>
    </tr>
);

const headerStyle: React.CSSProperties = {
    padding: '12px 0 4px 0',
    color: '#666',
    fontWeight: 'bold',
    fontSize: '0.75rem',
    textTransform: 'uppercase',
    borderBottom: '1px solid #333'
};
