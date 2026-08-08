# Pixel Animator

A browser-based pixel animation editor built with React + TypeScript + Vite.

## Features

### Drawing Tools
- `Brush` and `Eraser` with two brush sizes (`1x`, `2x`)
- `Fill` (bucket) tool
- `Selection` mask tool with floating selection/stamp workflow
- Smooth line interpolation while drawing fast

### Shape Assist (Brush)
- Draw a near-straight stroke and hold still (~0.6s) to snap it to a line
- Draw a round loop back to your starting point and hold still to snap it to a circle
- Scribbles and sketch strokes never snap — the hold only offers a shape when the stroke already resembles one
- A countdown ring in your draw color shows the hold progress; works with touch
- Shape previews render before commit; drag to adjust, release to paint

### Eyedropper Hold Mode
- Long-press on canvas to activate eyedropper
- Hold progress indicator with drain animation
- Works with magnified color picker overlay (`MagnifyingGlass`)
- Dropper messaging and timing are tuned for intentional use

### Layer System (2 Layers Per Frame)
- Every frame has:
  - `Base` layer (`pixelData`)
  - `Top` layer (`overlayPixelData`)
- Layers can be viewed as:
  - `Stacked` (top over base)
  - `Unstacked` (side-by-side)
- App starts in **stacked mode**
- In stacked mode, drawing targets top layer

### Layer-Aware Editing Behavior
- Frame duplication is layer-aware:
  - Unstacked: duplicates selected layer only
  - Stacked: duplicates both layers together
- Timeline preview is layer-aware:
  - Unstacked: active layer preview
  - Stacked: composited preview
- During stacked timeline press-select, top-only preview is shown while holding

### Playback + Onion Skin
- Playback:
  - Stacked: composite playback
  - Unstacked: each canvas plays its own layer
- Onion skin:
  - Stacked: composite onion
  - Unstacked: onion of current layer only

### Selection, Stamp, and Smudge Workflow
- Selection acts as a mask and creates a floating stamp
- `Enter` stamps floating content into the active layer
- Hold `Enter` + arrow keys for smudge-like nudge+stamp
- Hold `Enter` also auto-stamps after rotate/flip transforms
- Context messages explain inside-mask vs outside-mask drawing

### Timeline
- Horizontal filmstrip with drag-and-drop frame reordering
- Multi-frame paint selection (long-press + drag)
- Batch actions:
  - duplicate selected frames
  - delete selected frames
- Number-key navigation (`1..8`, `9`, `0`)
- Mouse wheel vertical scroll maps to horizontal timeline scroll
- FPS controls for playback speed
- Up to 64 frames per project

### Color and Palette
- Up to 255 preset colors; colors used by art are encoded in a wider 65,535-color space
- Palette selector with bundled Lospec templates (`palettes/*.hex`) and live
  previews of your art in each candidate palette
- Apply a template two ways: convert the art to the nearest colors
  (perceptual OKLab matching) or keep the art's exact colors
- Edit any palette entry's hex directly — pixels drawn with it recolor instantly
- Import `.hex` files as custom templates (persisted locally) and download the
  current palette as a Lospec-compatible `.hex` file
- Recent colors strip
- Pixel data is stored palette-indexed (`Uint16Array`) so merged peer palettes do not corrupt colors

### Peer-to-Peer Collaboration
- Share an encrypted live-room link with one Guest; no application backend owns the project
- Per-pixel Yjs merging, independent frame navigation, colored canvas cursors, and timeline presence dots
- Full local IndexedDB cache on each live peer, plus normal JSON saves as the durable portable copy
- Collaborative undo affects only your own pixel actions on the active frame
- Palette conversion and project replacement require the other peer's awareness-based approval
- Either peer leaving ends the live room immediately; both keep the latest merged drawing as local projects
- One-shot copy links use a separate immutable snapshot room, expire after 30 minutes, and detach after receipt
- Public signaling is used by default; set `VITE_COLLAB_SIGNALING` to a comma-separated `ws://`/`wss://` list to override it

### Save, Load, and Export
- Save/load the full project as JSON (frames, layers, palette, FPS, project name)
- Export options with per-layer modes (`merged`, `base`, `top`):
  - Current frame or selected frames as PNG
  - Sprite sheet PNG
  - Animated GIF (via `gifenc`)
  - Frames as JSON (re-importable)
- Import multiple JSON frames; they splice in after the active frame

### Mobile Support
- Responsive layout with a dedicated mobile top bar and toolbar/timeline toggles
- Touch-first timeline gestures: long-press paint-select, direction-gated drag
  reordering, and edge auto-scroll

### Navigation and View Controls
- Drag empty workspace area to pan
- Mouse wheel and trackpad/pinch zoom support in workspace
- Scrollbars are visually hidden while scrolling remains functional

### Keyboard Shortcuts
- Tools: `B`, `E`, `F/G`, `S/M`
- Brush size: `[` / `]`
- Playback: `Space`
- Stamp: `Enter`
- Smudge: hold `Enter` + arrow keys
- Rotate/Flip selection: `R`, `Shift+R`, `Shift+H`, `Shift+V`
- Undo/Redo: `Cmd/Ctrl+Z`, `Shift+Z`, `Cmd/Ctrl+Y`
- Frame operations: `Shift+N`, `Shift+Delete`

### UI/UX
- Context-sensitive top status label (tool hints, mask hints, dropper hints)
- Optional shortcuts panel (hidden by default on startup)
- Pixel-focused cursor/preview behavior for precision editing

## Tech Stack
- React 19
- TypeScript
- Vite
- zustand (editor state store)
- dnd-kit (timeline drag/sort)
- gifenc (GIF export)
- mousetrap (keyboard shortcuts)
- lucide-react (icons)
- Yjs, y-webrtc, and y-indexeddb (collaboration and peer persistence)
- fractional-indexing and nanoid (convergent frame order and collision-safe ids)

## Development

### Install
```bash
npm install
```

### Run Dev Server
```bash
npm run dev
```

### Build
```bash
npm run build
```

### Type Check
```bash
npx tsc --noEmit
```

### Tests
```bash
npm test
npm run test:e2e
npm run lint
```
