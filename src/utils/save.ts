import type { Palette, PixelData, Sprite } from '../types';
import {
    createBlankPixelData,
    pixelDataToColorArray,
    TRANSPARENT_PIXEL
} from './pixelData';
import type { LayerExportMode } from './export';

export const getTimestamp = (): string => {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const hh = String(now.getHours()).padStart(2, '0');
    const min = String(now.getMinutes()).padStart(2, '0');
    return `${yyyy}${mm}${dd}_${hh}${min}`;
};

export const compressPixelData = (pixelData: PixelData): (number | null)[] => (
    Array.from(pixelData, value => (
        value === TRANSPARENT_PIXEL ? null : value - 1
    ))
);

export const decompressPixelData = (indices: (number | null)[], palette: Palette): PixelData => {
    const pixelData = createBlankPixelData(indices.length);
    indices.forEach((index, pixelIndex) => {
        if (index === null || index < 0 || index >= palette.length) return;
        pixelData[pixelIndex] = index + 1;
    });
    return pixelData;
};

export interface ProjectJSON {
    type: 'project';
    version: string;
    name: string;
    width: number;
    height: number;
    fps: number;
    palette: string[];
    /** Leading palette entries shown as preset slots. Absent in pre-1.1 files. */
    presetCount?: number;
    frames: {
        id: number;
        name: string;
        pixelData: (number | null)[];
        overlayPixelData: (number | null)[];
    }[];
}

export const saveProjectJSON = (projectName: string, sprites: Sprite[], fps: number, palette: Palette, presetCount: number, gridSize: number) => {
    const projectData: ProjectJSON = {
        type: 'project',
        version: '1.1',
        name: projectName,
        width: gridSize,
        height: gridSize,
        fps: fps,
        palette,
        presetCount,
        frames: sprites.map(sprite => ({
            id: sprite.id,
            name: sprite.name,
            pixelData: compressPixelData(sprite.pixelData),
            overlayPixelData: compressPixelData(sprite.overlayPixelData)
        }))
    };

    const jsonString = JSON.stringify(projectData, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", url);
    downloadAnchorNode.setAttribute("download", `${projectName}_${getTimestamp()}.json`);
    document.body.appendChild(downloadAnchorNode); // required for firefox
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
    URL.revokeObjectURL(url);
};

export const loadProjectJSON = (file: File): Promise<ProjectJSON> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = JSON.parse(e.target?.result as string);
                if (data.type !== 'project') {
                    throw new Error('Invalid file type. Expected a project file.');
                }
                resolve(data as ProjectJSON);
            } catch (err) {
                reject(err);
            }
        };
        reader.onerror = () => reject(new Error('File reading failed'));
        reader.readAsText(file);
    });
};

export const exportSpritesToJSON = (
    projectName: string,
    sprites: Sprite[],
    layerMode: LayerExportMode,
    palette: Palette,
    frameIndex?: number
) => {
    // We export a subset of data representing individual frames
    const exportData = sprites.map(sprite => {
        let pixelsToExport = sprite.pixelData;
        let overlayPixelsToExport = sprite.overlayPixelData;

        // Apply layer mode logic
        if (layerMode === 'top') {
            pixelsToExport = createBlankPixelData(sprite.pixelData.length);
        } else if (layerMode === 'base') {
            overlayPixelsToExport = createBlankPixelData(sprite.overlayPixelData.length);
        }

        return {
            name: sprite.name,
            pixels: pixelDataToColorArray(pixelsToExport, palette),
            overlayPixels: pixelDataToColorArray(overlayPixelsToExport, palette)
        };
    });

    const jsonString = JSON.stringify(exportData, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", url);

    // Choose suffix based on number of sprites
    let suffix = `_selected_frames`;
    if (sprites.length === 1 && frameIndex !== undefined) {
        const formattedIndex = String(frameIndex + 1).padStart(2, '0');
        suffix = `_frame_${formattedIndex}`;
    }

    downloadAnchorNode.setAttribute("download", `${projectName}${suffix}_${layerMode}_${getTimestamp()}.json`);

    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
    URL.revokeObjectURL(url);
};
