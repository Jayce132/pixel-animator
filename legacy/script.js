document.addEventListener('DOMContentLoaded', () => {
    // Configuration
    const GRID_SIZE = 16;
    const TOTAL_PIXELS = GRID_SIZE * GRID_SIZE;
    const MAX_SPRITES = 8;
    const MAX_RECENT_COLORS = 8;

    // DOM Elements
    const mainEditorContainer = document.getElementById('main-sprite-editor');
    const timelineContainer = document.getElementById('timeline-container');


    const tools = document.querySelectorAll('.tool-btn');
    const exportBtn = document.getElementById('btn-export');
    const exportJsonBtn = document.getElementById('btn-export-json');
    const importJsonBtn = document.getElementById('btn-import-json');
    const jsonFileInput = document.getElementById('json-file-input');
    const clearBtn = document.getElementById('action-clear');
    const undoBtn = document.getElementById('action-undo');
    const redoBtn = document.getElementById('action-redo');

    const playStopBtn = document.getElementById('btn-play-stop');
    const onionBtn = document.getElementById('btn-onion');
    const onionSkinContainer = document.getElementById('onion-skin-editor');



    // State
    let sprites = []; // Array of sprite objects: { id, name, pixelData, history }
    let activeSprite = 0; // Index of currently selected sprite
    let currentColor = '#be4a2f'; // First color in palette
    let currentTool = 'brush'; // brush, eraser, fill
    let isDrawing = false;
    let nextSpriteId = 0; // Counter for unique sprite IDs
    let recentColors = []; // Last 8 used colors
    let selectedPixels = new Set(); // indices of currently selected pixels
    let lastPixelIndex = null; // For line interpolation
    let floatingLayer = new Map(); // Map<pixelIndex, color> for floating selection
    let isFloating = false; // Whether selection is currently floating
    let lastMoveGridX = -1;
    let lastMoveGridY = -1;
    let isMovingSelection = false;

    // Animation state
    let isPlaying = false;
    let playbackInterval = null;
    let currentFrame = 0;
    let fps = 8;
    let isOnionSkinning = false;

    // Default Palette - 32 colors
    const PRESET_COLORS = [
        '#be4a2f', '#d77643', '#ead4aa', '#e4a672',
        '#b86f50', '#733e39', '#3e2731', '#a22633',
        '#e43b44', '#f77622', '#feae34', '#fee761',
        '#63c74d', '#3e8948', '#265c42', '#193c3e',
        '#124e89', '#0099db', '#2ce8f5', '#ffffff',
        '#c0cbdc', '#8b9bb4', '#5a6988', '#3a4466',
        '#262b44', '#181425', '#ff0044', '#68386c',
        '#b55088', '#f6757a', '#e8b796', '#c28569'
    ];

    // Initialize
    function init() {
        // Create 1 initial sprite
        for (let i = 0; i < 1; i++) {
            addSprite();
        }

        renderMainEditor();
        renderTimeline();
        initPalette();
        initRecentColors();
        setupEventListeners();
        updateSelectionUI(false);
    }

    function createSprite() {
        const sprite = {
            id: nextSpriteId++,
            name: `Sprite ${nextSpriteId}`,
            pixelData: new Array(TOTAL_PIXELS).fill(null),
            history: [],
            redoHistory: []
        };
        sprite.history.push([...sprite.pixelData]); // Initial state
        return sprite;
    }

    function addSprite() {
        if (sprites.length >= MAX_SPRITES) {
            alert('Maximum 8 sprites reached');
            return;
        }

        // Duplicate the active sprite if sprites exist, otherwise create blank
        if (sprites.length > 0) {
            const activeSpriteToDuplicate = sprites[activeSprite];
            const duplicate = {
                id: nextSpriteId++,
                name: `Sprite ${nextSpriteId}`,
                pixelData: [...activeSpriteToDuplicate.pixelData],
                history: [[...activeSpriteToDuplicate.pixelData]]
            };
            // Add to the end of the array
            sprites.push(duplicate);
            // Select the newly created sprite
            activeSprite = sprites.length - 1;
        } else {
            sprites.push(createSprite());
        }

        renderMainEditor();
        renderTimeline();
    }

    function deleteSprite(index) {
        if (sprites.length <= 1) {
            alert('Cannot delete the last sprite');
            return;
        }
        sprites.splice(index, 1);

        // Adjust active sprite if needed
        if (activeSprite >= sprites.length) {
            activeSprite = sprites.length - 1;
        }

        renderMainEditor();
        renderTimeline();
    }

    function duplicateSprite(index) {
        if (sprites.length >= MAX_SPRITES) {
            alert('Maximum 9 sprites reached');
            return;
        }

        const original = sprites[index];
        const duplicate = {
            id: nextSpriteId++,
            name: `${original.name} Copy`,
            pixelData: [...original.pixelData],
            history: [[...original.pixelData]],
            redoHistory: []
        };

        // Insert after the original
        sprites.splice(index + 1, 0, duplicate);

        // Select the duplicate
        activeSprite = index + 1;

        renderMainEditor();
        renderTimeline();
    }

    function moveSpriteLeft(index) {
        if (index === 0) return;

        // Swap with previous sprite
        [sprites[index - 1], sprites[index]] = [sprites[index], sprites[index - 1]];

        // Update active sprite if it was one of the swapped sprites
        if (activeSprite === index) {
            activeSprite = index - 1;
        } else if (activeSprite === index - 1) {
            activeSprite = index;
        }

        renderMainEditor();
        renderTimeline();
    }

    function moveSpriteRight(index) {
        if (index === sprites.length - 1) return;

        // Swap with next sprite
        [sprites[index], sprites[index + 1]] = [sprites[index + 1], sprites[index]];

        // Update active sprite if it was one of the swapped sprites
        if (activeSprite === index) {
            activeSprite = index + 1;
        } else if (activeSprite === index + 1) {
            activeSprite = index;
        }

        renderMainEditor();
        renderTimeline();
    }

    // --- Main Editor Rendering ---
    function renderMainEditor() {
        mainEditorContainer.innerHTML = '';

        const sprite = getActiveSprite();
        if (!sprite) return;

        // Toggle onion class
        if (isOnionSkinning && !isPlaying) {
            mainEditorContainer.classList.add('onion-on');
        } else {
            mainEditorContainer.classList.remove('onion-on');
        }

        // Toggle selection container class
        if (selectedPixels.size > 0 && !isPlaying) {
            mainEditorContainer.classList.add('has-selection');
        } else {
            mainEditorContainer.classList.remove('has-selection');
        }

        // Update Dynamic Controls
        updateSelectionUI(selectedPixels.size > 0);

        // Create pixels for active sprite
        sprite.pixelData.forEach((color, pixelIndex) => {
            const pixel = document.createElement('div');
            pixel.classList.add('pixel');
            pixel.dataset.index = pixelIndex;
            pixel.dataset.spriteId = sprite.id;

            if (selectedPixels.has(pixelIndex)) {
                pixel.classList.add('is-selected');
            }

            // Use floating layer color if available, otherwise use canvas color
            const displayColor = floatingLayer.has(pixelIndex) ? floatingLayer.get(pixelIndex) : color;

            if (displayColor) {
                pixel.style.backgroundColor = displayColor;
                pixel.classList.add('has-color');
                pixel.style.setProperty('--pixel-color', displayColor);
            }
            mainEditorContainer.appendChild(pixel);
        });

        renderOnionSkin();
    }

    function toggleOnionSkinning() {
        isOnionSkinning = !isOnionSkinning;
        onionBtn.classList.toggle('active', isOnionSkinning);
        renderMainEditor();
    }

    function renderOnionSkin() {
        onionSkinContainer.innerHTML = '';

        if (!isOnionSkinning || isPlaying || activeSprite === 0) {
            onionSkinContainer.style.display = 'none';
            return;
        }

        const prevSprite = sprites[activeSprite - 1];
        if (!prevSprite) {
            onionSkinContainer.style.display = 'none';
            return;
        }

        onionSkinContainer.style.display = 'grid';

        // Create pixels for onion skin (previous frame)
        prevSprite.pixelData.forEach((color, pixelIndex) => {
            const pixel = document.createElement('div');
            pixel.classList.add('pixel');
            if (color) {
                pixel.classList.add('has-color');
                pixel.style.setProperty('--pixel-color', color);
            }
            onionSkinContainer.appendChild(pixel);
        });
    }

    // --- Timeline Rendering ---
    function renderTimeline() {
        timelineContainer.innerHTML = '';

        sprites.forEach((sprite, index) => {
            const frame = document.createElement('div');
            frame.classList.add('timeline-frame');
            frame.draggable = true;
            frame.dataset.index = index;
            if (index === activeSprite) {
                frame.classList.add('active');
            }

            // Small frame number overlay
            const frameNumber = document.createElement('span');
            frameNumber.classList.add('timeline-frame-number');
            frameNumber.textContent = index + 1;

            // Thumbnail grid
            const grid = document.createElement('div');
            grid.classList.add('timeline-frame-grid');

            sprite.pixelData.forEach((color, pixelIndex) => {
                const pixel = document.createElement('div');
                pixel.classList.add('pixel');
                if (color) {
                    pixel.style.backgroundColor = color;
                }
                grid.appendChild(pixel);
            });

            frame.appendChild(frameNumber);
            frame.appendChild(grid);
            timelineContainer.appendChild(frame);

            // Drag events on entire frame
            frame.addEventListener('dragstart', handleDragStart);
            frame.addEventListener('dragover', handleDragOver);
            frame.addEventListener('drop', handleDrop);
            frame.addEventListener('dragend', handleDragEnd);

            // Click to select frame
            frame.addEventListener('click', () => {
                selectSprite(index);
            });
        });

        // Add "New Frame" button to the grid if under limit
        if (sprites.length < 8) {
            const addFrameDiv = document.createElement('div');
            addFrameDiv.classList.add('timeline-frame', 'add-new');
            addFrameDiv.title = 'Add new frame';

            // Render ghost preview of active sprite
            const activeSpriteData = sprites[activeSprite];
            if (activeSpriteData) {
                const ghostGrid = document.createElement('div');
                ghostGrid.classList.add('timeline-frame-grid', 'ghost-preview');

                activeSpriteData.pixelData.forEach((color) => {
                    const pixel = document.createElement('div');
                    pixel.classList.add('pixel');
                    if (color) {
                        pixel.style.backgroundColor = color;
                    }
                    ghostGrid.appendChild(pixel);
                });
                addFrameDiv.appendChild(ghostGrid);
            }

            const icon = document.createElement('span');
            icon.textContent = '+';
            icon.classList.add('add-icon');
            icon.style.fontSize = '2rem';
            icon.style.color = 'var(--text-muted)';

            addFrameDiv.appendChild(icon);

            addFrameDiv.addEventListener('click', () => {
                addSprite();
            });

            timelineContainer.appendChild(addFrameDiv);
        }
    }

    function selectSprite(index) {
        if (index === activeSprite) return;

        activeSprite = index;

        // Re-render both editor and timeline
        renderMainEditor();
        renderTimeline();
    }


    function getActiveSprite() {
        return sprites[activeSprite];
    }

    function updateSelectionUI(hasSelection) {
        const sidebarPalette = document.getElementById('palette-sidebar-grid');
        const sidebarTransforms = document.getElementById('transform-controls-sidebar');
        const mobilePalette = document.getElementById('palette-mobile-grid');
        const mobileTransforms = document.getElementById('transform-controls-mobile');

        const sidebarHeader = document.getElementById('palette-header-sidebar');

        if (hasSelection) {
            if (sidebarPalette) sidebarPalette.style.display = 'none';
            if (sidebarTransforms) sidebarTransforms.style.display = 'grid';

            if (mobilePalette) mobilePalette.style.display = 'none';
            if (mobileTransforms) mobileTransforms.style.display = 'grid';

            if (sidebarHeader) sidebarHeader.textContent = 'Selection Tools';
        } else {
            if (sidebarPalette) sidebarPalette.style.display = 'grid';
            if (sidebarTransforms) sidebarTransforms.style.display = 'none';

            if (mobilePalette) mobilePalette.style.display = 'grid';
            if (mobileTransforms) mobileTransforms.style.display = 'none';

            if (sidebarHeader) sidebarHeader.textContent = 'Palette';
        }
    }


    // --- Drag and Drop ---
    let draggedElement = null;
    let draggedSpriteIndex = null;
    let currentDropIndex = null;
    let dragClone = null;

    function handleDragStart(e) {
        // Get the timeline frame (e.currentTarget is the frame itself now)
        const timelineFrame = e.currentTarget;
        draggedElement = timelineFrame;
        const allFrames = Array.from(timelineContainer.querySelectorAll('.timeline-frame:not(.add-new)'));
        draggedSpriteIndex = allFrames.indexOf(timelineFrame);
        currentDropIndex = draggedSpriteIndex;
        e.dataTransfer.effectAllowed = 'move';

        // Create a floating clone BEFORE adding dragging class (so clone is visible)
        dragClone = timelineFrame.cloneNode(true);
        dragClone.classList.add('drag-clone');
        dragClone.classList.remove('dragging'); // Ensure clone is visible
        dragClone.style.position = 'fixed';
        dragClone.style.pointerEvents = 'none';
        dragClone.style.zIndex = '9999';
        dragClone.style.opacity = '1'; // Force visible
        dragClone.style.width = timelineFrame.offsetWidth + 'px';
        dragClone.style.height = timelineFrame.offsetHeight + 'px';
        dragClone.style.left = e.clientX - timelineFrame.offsetWidth / 2 + 'px';
        dragClone.style.top = e.clientY - timelineFrame.offsetHeight / 2 + 'px';
        document.body.appendChild(dragClone);

        // NOW hide the original
        timelineFrame.classList.add('dragging');

        // Make native drag image transparent using canvas (more reliable than Image object)
        const canvas = document.createElement('canvas');
        canvas.width = 1;
        canvas.height = 1;
        document.body.appendChild(canvas);
        e.dataTransfer.setDragImage(canvas, 0, 0);

        // Add document-level drag tracker for delete zone
        document.addEventListener('drag', handleDragTrack);
    }

    function handleDragTrack(e) {
        if (!draggedElement || !timelineContainer) return;

        // Update clone position
        if (dragClone && e.clientX !== 0 && e.clientY !== 0) {
            dragClone.style.left = e.clientX - dragClone.offsetWidth / 2 + 'px';
            dragClone.style.top = e.clientY - dragClone.offsetHeight / 2 + 'px';
        }

        const rect = timelineContainer.getBoundingClientRect();
        const mouseX = e.clientX;
        const mouseY = e.clientY;

        // Check if outside timeline bounds
        const isOutside = mouseX < rect.left || mouseX > rect.right ||
            mouseY < rect.top || mouseY > rect.bottom;

        if (isOutside && sprites.length > 1) {
            draggedElement.classList.add('delete-pending');
            if (dragClone) dragClone.classList.add('delete-pending');
        } else {
            draggedElement.classList.remove('delete-pending');
            if (dragClone) dragClone.classList.remove('delete-pending');
        }
    }

    function handleDragOver(e) {
        if (e.preventDefault) {
            e.preventDefault();
        }

        e.dataTransfer.dropEffect = 'move';

        const dropTarget = e.currentTarget;
        if (!dropTarget.classList.contains('timeline-frame')) {
            return false;
        }

        // Get the timeline frame to find the index
        const allFrames = Array.from(timelineContainer.querySelectorAll('.timeline-frame:not(.add-new)'));
        const dropIndex = allFrames.indexOf(dropTarget);

        if (dropIndex === -1) return false;

        // Only reorder if hovering over a different sprite
        if (dropIndex !== currentDropIndex && dropIndex !== draggedSpriteIndex) {
            // Perform data reorder
            const draggedSprite = sprites[draggedSpriteIndex];
            sprites.splice(draggedSpriteIndex, 1);
            sprites.splice(dropIndex, 0, draggedSprite);

            // DOM reordering (instead of full re-render for smooth animation)
            const draggedFrame = draggedElement;
            if (draggedSpriteIndex < dropIndex) {
                // Moving forward: insert after the drop target
                dropTarget.after(draggedFrame);
            } else {
                // Moving backward: insert before the drop target
                dropTarget.before(draggedFrame);
            }

            // Update indices
            draggedSpriteIndex = dropIndex;
            currentDropIndex = dropIndex;
        }

        return false;
    }

    function handleDrop(e) {
        if (e.stopPropagation) {
            e.stopPropagation();
        }

        // Sprites are already in the correct position from dragOver
        // Just clean up and re-render
        renderMainEditor();
        renderTimeline();

        return false;
    }

    function handleDragEnd(e) {
        const timelineFrame = e.currentTarget;
        timelineFrame.classList.remove('dragging');
        timelineFrame.classList.remove('delete-pending');

        // Remove document-level drag tracker
        document.removeEventListener('drag', handleDragTrack);

        // Check if dropped outside the timeline container
        const rect = timelineContainer.getBoundingClientRect();
        const mouseX = e.clientX;
        const mouseY = e.clientY;

        const isOutside = mouseX < rect.left || mouseX > rect.right ||
            mouseY < rect.top || mouseY > rect.bottom;

        if (isOutside && draggedSpriteIndex !== null && sprites.length > 1) {
            // Delete the sprite
            deleteSprite(draggedSpriteIndex);
        }

        // Clean up drag clone
        if (dragClone) {
            dragClone.remove();
            dragClone = null;
        }

        draggedElement = null;
        draggedSpriteIndex = null;
        currentDropIndex = null;
    }

    // --- Helper: Bresenham's Line Algorithm ---
    function getLinePixels(start, end) {
        const pixels = [];
        const x1 = start % GRID_SIZE;
        const y1 = Math.floor(start / GRID_SIZE);
        const x2 = end % GRID_SIZE;
        const y2 = Math.floor(end / GRID_SIZE);

        let dx = Math.abs(x2 - x1);
        let dy = Math.abs(y2 - y1);
        let sx = (x1 < x2) ? 1 : -1;
        let sy = (y1 < y2) ? 1 : -1;
        let err = dx - dy;

        let cx = x1;
        let cy = y1;

        while (true) {
            pixels.push(cy * GRID_SIZE + cx);

            if (cx === x2 && cy === y2) break;

            let e2 = 2 * err;
            if (e2 > -dy) {
                err -= dy;
                cx += sx;
            }
            if (e2 < dx) {
                err += dx;
                cy += sy;
            }
        }
        return pixels;
    }

    // --- Drawing Logic ---
    function paintPixel(spriteId, pixelIndex) {
        const sprite = sprites.find(s => s.id === spriteId);
        if (!sprite) return;

        if (currentTool === 'select') {
            if (!selectedPixels.has(pixelIndex)) {
                selectedPixels.add(pixelIndex);
                updatePixelVisual(spriteId, pixelIndex);

                // Immediate visual feedback for container
                if (mainEditorContainer && selectedPixels.size > 0) {
                    mainEditorContainer.classList.add('has-selection');
                }

                // Update UI Header and Controls
                updateSelectionUI(true);

                // Update button text to "Deselect" if we have a selection
                const selectBtn = document.getElementById('tool-select');
                if (selectBtn) {
                    selectBtn.innerHTML = 'Deselect';
                }


            }
            return;
        }

        // --- Selection Masking ---
        // If there's a selection, only allow drawing inside the selection
        if (selectedPixels.size > 0 && !selectedPixels.has(pixelIndex)) {
            return;
        }

        if (currentTool === 'fill') {
            fillArea(sprite, pixelIndex, currentColor);
            saveHistory(sprite);
            setTool('brush'); // Switch back to brush after filling once
            return;
        }

        const color = currentTool === 'eraser' ? null : currentColor;
        if (sprite.pixelData[pixelIndex] === color) return;

        sprite.pixelData[pixelIndex] = color;
        updatePixelVisual(spriteId, pixelIndex);
    }

    function updatePixelVisual(spriteId, pixelIndex) {
        const sprite = sprites.find(s => s.id === spriteId);
        if (!sprite) return;

        const pixel = document.querySelector(`.pixel[data-sprite-id="${spriteId}"][data-index="${pixelIndex}"]`);
        if (!pixel) return;

        const color = sprite.pixelData[pixelIndex];
        pixel.style.backgroundColor = color || 'transparent';

        if (selectedPixels.has(pixelIndex)) {
            pixel.classList.add('is-selected');
        } else {
            pixel.classList.remove('is-selected');
        }

        if (color) {
            pixel.classList.add('has-color');
            pixel.style.setProperty('--pixel-color', color);
        } else {
            pixel.classList.remove('has-color');
            pixel.style.removeProperty('--pixel-color');
        }
    }

    function fillArea(sprite, startIndex, targetColor) {
        const startColor = sprite.pixelData[startIndex];
        if (startColor === targetColor) return;

        // Flood fill algorithm
        const queue = [startIndex];
        const visited = new Set();

        while (queue.length > 0) {
            const currentIndex = queue.shift();
            if (visited.has(currentIndex)) continue;
            visited.add(currentIndex);

            const x = currentIndex % GRID_SIZE;
            const y = Math.floor(currentIndex / GRID_SIZE);

            if (sprite.pixelData[currentIndex] === startColor) {
                // Respect selection if it exists
                if (selectedPixels.size > 0 && !selectedPixels.has(currentIndex)) {
                    continue;
                }

                sprite.pixelData[currentIndex] = targetColor;
                updatePixelVisual(sprite.id, currentIndex);

                // Check neighbors
                if (y > 0) queue.push(currentIndex - GRID_SIZE);
                if (y < GRID_SIZE - 1) queue.push(currentIndex + GRID_SIZE);
                if (x > 0) queue.push(currentIndex - 1);
                if (x < GRID_SIZE - 1) queue.push(currentIndex + 1);
            }
        }
    }

    // --- Lasso Fill Logic ---
    function handleLassoRelease() {
        if (currentTool !== 'select' || selectedPixels.size === 0) return;

        // 1. Create a set of "wall" pixels (current selection)
        const walls = new Set(selectedPixels);
        const explored = new Set();
        const queue = [];

        // 2. Add all border pixels to queue
        for (let x = 0; x < GRID_SIZE; x++) {
            queue.push(x); // Top row
            queue.push((GRID_SIZE - 1) * GRID_SIZE + x); // Bottom row
        }
        for (let y = 1; y < GRID_SIZE - 1; y++) {
            const leftRowIndex = y * GRID_SIZE;
            queue.push(leftRowIndex); // Left col
            queue.push(leftRowIndex + GRID_SIZE - 1); // Right col
        }

        // 3. Flood fill from outside to find all reachable "outside" pixels
        while (queue.length > 0) {
            const idx = queue.shift();
            if (explored.has(idx) || walls.has(idx)) continue;

            explored.add(idx);

            const x = idx % GRID_SIZE;
            const y = Math.floor(idx / GRID_SIZE);

            // Neighbors
            const neighbors = [];
            if (y > 0) neighbors.push(idx - GRID_SIZE);
            if (y < GRID_SIZE - 1) neighbors.push(idx + GRID_SIZE);
            if (x > 0) neighbors.push(idx - 1);
            if (x < GRID_SIZE - 1) neighbors.push(idx + 1);

            for (const n of neighbors) {
                if (!explored.has(n) && !walls.has(n)) {
                    queue.push(n);
                }
            }
        }

        // 4. Any pixel NOT explored and NOT a wall is "inside"
        let newSelectionCount = 0;
        for (let i = 0; i < TOTAL_PIXELS; i++) {
            if (!explored.has(i) && !walls.has(i)) {
                selectedPixels.add(i);
                newSelectionCount++;
            }
        }

        // 5. Update visuals if we added anything
        if (newSelectionCount > 0) {
            renderMainEditor();
            // Ensure button text is correct
            const selectBtn = document.getElementById('tool-select');
            if (selectBtn) selectBtn.innerHTML = 'Deselect';
        }

        // 6. Auto-Trim: Filter selection to only pixels that have content
        const sprite = getActiveSprite();
        if (sprite) {
            const trimmedSelection = new Set();
            for (const idx of selectedPixels) {
                if (sprite.pixelData[idx] !== null) {
                    trimmedSelection.add(idx);
                }
            }
            // Only trim if there are actually colored pixels. 
            // If user selected empty space entirely, keep it (though lifting empty space does nothing)
            if (trimmedSelection.size > 0) {
                selectedPixels = trimmedSelection;
                if (selectedPixels.size < newSelectionCount) {
                    renderMainEditor(); // Re-render to clear outlined empty space
                }
            }
        }

        updateSelectionUI(true);

        // 7. Lift selected pixels into floating layer
        liftSelection();
    }

    // --- Lift Selection into Floating Layer ---
    function liftSelection() {
        if (selectedPixels.size === 0 || isFloating) return;

        const sprite = getActiveSprite();
        if (!sprite) return;

        // Copy selected pixels to floating layer and clear from canvas
        floatingLayer.clear();
        for (const idx of selectedPixels) {
            floatingLayer.set(idx, sprite.pixelData[idx]);
            sprite.pixelData[idx] = null; // Clear from canvas
        }

        isFloating = true;
        renderMainEditor();
    }

    // --- Stamp Floating Layer back to Canvas ---
    function stampSelection() {
        if (!isFloating || floatingLayer.size === 0) return;

        const sprite = getActiveSprite();
        if (!sprite) return;

        // Merge floating layer back to canvas
        for (const [idx, color] of floatingLayer) {
            sprite.pixelData[idx] = color;
        }

        floatingLayer.clear();
        isFloating = false;
    }

    // --- Flip Selection Horizontally ---
    function flipSelectionHorizontally() {
        if (selectedPixels.size === 0 || !isFloating) return;

        // Calculate bounding box of selection
        let minX = GRID_SIZE, maxX = -1;
        let minY = GRID_SIZE, maxY = -1;

        for (const idx of selectedPixels) {
            const x = idx % GRID_SIZE;
            const y = Math.floor(idx / GRID_SIZE);
            minX = Math.min(minX, x);
            maxX = Math.max(maxX, x);
            minY = Math.min(minY, y);
            maxY = Math.max(maxY, y);
        }

        // Create a copy of the floating layer
        const tempData = new Map(floatingLayer);

        // Flip horizontally within the bounding box  
        floatingLayer.clear();
        for (const [idx, color] of tempData) {
            const x = idx % GRID_SIZE;
            const y = Math.floor(idx / GRID_SIZE);

            // Calculate mirrored x position within bounding box
            const flippedX = minX + (maxX - x);
            const flippedIdx = y * GRID_SIZE + flippedX;

            floatingLayer.set(flippedIdx, color);
        }

        // Update the selection area itself to follow the pixels
        const newSelection = new Set();
        for (const idx of selectedPixels) {
            const x = idx % GRID_SIZE;
            const y = Math.floor(idx / GRID_SIZE);

            const flippedX = minX + (maxX - x);
            const flippedIdx = y * GRID_SIZE + flippedX;
            newSelection.add(flippedIdx);
        }
        selectedPixels = newSelection;

        // Update visuals
        renderMainEditor();
    }



    // --- Flip Selection Vertically ---
    function flipSelectionVertically() {
        if (selectedPixels.size === 0 || !isFloating) return;

        // Calculate bounding box of selection
        let minX = GRID_SIZE, maxX = -1;
        let minY = GRID_SIZE, maxY = -1;

        for (const idx of selectedPixels) {
            const x = idx % GRID_SIZE;
            const y = Math.floor(idx / GRID_SIZE);
            minX = Math.min(minX, x);
            maxX = Math.max(maxX, x);
            minY = Math.min(minY, y);
            maxY = Math.max(maxY, y);
        }

        // Create a copy of the floating layer
        const tempData = new Map(floatingLayer);

        // Flip vertically within the bounding box
        floatingLayer.clear();
        for (const [idx, color] of tempData) {
            const x = idx % GRID_SIZE;
            const y = Math.floor(idx / GRID_SIZE);

            // Calculate mirrored y position within bounding box
            const flippedY = minY + (maxY - y);
            const flippedIdx = flippedY * GRID_SIZE + x;

            floatingLayer.set(flippedIdx, color);
        }

        // Update the selection area itself to follow the pixels
        const newSelection = new Set();
        for (const idx of selectedPixels) {
            const x = idx % GRID_SIZE;
            const y = Math.floor(idx / GRID_SIZE);

            const flippedY = minY + (maxY - y);
            const flippedIdx = flippedY * GRID_SIZE + x;
            newSelection.add(flippedIdx);
        }
        selectedPixels = newSelection;

        // Update visuals
        renderMainEditor();
    }

    // --- Rotate Selection Left (90° counterclockwise) ---
    function rotateSelectionLeft() {
        if (selectedPixels.size === 0 || !isFloating) return;

        // Calculate bounding box of selection
        let minX = GRID_SIZE, maxX = -1;
        let minY = GRID_SIZE, maxY = -1;

        for (const idx of selectedPixels) {
            const x = idx % GRID_SIZE;
            const y = Math.floor(idx / GRID_SIZE);
            minX = Math.min(minX, x);
            maxX = Math.max(maxX, x);
            minY = Math.min(minY, y);
            maxY = Math.max(maxY, y);
        }

        const width = maxX - minX + 1;
        const height = maxY - minY + 1;

        // Create a copy of the floating layer
        const tempData = new Map(floatingLayer);

        // Rotate 90° counterclockwise within the bounding box
        floatingLayer.clear();
        for (const [idx, color] of tempData) {
            const x = idx % GRID_SIZE;
            const y = Math.floor(idx / GRID_SIZE);

            // Relative coordinates within bounding box
            const relX = x - minX;
            const relY = y - minY;

            // After 90° CCW rotation: (x, y) -> (y, width - 1 - x)
            const newRelX = relY;
            const newRelY = width - 1 - relX;

            // Convert back to absolute if within bounds
            if (newRelX < height && newRelY < width) {
                const newX = minX + newRelX;
                const newY = minY + newRelY;
                const newIdx = newY * GRID_SIZE + newX;
                floatingLayer.set(newIdx, color);
            }
        }

        // Rotate the selection area itself
        const newSelection = new Set();
        for (const idx of selectedPixels) {
            const x = idx % GRID_SIZE;
            const y = Math.floor(idx / GRID_SIZE);

            const relX = x - minX;
            const relY = y - minY;

            // After 90° CCW rotation: (x, y) -> (y, width - 1 - x)
            const newRelX = relY;
            const newRelY = width - 1 - relX;

            if (newRelX < height && newRelY < width) {
                const newX = minX + newRelX;
                const newY = minY + newRelY;
                const newIdx = newY * GRID_SIZE + newX;
                newSelection.add(newIdx);
            }
        }
        selectedPixels = newSelection;
        renderMainEditor();
    }

    // --- Rotate Selection Right (90° clockwise) ---
    function rotateSelectionRight() {
        if (selectedPixels.size === 0 || !isFloating) return;

        // Calculate bounding box of selection
        let minX = GRID_SIZE, maxX = -1;
        let minY = GRID_SIZE, maxY = -1;

        for (const idx of selectedPixels) {
            const x = idx % GRID_SIZE;
            const y = Math.floor(idx / GRID_SIZE);
            minX = Math.min(minX, x);
            maxX = Math.max(maxX, x);
            minY = Math.min(minY, y);
            maxY = Math.max(maxY, y);
        }

        const width = maxX - minX + 1;
        const height = maxY - minY + 1;

        // Create a copy of the floating layer
        const tempData = new Map(floatingLayer);

        // Rotate 90° clockwise within the bounding box
        floatingLayer.clear();
        for (const [idx, color] of tempData) {
            const x = idx % GRID_SIZE;
            const y = Math.floor(idx / GRID_SIZE);

            // Relative coordinates within bounding box
            const relX = x - minX;
            const relY = y - minY;

            // After 90° CW rotation: (x, y) -> (height - 1 - y, x)
            const newRelX = height - 1 - relY;
            const newRelY = relX;

            // Convert back to absolute if within bounds
            if (newRelX < height && newRelY < width) {
                const newX = minX + newRelX;
                const newY = minY + newRelY;
                const newIdx = newY * GRID_SIZE + newX;
                floatingLayer.set(newIdx, color);
            }
        }

        // Rotate the selection area itself
        const newSelection = new Set();
        for (const idx of selectedPixels) {
            const x = idx % GRID_SIZE;
            const y = Math.floor(idx / GRID_SIZE);

            const relX = x - minX;
            const relY = y - minY;

            // After 90° CW rotation: (x, y) -> (height - 1 - y, x)
            const newRelX = height - 1 - relY;
            const newRelY = relX;

            if (newRelX < height && newRelY < width) {
                const newX = minX + newRelX;
                const newY = minY + newRelY;
                const newIdx = newY * GRID_SIZE + newX;
                newSelection.add(newIdx);
            }
        }
        selectedPixels = newSelection;
        renderMainEditor();
    }

    // --- Nudge Selection ---
    function nudgeSelection(dx, dy) {
        if (selectedPixels.size === 0 || !isFloating) return false;

        // Check for boundary collisions first
        for (const idx of selectedPixels) {
            const x = idx % GRID_SIZE;
            const y = Math.floor(idx / GRID_SIZE);
            const newX = x + dx;
            const newY = y + dy;

            // If ANY pixel would go out of bounds, cancel the whole move
            if (newX < 0 || newX >= GRID_SIZE || newY < 0 || newY >= GRID_SIZE) {
                return false;
            }
        }

        // Create a copy of the floating layer
        const tempData = new Map(floatingLayer);
        floatingLayer.clear();

        const newSelection = new Set();

        // Move current floating pixels
        for (const [idx, color] of tempData) {
            const x = idx % GRID_SIZE;
            const y = Math.floor(idx / GRID_SIZE);

            const newX = x + dx;
            const newY = y + dy;
            const newIdx = newY * GRID_SIZE + newX;
            floatingLayer.set(newIdx, color);
        }

        // Update selection area
        for (const idx of selectedPixels) {
            const x = idx % GRID_SIZE;
            const y = Math.floor(idx / GRID_SIZE);

            const newX = x + dx;
            const newY = y + dy;
            const newIdx = newY * GRID_SIZE + newX;
            newSelection.add(newIdx);
        }

        selectedPixels = newSelection;
        renderMainEditor();
        return true;
    }

    // --- History Management ---
    function saveHistory(sprite) {
        if (!sprite) return;
        if (sprite.history.length > 20) sprite.history.shift();
        sprite.history.push([...sprite.pixelData]);
        // Clear redo stack on new action
        sprite.redoHistory = [];
    }

    function undo() {
        const sprite = getActiveSprite();
        if (!sprite || sprite.history.length <= 1) return;

        // Take current state and put it on redo stack
        const currentState = sprite.history.pop();
        sprite.redoHistory.push(currentState);

        // Revert to previous state
        const previousState = sprite.history[sprite.history.length - 1];
        sprite.pixelData = [...previousState];

        // Re-render sprite pixels
        sprite.pixelData.forEach((_, index) => updatePixelVisual(sprite.id, index));
        renderTimeline(); // Update preview
    }

    function redo() {
        const sprite = getActiveSprite();
        if (!sprite || sprite.redoHistory.length === 0) return;

        // Take state from redo stack and put it back on history
        const nextState = sprite.redoHistory.pop();
        sprite.history.push(nextState);

        // Apply state
        sprite.pixelData = [...nextState];

        // Re-render sprite pixels
        sprite.pixelData.forEach((_, index) => updatePixelVisual(sprite.id, index));
        renderTimeline(); // Update preview
    }

    function clearGrid() {
        const sprite = getActiveSprite();
        sprite.pixelData.fill(null);
        sprite.pixelData.forEach((_, index) => updatePixelVisual(sprite.id, index));
        saveHistory(sprite);
    }

    // --- Palette & Color ---
    function initPalette() {
        const paletteGrids = [
            document.getElementById('palette-sidebar-grid'),
            document.getElementById('palette-mobile-grid')
        ];

        paletteGrids.forEach(grid => {
            if (!grid) return;
            grid.innerHTML = ''; // Clear existing
            PRESET_COLORS.forEach(color => {
                const swatch = document.createElement('div');
                swatch.classList.add('palette-color');
                swatch.style.backgroundColor = color;
                swatch.dataset.color = color;
                swatch.addEventListener('click', () => {
                    addToRecentColors(color); // Add to recent only from main palette
                    setColor(color);
                });
                grid.appendChild(swatch);
            });
        });
    }

    function initRecentColors() {
        const recentGrids = [
            document.getElementById('recent-colors-sidebar-grid'),
            document.getElementById('recent-colors-mobile-grid')
        ];

        recentGrids.forEach(grid => {
            if (!grid) return;
            grid.innerHTML = '';

            // First slot is always Clear (Permanently)
            const clearSwatch = document.createElement('div');
            clearSwatch.classList.add('palette-color', 'recent-swatch', 'clear-swatch');
            clearSwatch.dataset.color = 'null';
            clearSwatch.title = 'Clear (Eraser)';
            clearSwatch.addEventListener('click', () => {
                setColor(null);
            });
            grid.appendChild(clearSwatch);

            // Remaining slots for actual recent colors
            for (let i = 0; i < MAX_RECENT_COLORS - 1; i++) {
                const swatch = document.createElement('div');
                swatch.classList.add('palette-color', 'recent-swatch');
                swatch.dataset.index = i;
                swatch.addEventListener('click', () => {
                    if (recentColors[i]) {
                        setColor(recentColors[i]);
                    }
                });
                grid.appendChild(swatch);
            }
        });
    }

    function addToRecentColors(color) {
        if (!color) return; // Don't add clear/eraser to recents

        // Remove if already exists
        recentColors = recentColors.filter(c => c !== color);
        // Add to front
        recentColors.unshift(color);
        // Limit to max (MAX_RECENT_COLORS - 1 because first slot is permanent Clear)
        if (recentColors.length > MAX_RECENT_COLORS - 1) {
            recentColors.pop();
        }
        renderRecentColors();
    }

    function renderRecentColors() {
        const recentGrids = [
            document.getElementById('recent-colors-sidebar-grid'),
            document.getElementById('recent-colors-mobile-grid')
        ];

        recentGrids.forEach(grid => {
            if (!grid) return;
            const swatches = Array.from(grid.querySelectorAll('.recent-swatch:not(.clear-swatch)'));
            swatches.forEach((swatch, i) => {
                const color = recentColors[i];
                swatch.style.backgroundColor = color || 'transparent';
                swatch.dataset.color = color || '';
            });
        });
    }

    function setColor(color) {
        currentColor = color;

        // Update visual selection in all palettes (main + recent)
        document.querySelectorAll('.palette-color').forEach(swatch => {
            const isClickingClear = (color === null && swatch.classList.contains('clear-swatch'));
            const isClickingColor = (color !== null && swatch.dataset.color === color);

            if (isClickingClear || isClickingColor) {
                swatch.classList.add('active');
            } else {
                swatch.classList.remove('active');
            }
        });

        // Tool switching behavior
        if (currentTool !== 'fill') {
            if (color === null) {
                setTool('eraser');
            } else {
                setTool('brush');
            }
        }
    }

    function setTool(toolName) {
        // Deselect logic: if clicking "Select/Deselect" when there's a selection, clear it immediately
        if (toolName === 'select' && selectedPixels.size > 0) {
            // Stamp floating layer back to canvas before clearing selection
            stampSelection();

            selectedPixels.clear();
            mainEditorContainer.classList.remove('has-selection');
            const selectBtn = document.getElementById('tool-select');
            if (selectBtn) {
                selectBtn.innerHTML = 'Select';
                selectBtn.classList.remove('active');
            }

            // If we were in select mode, switch to brush; otherwise keep current tool
            if (currentTool === 'select') {
                currentTool = 'brush';
            }

            // Update button states to reflect the current tool (not select)
            tools.forEach(btn => {
                if (btn.dataset.tool === currentTool) {
                    btn.classList.add('active');
                } else {
                    btn.classList.remove('active');
                }
            });

            updateSelectionUI(false);

            // Save to history after stamping
            saveHistory(getActiveSprite());
            renderMainEditor();
            return;
        }

        currentTool = toolName;
        tools.forEach(btn => {
            if (btn.dataset.tool === toolName) {
                btn.classList.add('active');
                // Ensure label is correct when switching TO select
                if (toolName === 'select') {
                    btn.innerHTML = selectedPixels.size > 0 ? 'Deselect' : 'Select';
                }
            } else {
                btn.classList.remove('active');
                // Keep "Deselect" label and highlight if there's an active selection
                if (btn.dataset.tool === 'select' && selectedPixels.size > 0) {
                    btn.innerHTML = 'Deselect';
                    btn.classList.add('active'); // Keep highlighted
                } else if (btn.dataset.tool === 'select') {
                    btn.innerHTML = 'Select';
                }
            }
        });

        // Manage highlight: show for Brush/Fill/Eraser if a color/clear is selected
        const swatches = document.querySelectorAll('.palette-color');
        if (toolName === 'select') {
            swatches.forEach(s => s.classList.remove('active'));
        } else {
            swatches.forEach(swatch => {
                const isClearActive = (currentColor === null && swatch.classList.contains('clear-swatch'));
                const isColorActive = (currentColor !== null && swatch.dataset.color === currentColor);
                swatch.classList.toggle('active', isClearActive || isColorActive);
            });
        }
    }

    // --- Import/Export ---
    function exportToJSON() {
        const sprite = getActiveSprite();
        const jsonData = {
            width: GRID_SIZE,
            height: GRID_SIZE,
            pixels: sprite.pixelData
        };

        const jsonString = JSON.stringify(jsonData, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const link = document.createElement('a');
        link.download = `sprite-${activeSprite + 1}.json`;
        link.href = url;
        link.click();

        URL.revokeObjectURL(url);
    }

    function validatePixels(pixels) {
        if (!pixels || !Array.isArray(pixels)) {
            throw new Error('Invalid format: missing pixels array');
        }
        if (pixels.length !== TOTAL_PIXELS) {
            throw new Error(`Invalid pixel count: expected ${TOTAL_PIXELS}, got ${pixels.length}`);
        }
        for (let i = 0; i < pixels.length; i++) {
            const pixel = pixels[i];
            if (pixel !== null && !/^#[0-9A-F]{6}$/i.test(pixel)) {
                throw new Error(`Invalid pixel at index ${i}: ${pixel}`);
            }
        }
        return true;
    }

    function importFromJSON(jsonData) {
        try {
            validatePixels(jsonData.pixels);

            // Load into ACTIVE sprite
            const sprite = getActiveSprite();
            sprite.pixelData = [...jsonData.pixels];
            sprite.pixelData.forEach((_, index) => updatePixelVisual(sprite.id, index));
            saveHistory(sprite);

            renderMainEditor();
            renderTimeline();
            return true;
        } catch (error) {
            alert(`Import failed: ${error.message}`);
            return false;
        }
    }

    function exportToPNG() {
        const sprite = getActiveSprite();
        const canvas = document.getElementById('export-canvas');
        const ctx = canvas.getContext('2d');

        ctx.clearRect(0, 0, 16, 16);

        sprite.pixelData.forEach((color, i) => {
            if (color) {
                const x = i % GRID_SIZE;
                const y = Math.floor(i / GRID_SIZE);
                ctx.fillStyle = color;
                ctx.fillRect(x, y, 1, 1);
            }
        });

        // Scale up
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = 512;
        tempCanvas.height = 512;
        const tempCtx = tempCanvas.getContext('2d');
        tempCtx.imageSmoothingEnabled = false;
        tempCtx.drawImage(canvas, 0, 0, 512, 512);

        const link = document.createElement('a');
        link.download = `sprite-${activeSprite + 1}.png`;
        link.href = tempCanvas.toDataURL('image/png');
        link.click();
    }

    // --- Animation ---
    function playAnimation() {
        if (isPlaying) return;

        isPlaying = true;
        playStopBtn.textContent = 'Stop';
        playStopBtn.classList.add('active');

        // Hide grid lines during playback
        mainEditorContainer.classList.add('playing');

        // Start from current sprite
        currentFrame = activeSprite;

        playbackInterval = setInterval(() => {
            // Move to next frame
            currentFrame = (currentFrame + 1) % sprites.length;

            // Switch to that sprite (updates main editor and timeline)
            selectSprite(currentFrame);

        }, 1000 / fps);
    }

    function stopAnimation() {
        if (!isPlaying) return;

        isPlaying = false;
        clearInterval(playbackInterval);
        playbackInterval = null;
        playStopBtn.textContent = 'Play';
        playStopBtn.classList.remove('active');

        // Show grid lines again
        mainEditorContainer.classList.remove('playing');

        // Refresh editor to show onion skin if it was active
        renderMainEditor();

        // Stops at current frame (activeSprite is already set by selectSprite)
    }



    // --- Event Listeners ---
    function setupEventListeners() {
        // Drawing with event delegation - Mouse events
        document.addEventListener('mousedown', (e) => {
            const mainEditor = document.getElementById('main-sprite-editor');
            if (mainEditor && mainEditor.contains(e.target) && e.target.classList.contains('pixel')) {
                const pixelIndex = parseInt(e.target.dataset.index);

                // Drag-to-Move: Check if clicking inside selection
                if (currentTool === 'select' && selectedPixels.has(pixelIndex)) {
                    isMovingSelection = true;
                    lastMoveGridX = pixelIndex % GRID_SIZE;
                    lastMoveGridY = Math.floor(pixelIndex / GRID_SIZE);
                    e.preventDefault(); // Prevent text selection etc
                    return;
                }

                // Clear existing selection on new click if using select tool (and not clicking inside selection)
                if (currentTool === 'select') {
                    stampSelection(); // Stamp floating layer before new selection
                    selectedPixels.clear();
                    mainEditorContainer.classList.remove('has-selection');
                    const selectBtn = document.getElementById('tool-select');
                    if (selectBtn) selectBtn.innerHTML = 'Select';

                    if (isFloating) saveHistory(getActiveSprite()); // Save if we stamped
                    renderMainEditor();
                }

                isDrawing = true;
                lastPixelIndex = pixelIndex;
                const sprite = getActiveSprite();
                paintPixel(sprite.id, pixelIndex);
            }
        });

        document.addEventListener('mousemove', (e) => {
            const mainEditor = document.getElementById('main-sprite-editor');
            const isTargetPixel = mainEditor && mainEditor.contains(e.target) && e.target.classList.contains('pixel');

            if (isMovingSelection && isTargetPixel) {
                const pixelIndex = parseInt(e.target.dataset.index);
                const currentGridX = pixelIndex % GRID_SIZE;
                const currentGridY = Math.floor(pixelIndex / GRID_SIZE);

                const dx = currentGridX - lastMoveGridX;
                const dy = currentGridY - lastMoveGridY;

                // Decouple axes to allow sliding along walls
                if (dx !== 0) {
                    nudgeSelection(dx, 0);
                    lastMoveGridX = currentGridX; // Update tracking even if move failed (to fix deadzone)
                }
                if (dy !== 0) {
                    nudgeSelection(0, dy);
                    lastMoveGridY = currentGridY; // Update tracking even if move failed (to fix deadzone)
                }

                return;
            }

            if (!isDrawing) return;

            if (isTargetPixel) {
                if (currentTool === 'fill') return;

                const pixelIndex = parseInt(e.target.dataset.index);
                const sprite = getActiveSprite();

                if (lastPixelIndex !== null && lastPixelIndex !== pixelIndex) {
                    const linePixels = getLinePixels(lastPixelIndex, pixelIndex);
                    linePixels.forEach(idx => paintPixel(sprite.id, idx));
                } else {
                    paintPixel(sprite.id, pixelIndex);
                }
                lastPixelIndex = pixelIndex;
            }
        });

        document.addEventListener('mouseup', () => {
            if (isMovingSelection) {
                isMovingSelection = false;
                lastMoveGridX = -1;
                lastMoveGridY = -1;
            }

            if (isDrawing) {
                isDrawing = false;
                lastPixelIndex = null;

                if (currentTool === 'select') {
                    handleLassoRelease();
                } else {
                    saveHistory(getActiveSprite());
                }

                // Update timeline preview to show the changes
                renderTimeline();
            }
        });

        // Touch events for mobile/tablet
        document.addEventListener('touchstart', (e) => {
            const mainEditor = document.getElementById('main-sprite-editor');
            const touch = e.touches[0];
            const target = document.elementFromPoint(touch.clientX, touch.clientY);

            if (mainEditor && mainEditor.contains(target) && target.classList.contains('pixel')) {
                e.preventDefault();

                const pixelIndex = parseInt(target.dataset.index);

                // Drag-to-Move: Check if clicking inside selection
                if (currentTool === 'select' && selectedPixels.has(pixelIndex)) {
                    isMovingSelection = true;
                    lastMoveGridX = pixelIndex % GRID_SIZE;
                    lastMoveGridY = Math.floor(pixelIndex / GRID_SIZE);
                    return;
                }

                // Clear existing selection on new touch if using select tool (and not clicking inside selection)
                if (currentTool === 'select') {
                    stampSelection(); // Stamp floating layer before new selection
                    selectedPixels.clear();
                    mainEditorContainer.classList.remove('has-selection');
                    const selectBtn = document.getElementById('tool-select');
                    if (selectBtn) selectBtn.innerHTML = 'Select';

                    if (isFloating) {
                        saveHistory(getActiveSprite()); // Save if we stamped
                        renderMainEditor();
                    } else {
                        // Optimize: clear selection without destroying DOM
                        document.querySelectorAll('.pixel.is-selected').forEach(el => el.classList.remove('is-selected'));
                        updateSelectionUI(false);
                    }
                }

                isDrawing = true;
                lastPixelIndex = pixelIndex;
                const sprite = getActiveSprite();
                paintPixel(sprite.id, pixelIndex);
            }
        }, { passive: false });

        document.addEventListener('touchmove', (e) => {
            if (!isDrawing && !isMovingSelection) return;

            e.preventDefault(); // Prevent scrolling while interacting

            const mainEditor = document.getElementById('main-sprite-editor');
            const touch = e.touches[0];
            const target = document.elementFromPoint(touch.clientX, touch.clientY);
            const isTargetPixel = target && mainEditor && mainEditor.contains(target) && target.classList.contains('pixel');

            if (isMovingSelection && isTargetPixel) {
                const pixelIndex = parseInt(target.dataset.index);
                const currentGridX = pixelIndex % GRID_SIZE;
                const currentGridY = Math.floor(pixelIndex / GRID_SIZE);

                const dx = currentGridX - lastMoveGridX;
                const dy = currentGridY - lastMoveGridY;

                // Decouple axes
                if (dx !== 0) {
                    nudgeSelection(dx, 0);
                    lastMoveGridX = currentGridX;
                }
                if (dy !== 0) {
                    nudgeSelection(0, dy);
                    lastMoveGridY = currentGridY;
                }
                return;
            }

            if (!isDrawing) return;

            if (isTargetPixel) {
                if (currentTool === 'fill') return;

                const pixelIndex = parseInt(target.dataset.index);
                const sprite = getActiveSprite();

                if (lastPixelIndex !== null && lastPixelIndex !== pixelIndex) {
                    const linePixels = getLinePixels(lastPixelIndex, pixelIndex);
                    linePixels.forEach(idx => paintPixel(sprite.id, idx));
                } else {
                    paintPixel(sprite.id, pixelIndex);
                }
                lastPixelIndex = pixelIndex;
            }
        }, { passive: false });

        document.addEventListener('touchend', () => {
            if (isMovingSelection) {
                isMovingSelection = false;
                lastMoveGridX = -1;
                lastMoveGridY = -1;
            }

            if (isDrawing) {
                isDrawing = false;
                lastPixelIndex = null;

                if (currentTool === 'select') {
                    handleLassoRelease();
                } else {
                    saveHistory(getActiveSprite());
                }

                // Update timeline preview to show the changes
                renderTimeline();
            }
        });




        // Tools
        tools.forEach(tool => {
            tool.addEventListener('click', (e) => {
                setTool(e.currentTarget.dataset.tool);
            });
        });

        // Keybindings
        document.addEventListener('keydown', (e) => {
            if (e.target.tagName === 'INPUT') return;

            if (e.key.toLowerCase() === 'b') setColor(PRESET_COLORS[0]); // Default to first color
            if (e.key.toLowerCase() === 'e') setColor(null);
            if (e.key.toLowerCase() === 'f') setTool('fill');
            if (e.key.toLowerCase() === 's') setTool('select');
            if (e.key.toLowerCase() === 'h' && selectedPixels.size > 0) flipSelectionHorizontally();
            if (e.key.toLowerCase() === 'v' && selectedPixels.size > 0) flipSelectionVertically();
            if (e.key.toLowerCase() === 'q' && selectedPixels.size > 0) rotateSelectionLeft();
            if (e.key.toLowerCase() === 'e' && selectedPixels.size > 0) rotateSelectionRight();

            // Nudge with arrow keys
            if (selectedPixels.size > 0) {
                if (e.key === 'ArrowUp') { e.preventDefault(); nudgeSelection(0, -1); }
                if (e.key === 'ArrowDown') { e.preventDefault(); nudgeSelection(0, 1); }
                if (e.key === 'ArrowLeft') { e.preventDefault(); nudgeSelection(-1, 0); }
                if (e.key === 'ArrowRight') { e.preventDefault(); nudgeSelection(1, 0); }
            }

            if (e.key.toLowerCase() === 'o') toggleOnionSkinning();
            if ((e.metaKey || e.ctrlKey)) {
                if (e.shiftKey && e.key.toLowerCase() === 'z') {
                    e.preventDefault();
                    redo();
                } else if (e.key.toLowerCase() === 'z') {
                    e.preventDefault();
                    undo();
                } else if (e.key.toLowerCase() === 'y') {
                    e.preventDefault();
                    redo();
                }
            }
        });

        // Actions
        clearBtn.addEventListener('click', clearGrid);
        undoBtn.addEventListener('click', undo);
        redoBtn.addEventListener('click', redo);


        // Transform Controls (Class-based for multiple instances)
        document.querySelectorAll('.js-flip-h').forEach(btn =>
            btn.addEventListener('click', flipSelectionHorizontally));
        document.querySelectorAll('.js-flip-v').forEach(btn =>
            btn.addEventListener('click', flipSelectionVertically));
        document.querySelectorAll('.js-rotate-l').forEach(btn =>
            btn.addEventListener('click', rotateSelectionLeft));
        document.querySelectorAll('.js-rotate-r').forEach(btn =>
            btn.addEventListener('click', rotateSelectionRight));

        exportBtn.addEventListener('click', exportToPNG);

        // JSON Import/Export
        exportJsonBtn.addEventListener('click', exportToJSON);
        importJsonBtn.addEventListener('click', () => {
            jsonFileInput.click();
        });

        jsonFileInput.addEventListener('change', async (e) => {
            const files = Array.from(e.target.files);
            if (files.length === 0) return;

            const readFile = (file) => {
                return new Promise((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = (event) => resolve({ file, content: event.target.result });
                    reader.onerror = (error) => reject(error);
                    reader.readAsText(file);
                });
            };

            try {
                const results = await Promise.all(files.map(readFile));

                if (results.length === 1) {
                    // Single file: Overwrite current active sprite
                    const { content, file } = results[0];
                    try {
                        const jsonData = JSON.parse(content);
                        importFromJSON(jsonData);
                    } catch (err) {
                        alert(`Failed to parse ${file.name}: ${err.message}`);
                    }
                } else {
                    // Multiple files: Append as new sprites
                    let importedCount = 0;
                    for (const { content, file } of results) {
                        if (sprites.length >= MAX_SPRITES) {
                            alert(`Reached maximum of ${MAX_SPRITES} sprites. Stopped at ${file.name}`);
                            break;
                        }

                        try {
                            const jsonData = JSON.parse(content);
                            validatePixels(jsonData.pixels);

                            // Create new sprite for this file
                            const newSprite = {
                                id: nextSpriteId++,
                                name: file.name.replace('.json', ''),
                                pixelData: [...jsonData.pixels],
                                history: [[...jsonData.pixels]]
                            };
                            sprites.push(newSprite);
                            importedCount++;
                        } catch (err) {
                            alert(`Skipping ${file.name}: ${err.message}`);
                        }
                    }

                    if (importedCount > 0) {
                        // Select the last imported sprite
                        activeSprite = sprites.length - 1;
                        renderMainEditor();
                        renderTimeline();
                    }
                }
            } catch (err) {
                alert(`Error reading files: ${err.message}`);
            }

            e.target.value = '';
        });






        playStopBtn.addEventListener('click', () => {
            if (isPlaying) {
                stopAnimation();
            } else {
                playAnimation();
            }
        });

        onionBtn.addEventListener('click', toggleOnionSkinning);

        // Prevent globe/no-drop cursor during drag
        timelineContainer.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
        });

        // Document-level dragover to prevent globe cursor anywhere
        document.addEventListener('dragover', (e) => {
            if (draggedElement) {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
            }
        });

    }

    init();
});
