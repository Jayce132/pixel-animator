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
import { useCollabStore } from './stores/collabStore'
import { InviteModal } from './components/Collab/InviteModal'
import { JoinPrompt } from './components/Collab/JoinPrompt'
import { CopyPrompt } from './components/Collab/CopyPrompt'
import { ConsentPrompt } from './components/Collab/ConsentPrompt'
import { ProposalPendingOverlay } from './components/Collab/ProposalPendingOverlay'
import { parseCollabHash } from './collab/links'
import type { CollabRoomLink } from './collab/links'
import './index.css'

const AppContent = () => {
    useKeyboardShortcuts();
    const isMobile = useIsMobile();
    const [showSidebar, setShowSidebar] = useState(true);
    const [showShortcuts, setShowShortcuts] = useState(false);
    const [showTimeline, setShowTimeline] = useState(true);
    const [showInvite, setShowInvite] = useState(false);
    const [incomingRoom, setIncomingRoom] = useState<CollabRoomLink | null>(() => {
        return parseCollabHash();
    });
    // Decided once, at mount: was there a "room=" hash that failed to parse?
    // A genuinely malformed/unparseable link, not "incomingRoom later became
    // null because the join succeeded" — see the effect below.
    const [hashWasInvalidAtLoad] = useState<boolean>(() => (
        window.location.hash.includes('room=') && !parseCollabHash()
    ));
    const isSessionActive = useCollabStore(state => state.isSessionActive);
    const collabStatus = useCollabStore(state => state.status);

    // Ambient session health on the Share toggle. A Host waiting for the
    // room's first Guest is still healthy; amber is reserved for an actual
    // degraded setup lifecycle. Established peer departure ends the session.
    const shareIsHealthy = collabStatus === 'connected' || collabStatus === 'waiting-peer';
    const shareStatusDot = isSessionActive
        ? <span className={`share-status-dot ${shareIsHealthy ? '' : 'degraded'}`} aria-hidden="true" />
        : null;

    const notification = useEditorUiStore(state => state.notification);
    const notify = useEditorUiStore(state => state.notify);
    const clearNotification = useEditorUiStore(state => state.clearNotification);
    const discardPendingPixelUpdates = useEditorUiStore(state => state.discardPendingPixelUpdates);

    useEffect(() => {
        return () => {
            discardPendingPixelUpdates();
        };
    }, [discardPendingPixelUpdates]);

    useEffect(() => {
        // `incomingRoom` also transitions to null after a *successful* join/copy
        // (JoinPrompt/CopyPrompt call onResolved), and the hash intentionally
        // keeps "room=" afterward so a reload can rejoin — so this must not
        // re-derive validity from incomingRoom's later state, only from what
        // was actually true when the page loaded.
        if (!hashWasInvalidAtLoad) return;
        const url = new URL(window.location.href);
        url.hash = '';
        window.history.replaceState(null, '', url);
        notify('Invalid collaboration link — your local project was not changed');
    }, [hashWasInvalidAtLoad, notify]);

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
                {!isMobile && (
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
                        <button onClick={() => setShowInvite(true)} className={getViewToggleClassName(isSessionActive)}>
                            Share{shareStatusDot}
                        </button>
                    </div>
                )}

                {/* Mobile: Top Bar + toggles */}
                {isMobile && showSidebar && <TopBar />}
                {isMobile && (
                    <div className="mobile-toggles">
                        <button onClick={() => setShowSidebar(!showSidebar)} className={getViewToggleClassName(showSidebar)}>
                            Toolbar
                        </button>
                        <button onClick={() => setShowTimeline(!showTimeline)} className={getViewToggleClassName(showTimeline)}>
                            Timeline
                        </button>
                        <button onClick={() => setShowInvite(true)} className={getViewToggleClassName(isSessionActive)}>
                            Share{shareStatusDot}
                        </button>
                    </div>
                )}

                <div className="workspace">
                    {!isMobile && showSidebar && <Sidebar />}
                    {showShortcuts && <ShortcutsPanel />}

                    <div className="canvas-area">
                        <Editor />
                        <SelectionControls />
                        {showTimeline && <Timeline />}
                    </div>
                </div>
                {showInvite && <InviteModal onClose={() => setShowInvite(false)} />}
                {incomingRoom?.mode === 'live' && (
                    <JoinPrompt room={incomingRoom} onResolved={() => setIncomingRoom(null)} />
                )}
                {incomingRoom?.mode === 'copy' && (
                    <CopyPrompt room={incomingRoom} onResolved={() => setIncomingRoom(null)} />
                )}
                <ConsentPrompt />
                <ProposalPendingOverlay />
            </main>
        </div>
    );
};

export const App = () => {
    return <AppContent />;
};

export default App;
