import { useEffect, useState } from 'react';
import { Sidebar } from './components/Sidebar/Sidebar'
import { TopBar } from './components/Mobile/TopBar'
import { Editor } from './components/Editor/Editor'
import { Timeline } from './components/Timeline/Timeline'
import { SelectionControls } from './components/Editor/SelectionControls'
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts'
import { ShortcutsPanel } from './components/ShortcutsPanel'
import { useIsMobile } from './hooks/useIsMobile'
import { useEditorUiStore } from './stores/editorStore'
import { selectCanClear, selectCanUndo } from './stores/editorSelectors'
import './index.css'

const AppContent = () => {
    useKeyboardShortcuts();
    const isMobile = useIsMobile();
    const [showSidebar, setShowSidebar] = useState(true);
    const [showShortcuts, setShowShortcuts] = useState(false);
    const [showTimeline, setShowTimeline] = useState(true);

    const sprites = useEditorUiStore(state => state.sprites);
    const isDrawing = useEditorUiStore(state => state.isDrawing);
    const canUndo = useEditorUiStore(selectCanUndo);
    const canClear = useEditorUiStore(selectCanClear);
    const notification = useEditorUiStore(state => state.notification);
    const clearNotification = useEditorUiStore(state => state.clearNotification);
    const discardPendingPixelUpdates = useEditorUiStore(state => state.discardPendingPixelUpdates);
    const hasDrawn = canUndo || sprites.length > 1 || (canClear && !isDrawing);

    useEffect(() => {
        return () => {
            discardPendingPixelUpdates();
        };
    }, [discardPendingPixelUpdates]);

    const getViewToggleClassName = (active: boolean) => (
        `view-toggle ${active ? 'active' : ''}`
    );

    return (
        <div className="app-container">
            <div className="app-background">
                <div className="blob blob-1"></div>
                <div className="blob blob-2"></div>
                <div className="blob blob-3"></div>
            </div>

            <main className="editor-container">
                {notification && (
                    <div className={`app-notification ${notification.tone}`} role="status">
                        <span>{notification.message}</span>
                        <button
                            type="button"
                            className="app-notification-close"
                            onClick={clearNotification}
                            aria-label="Dismiss notification"
                        >
                            x
                        </button>
                    </div>
                )}

                {/* View Controls — desktop only */}
                {hasDrawn && !isMobile && (
                    <div className="view-controls">
                        <button onClick={() => setShowSidebar(!showSidebar)} className={getViewToggleClassName(showSidebar)}>
                            Toolbar
                        </button>
                        <button onClick={() => setShowShortcuts(!showShortcuts)} className={getViewToggleClassName(showShortcuts)}>
                            Shortcuts
                        </button>
                        <button onClick={() => setShowTimeline(!showTimeline)} className={getViewToggleClassName(showTimeline)}>
                            Timeline
                        </button>
                    </div>
                )}

                {/* Mobile: Top Bar + toggles */}
                {isMobile && showSidebar && <TopBar />}
                {hasDrawn && isMobile && (
                    <div className="mobile-toggles">
                        <button onClick={() => setShowSidebar(!showSidebar)} className={getViewToggleClassName(showSidebar)}>
                            Toolbar
                        </button>
                        <button onClick={() => setShowTimeline(!showTimeline)} className={getViewToggleClassName(showTimeline)}>
                            Timeline
                        </button>
                    </div>
                )}

                <div className="workspace">
                    {!isMobile && showSidebar && <Sidebar />}
                    {showShortcuts && <ShortcutsPanel />}

                    <div className="canvas-area">
                        <Editor />
                        {hasDrawn && <SelectionControls />}
                        {hasDrawn && showTimeline && <Timeline />}
                    </div>
                </div>
            </main>
        </div>
    );
};

export const App = () => {
    return <AppContent />;
};

export default App;
