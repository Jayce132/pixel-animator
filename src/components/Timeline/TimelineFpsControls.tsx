import React from 'react';

interface TimelineFpsControlsProps {
    fps: number;
    setFps: (fps: React.SetStateAction<number>) => void;
}

export const TimelineFpsControls: React.FC<TimelineFpsControlsProps> = ({
    fps,
    setFps
}) => {
    // FPS rapid adjustment
    const fpsIntervalRef = React.useRef<ReturnType<typeof setInterval> | null>(null);
    const fpsTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

    const stopFpsChange = React.useCallback(() => {
        if (fpsIntervalRef.current) {
            clearInterval(fpsIntervalRef.current);
            fpsIntervalRef.current = null;
        }
        if (fpsTimeoutRef.current) {
            clearTimeout(fpsTimeoutRef.current);
            fpsTimeoutRef.current = null;
        }
    }, []);

    const startFpsChange = React.useCallback((delta: number) => {
        setFps(prev => Math.max(1, Math.min(60, prev + delta)));
        fpsTimeoutRef.current = setTimeout(() => {
            fpsIntervalRef.current = setInterval(() => {
                setFps(prev => Math.max(1, Math.min(60, prev + delta)));
            }, 80);
        }, 400);
    }, [setFps]);

    React.useEffect(() => stopFpsChange, [stopFpsChange]);

    return (
        <div className="timeline-fps-controls">
            <button
                className="secondary-btn-small timeline-fps-button"
                onMouseDown={() => startFpsChange(-1)}
                onMouseUp={stopFpsChange}
                onMouseLeave={stopFpsChange}
            >
                &lt;
            </button>
            <span className="timeline-fps-value">{fps} FPS</span>
            <button
                className="secondary-btn-small timeline-fps-button"
                onMouseDown={() => startFpsChange(1)}
                onMouseUp={stopFpsChange}
                onMouseLeave={stopFpsChange}
            >
                &gt;
            </button>
        </div>
    );
};
