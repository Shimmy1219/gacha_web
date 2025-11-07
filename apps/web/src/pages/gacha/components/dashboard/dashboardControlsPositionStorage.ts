export interface StoredControlsPosition {
  top: number;
  left: number;
}

export const DASHBOARD_CONTROLS_POSITION_STORAGE_KEY = 'dashboard-shell__controls-position';

export function loadStoredDashboardControlsPosition(): StoredControlsPosition | null {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(DASHBOARD_CONTROLS_POSITION_STORAGE_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as StoredControlsPosition;
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      typeof parsed.top === 'number' &&
      typeof parsed.left === 'number'
    ) {
      return parsed;
    }

    return null;
  } catch (error) {
    console.error('Failed to parse dashboard controls position from storage', error);
    return null;
  }
}

export function saveDashboardControlsPosition(position: StoredControlsPosition): void {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(
      DASHBOARD_CONTROLS_POSITION_STORAGE_KEY,
      JSON.stringify(position)
    );
  } catch (error) {
    console.error('Failed to persist dashboard controls position', error);
  }
}

export function clearDashboardControlsPositionStorage(): void {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    return;
  }

  try {
    window.localStorage.removeItem(DASHBOARD_CONTROLS_POSITION_STORAGE_KEY);
  } catch (error) {
    console.error('Failed to clear dashboard controls position from storage', error);
  }
}
