import type { PropsWithChildren } from 'react';
import { createContext, useContext, useEffect, useMemo, useReducer } from 'react';

const STORAGE_KEY = 'user_subcontrols_collapsed_v1';

interface ToolbarState {
  subcontrolsCollapsed: boolean;
  hideMiss: boolean;
  showCounts: boolean;
  showSkipOnly: boolean;
  keyword: string;
}

type ToolbarAction =
  | { type: 'toggleSubcontrols' }
  | { type: 'setSubcontrolsCollapsed'; payload: boolean }
  | { type: 'toggleHideMiss' }
  | { type: 'toggleShowCounts' }
  | { type: 'toggleShowSkipOnly' }
  | { type: 'setKeyword'; payload: string }
  | { type: 'resetFilters' };

const initialState: ToolbarState = {
  subcontrolsCollapsed: false,
  hideMiss: false,
  showCounts: true,
  showSkipOnly: false,
  keyword: ''
};

function reducer(state: ToolbarState, action: ToolbarAction): ToolbarState {
  switch (action.type) {
    case 'toggleSubcontrols':
      return { ...state, subcontrolsCollapsed: !state.subcontrolsCollapsed };
    case 'setSubcontrolsCollapsed':
      return { ...state, subcontrolsCollapsed: action.payload };
    case 'toggleHideMiss':
      return { ...state, hideMiss: !state.hideMiss };
    case 'toggleShowCounts':
      return { ...state, showCounts: !state.showCounts };
    case 'toggleShowSkipOnly':
      return { ...state, showSkipOnly: !state.showSkipOnly };
    case 'setKeyword':
      return { ...state, keyword: action.payload };
    case 'resetFilters':
      return { ...state, hideMiss: false, showCounts: true, showSkipOnly: false, keyword: '' };
    default:
      return state;
  }
}

interface ToolbarContextValue {
  state: ToolbarState;
  actions: {
    toggleSubcontrols(): void;
    toggleHideMiss(): void;
    toggleShowCounts(): void;
    toggleShowSkipOnly(): void;
    setKeyword(value: string): void;
    resetFilters(): void;
  };
}

const ToolbarContext = createContext<ToolbarContextValue | undefined>(undefined);

export function ToolbarStateProvider({ children }: PropsWithChildren): JSX.Element {
  const [state, dispatch] = useReducer(reducer, initialState, (baseState) => {
    if (typeof window === 'undefined') {
      return baseState;
    }
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored != null) {
      return {
        ...baseState,
        subcontrolsCollapsed: stored === '1' || stored === 'true'
      };
    }
    return baseState;
  });

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    window.localStorage.setItem(
      STORAGE_KEY,
      state.subcontrolsCollapsed ? '1' : '0'
    );
  }, [state.subcontrolsCollapsed]);

  const actions = useMemo(
    () => ({
      toggleSubcontrols: () => dispatch({ type: 'toggleSubcontrols' }),
      toggleHideMiss: () => dispatch({ type: 'toggleHideMiss' }),
      toggleShowCounts: () => dispatch({ type: 'toggleShowCounts' }),
      toggleShowSkipOnly: () => dispatch({ type: 'toggleShowSkipOnly' }),
      setKeyword: (value: string) => dispatch({ type: 'setKeyword', payload: value }),
      resetFilters: () => dispatch({ type: 'resetFilters' })
    }),
    []
  );

  const value = useMemo(() => ({ state, actions }), [state, actions]);

  return <ToolbarContext.Provider value={value}>{children}</ToolbarContext.Provider>;
}

export function useToolbarState(): ToolbarContextValue {
  const context = useContext(ToolbarContext);
  if (!context) {
    throw new Error('useToolbarState must be used within ToolbarStateProvider');
  }
  return context;
}
