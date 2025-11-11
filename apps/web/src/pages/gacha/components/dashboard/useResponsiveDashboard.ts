import { useEffect, useState } from 'react';

const QUERY = '(max-width: 900px), (hover: none) and (pointer: coarse)';

export function useResponsiveDashboard(): { isMobile: boolean } {
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return false;
    }

    return window.matchMedia(QUERY).matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return;
    }

    const media = window.matchMedia(QUERY);
    const update = () => {
      setIsMobile(media.matches);
    };

    update();

    if (typeof media.addEventListener === 'function') {
      media.addEventListener('change', update);
      return () => media.removeEventListener('change', update);
    }

    media.addListener(update);
    return () => media.removeListener(update);
  }, []);

  return { isMobile };
}
