const STORAGE_KEY = 'user_subcontrols_collapsed_v1';

export function loadToolbarSubcontrolsCollapsed(fallback: boolean): boolean {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    return fallback;
  }

  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored == null) {
      return fallback;
    }
    return stored === '1' || stored.toLowerCase() === 'true';
  } catch (error) {
    console.warn('Failed to load toolbar subcontrols collapsed state', error);
    return fallback;
  }
}

export function saveToolbarSubcontrolsCollapsed(collapsed: boolean): void {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(STORAGE_KEY, collapsed ? '1' : '0');
  } catch (error) {
    console.error('Failed to persist toolbar subcontrols collapsed state', error);
  }
}

export function clearToolbarPreferencesStorage(): void {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    return;
  }

  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.error('Failed to clear toolbar state from localStorage', error);
  }
}

export { STORAGE_KEY as TOOLBAR_SUBCONTROLS_STORAGE_KEY };
