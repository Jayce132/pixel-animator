import { EditorProvider } from './contexts/EditorContext'
import { Sidebar } from './components/Sidebar/Sidebar'
import { Editor } from './components/Editor/Editor'
import { Timeline } from './components/Timeline/Timeline'
import './index.css'

function App() {
    return (
        <EditorProvider>
            <div className="app-background">
                <div className="blob blob-1"></div>
                <div className="blob blob-2"></div>
                <div className="blob blob-3"></div>
            </div>

            <main className="editor-container">
                <div className="workspace">
                    <Sidebar />

                    <div className="canvas-area">
                        <Editor />
                        <Timeline />
                    </div>
                </div>
            </main>
        </EditorProvider>
    )
}

export default App
