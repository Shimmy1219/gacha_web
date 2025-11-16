import { useEffect, useState } from 'react';

const MOBILE_QUERY = '(max-width: 900px), (hover: none) and (pointer: coarse)';
const SIDEBAR_FALLBACK_QUERY = '(min-width: 901px) and (max-width: 1025px)';

interface ResponsiveDashboardState {
  isMobile: boolean;
  forceSidebarLayout: boolean;
}

function readResponsiveState(): ResponsiveDashboardState {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return { isMobile: false, forceSidebarLayout: false };
  }

  return {
    isMobile: window.matchMedia(MOBILE_QUERY).matches,
    forceSidebarLayout: window.matchMedia(SIDEBAR_FALLBACK_QUERY).matches
  };
}

export function useResponsiveDashboard(): ResponsiveDashboardState {
  const [state, setState] = useState<ResponsiveDashboardState>(() => readResponsiveState());

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return;
    }

    const mobileMedia = window.matchMedia(MOBILE_QUERY);
    const sidebarMedia = window.matchMedia(SIDEBAR_FALLBACK_QUERY);

    const update = () => {
      setState({
        isMobile: mobileMedia.matches,
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
    const removeSidebarListener = addListener(sidebarMedia);

    return () => {
      removeMobileListener();
      removeSidebarListener();
    };
  }, []);

  return state;
}
