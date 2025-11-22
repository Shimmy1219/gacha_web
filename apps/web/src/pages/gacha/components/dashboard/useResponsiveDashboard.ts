import { useEffect, useState } from 'react';

const MOBILE_QUERY = '(max-width: 1024px), (pointer: coarse)';
const SIDEBAR_FALLBACK_QUERY = '(min-width: 901px) and (max-width: 1025px)';

interface ResponsiveDashboardState {
  isMobile: boolean;
  isLgDown: boolean;
  forceSidebarLayout: boolean;
}

function readResponsiveState(): ResponsiveDashboardState {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return { isMobile: false, isLgDown: false, forceSidebarLayout: false };
  }

  const isMobile = window.matchMedia(MOBILE_QUERY).matches;
  const isLgDown = window.matchMedia('(max-width: 1023px)').matches;
  const forceSidebarLayout = window.matchMedia(SIDEBAR_FALLBACK_QUERY).matches;

  return { isMobile, isLgDown, forceSidebarLayout };
}

export function useResponsiveDashboard(): ResponsiveDashboardState {
  const [state, setState] = useState<ResponsiveDashboardState>(() => readResponsiveState());

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return;
    }

    const mobileMedia = window.matchMedia(MOBILE_QUERY);
    const lgDownMedia = window.matchMedia('(max-width: 1023px)');
    const sidebarMedia = window.matchMedia(SIDEBAR_FALLBACK_QUERY);

    const update = () => {
      setState({
        isMobile: mobileMedia.matches,
        isLgDown: lgDownMedia.matches,
        forceSidebarLayout: sidebarMedia.matches
      });
    };

    update();

    const addListener = (media: MediaQueryList) => {
      if (typeof media.addEventListener === 'function') {
        media.addEventListener('change', update);
        return () => media.removeEventListener('change', update);
      }

      media.addListener(update);
      return () => media.removeListener(update);
    };

    const removeMobileListener = addListener(mobileMedia);
    const removeLgDownListener = addListener(lgDownMedia);
    const removeSidebarListener = addListener(sidebarMedia);

    return () => {
      removeMobileListener();
      removeLgDownListener();
      removeSidebarListener();
    };
  }, []);

  return state;
}
