import { describe, expect, it } from 'vitest';
import { createEditorUiStore } from '../stores/editorStore';
import {
    ensurePaletteColor,
    MAX_ENCODED_COLORS
} from './pixelData';

describe('wide palette encoding', () => {
    it('keeps remap values above 255 during keep-mode palette changes', () => {
        const store = createEditorUiStore();
        store.setState({ notify: () => undefined });
        const palette = Array.from({ length: 300 }, (_, index) => (
            `#${index.toString(16).padStart(6, '0')}`
        ));
        store.setState(state => {
            const pixelData = state.sprites[0].pixelData.slice();
            pixelData[0] = 300;
            return {
                palette,
                presetCount: 255,
                sprites: [{ ...state.sprites[0], pixelData }]
            };
        });

        store.getState().applyPalette(palette.slice(0, 255), 'keep');
        const state = store.getState();
        expect(state.sprites[0].pixelData[0]).toBe(256);
        expect(state.palette[255]).toBe(palette[299]);
    });

    it('fails visibly at encoded capacity instead of returning transparency', () => {
        const fullPalette = Array<string>(MAX_ENCODED_COLORS).fill('#000000');
        expect(() => ensurePaletteColor(fullPalette, '#ffffff')).toThrow(RangeError);
    });
});
