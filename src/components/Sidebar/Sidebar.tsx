import React, { useRef, useEffect } from 'react';
import { RecentColors } from './RecentColors';
import { PaletteGrid } from './PaletteGrid';
import { EditorControls } from './EditorControls';

export const Sidebar: React.FC = () => {
    const paletteRef = useRef<HTMLDivElement>(null);
    const animationAbortedRef = useRef(false);

    useEffect(() => {
        const hintScroll = async () => {
            if (!paletteRef.current || animationAbortedRef.current) return;
            try {
                paletteRef.current.scrollTo({ top: 80, behavior: 'smooth' });
                await new Promise(r => setTimeout(r, 450));
                if (animationAbortedRef.current) return;
                paletteRef.current.scrollTo({ top: 0, behavior: 'smooth' });
                await new Promise(r => setTimeout(r, 450));
                if (animationAbortedRef.current) return;
                paletteRef.current.scrollTo({ top: 80, behavior: 'smooth' });
                await new Promise(r => setTimeout(r, 450));
                if (animationAbortedRef.current) return;
                paletteRef.current.scrollTo({ top: 0, behavior: 'smooth' });
            } catch {
                // Fallback for older browsers
            }
        };
        hintScroll();
    }, []);

    const handleInteraction = () => {
        animationAbortedRef.current = true;
    };

    return (
        <aside
            className="panel tools-panel"
            onPointerDown={handleInteraction}
            onWheel={handleInteraction}
            onTouchStart={handleInteraction}
        >
            <EditorControls />

            <div className="palette-sidebar" ref={paletteRef}>
                <RecentColors />
                <PaletteGrid />
            </div>
        </aside>
    );
};
