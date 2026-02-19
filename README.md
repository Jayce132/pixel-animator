# Pixel Animator

A browser-based pixel animation editor built with React + TypeScript + Vite.

## Features

### Drawing Tools
- `Brush` and `Eraser` with two brush sizes (`1x`, `2x`)
- `Fill` (bucket) tool
- `Selection` mask tool with floating selection/stamp workflow
- Smooth line interpolation while drawing fast

### Shape Assist (Brush)
- Hold `Alt` (`Option` on macOS) during a stroke to preview/draw straight lines
- Circle mode is available during the same shape flow
- Shape previews render before commit; brush mode resumes on release

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
- React
- TypeScript
- Vite
- dnd-kit (timeline drag/sort)

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
