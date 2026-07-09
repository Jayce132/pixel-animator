import { useState, useEffect } from 'react';

const MOBILE_BREAKPOINT = 768;

export const useIsMobile = () => {
    const query = `(max-width: ${MOBILE_BREAKPOINT}px) and (orientation: portrait)`;

    const [isMobile, setIsMobile] = useState(
        () => window.matchMedia(query).matches
    );

    useEffect(() => {
        const mql = window.matchMedia(query);
        const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
        mql.addEventListener('change', handler);
        return () => mql.removeEventListener('change', handler);
    }, [query]);

    return isMobile;
};
