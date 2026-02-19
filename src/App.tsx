import { useState } from 'react';
import { EditorProvider } from './contexts/EditorContext'
import { Sidebar } from './components/Sidebar/Sidebar'
import { Editor } from './components/Editor/Editor'
import { Timeline } from './components/Timeline/Timeline'
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts'
import { ShortcutsPanel } from './components/ShortcutsPanel'
import './index.css'

const AppContent = () => {
    useKeyboardShortcuts();
    const [showSidebar, setShowSidebar] = useState(true);
    const [showShortcuts, setShowShortcuts] = useState(false);

    return (
        <div className="app-container">
            <div className="app-background">
                <div className="blob blob-1"></div>
                <div className="blob blob-2"></div>
                <div className="blob blob-3"></div>
            </div>

            <main className="editor-container">
                {/* View Controls */}
                <div style={{
                    position: 'absolute',
                    top: '12px',
                    right: '20px',
                    zIndex: 100,
                    display: 'flex',
                    gap: '16px',
                    fontSize: '0.8rem',
                    color: '#888'
                }}>
                    <button
                        onClick={() => setShowSidebar(!showSidebar)}
                        style={{ background: 'none', border: 'none', color: showSidebar ? '#ccc' : '#666', cursor: 'pointer', fontFamily: 'inherit' }}
                    >
                        Toolbar
                    </button>
                    <button
                        onClick={() => setShowShortcuts(!showShortcuts)}
                        style={{ background: 'none', border: 'none', color: showShortcuts ? '#ccc' : '#666', cursor: 'pointer', fontFamily: 'inherit' }}
                    >
                        Shortcuts
                    </button>
                </div>

                <div className="workspace">
                    {showSidebar && <Sidebar />}
                    {showShortcuts && <ShortcutsPanel />}

                    <div className="canvas-area">
                        <Editor />
                        <Timeline />
                    </div>
                </div>
            </main>
        </div>
    );
};

export const App = () => {
    return (
        <EditorProvider>
            <AppContent />
        </EditorProvider>
    );
};

export default App;
