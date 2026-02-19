import React, { useEffect, useRef } from 'react';
import { GRID_SIZE } from '../types';

interface MagnifyingGlassProps {
    screenX: number;
    screenY: number;
    gridX: number;
    gridY: number;
    pixelData: (string | null)[];
    floatingLayer: Map<number, string>;
    gridSize?: number;
    targetColor: string | null;
}

export const MagnifyingGlass: React.FC<MagnifyingGlassProps> = ({
    screenX,
    screenY,
    gridX,
    gridY,
    pixelData,
    floatingLayer,
    gridSize = GRID_SIZE,
    targetColor
}) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const GLASS_SIZE = 110;
    const ZOOM_PIXELS = 9;
    const OFFSET_Y = -90; // Up

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Clear and circular clip
        ctx.save();
        ctx.beginPath();
        ctx.arc(GLASS_SIZE / 2, GLASS_SIZE / 2, GLASS_SIZE / 2, 0, Math.PI * 2);
        ctx.clip();

        ctx.fillStyle = '#1a1a1a';
        ctx.fillRect(0, 0, GLASS_SIZE, GLASS_SIZE);

        ctx.imageSmoothingEnabled = false;

        const centerX = Math.floor(gridX);
        const centerY = Math.floor(gridY);
        const radius = Math.floor(ZOOM_PIXELS / 2);
        const pixelDrawSize = GLASS_SIZE / ZOOM_PIXELS;

        // Draw Pixels
        for (let r = 0; r < ZOOM_PIXELS; r++) {
            for (let c = 0; c < ZOOM_PIXELS; c++) {
                const pxX = centerX - radius + c;
                const pxY = centerY - radius + r;

                const drawX = c * pixelDrawSize;
                const drawY = r * pixelDrawSize;

                if (pxX >= 0 && pxX < gridSize && pxY >= 0 && pxY < gridSize) {
                    // Checkerboard
                    ctx.fillStyle = (pxX + pxY) % 2 === 0 ? '#2a2a2a' : '#333';
                    ctx.fillRect(drawX, drawY, pixelDrawSize, pixelDrawSize);

                    // Color
                    const idx = pxY * gridSize + pxX;
                    const color = floatingLayer.has(idx) ? floatingLayer.get(idx) : pixelData[idx];

                    if (color) {
                        ctx.fillStyle = color;
                        ctx.fillRect(drawX, drawY, pixelDrawSize, pixelDrawSize);
                    }
                } else {
                    ctx.fillStyle = '#000';
                    ctx.fillRect(drawX, drawY, pixelDrawSize, pixelDrawSize);
                }
            }
        }

        // Grid Lines
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let i = 1; i < ZOOM_PIXELS; i++) {
            ctx.moveTo(i * pixelDrawSize, 0);
            ctx.lineTo(i * pixelDrawSize, GLASS_SIZE);
            ctx.moveTo(0, i * pixelDrawSize);
            ctx.lineTo(GLASS_SIZE, i * pixelDrawSize);
        }
        ctx.stroke();

        // Center Selection Box
        const centerStart = Math.floor(ZOOM_PIXELS / 2) * pixelDrawSize;
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 2;
        ctx.strokeRect(centerStart, centerStart, pixelDrawSize, pixelDrawSize);

        ctx.restore();

        // Draw Ring Border (Target Color)
        ctx.beginPath();
        ctx.arc(GLASS_SIZE / 2, GLASS_SIZE / 2, GLASS_SIZE / 2 - 2, 0, Math.PI * 2);
        ctx.strokeStyle = targetColor || '#fff';
        ctx.lineWidth = 4;
        ctx.stroke();

        // Inner white ring for contrast
        ctx.beginPath();
        ctx.arc(GLASS_SIZE / 2, GLASS_SIZE / 2, GLASS_SIZE / 2 - 4, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(0,0,0,0.3)';
        ctx.lineWidth = 1;
        ctx.stroke();

    }, [gridX, gridY, pixelData, floatingLayer, gridSize, targetColor]);

    return (
        <div
            style={{
                position: 'fixed',
                left: screenX - (GLASS_SIZE / 2),
                top: screenY + OFFSET_Y - (GLASS_SIZE / 2),
                width: GLASS_SIZE,
                height: GLASS_SIZE,
                borderRadius: '50%',
                boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
                zIndex: 9999,
                pointerEvents: 'none',
                overflow: 'hidden',
                background: '#000'
            }}
        >
            <canvas
                ref={canvasRef}
                width={GLASS_SIZE}
                height={GLASS_SIZE}
                style={{ width: '100%', height: '100%' }} // No scaling logic needed here, native res
            />
        </div>
    );
};
