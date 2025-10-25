import { useCallback, useEffect } from 'react';
import type { QueryClient } from '@tanstack/react-query';
import { useQuery, useQueryClient } from '@tanstack/react-query';

export interface DiscordUserProfile {
  id: string;
  name?: string;
  avatar?: string;
}

export interface DiscordSessionData {
  ok: boolean;
  loggedIn?: boolean;
  user?: DiscordUserProfile;
}

export interface UseDiscordSessionResult {
  data?: DiscordSessionData;
  isLoading: boolean;
  isError: boolean;
  login(): Promise<void>;
  logout(): Promise<void>;
  refetch(): Promise<DiscordSessionData | undefined>;
}

interface DiscordAuthorizeResponse {
  ok: boolean;
  authorizeUrl: string;
  appAuthorizeUrl?: string;
  handoffToken?: string;
  handoffExpiresAt?: number;
  loginContext?: 'browser' | 'pwa';
}

interface DiscordHandoffState {
  token: string;
  expiresAt: number;
  createdAt: number;
}

const HANDOFF_STORAGE_KEY = 'discordHandoffState';
const HANDOFF_DEFAULT_DURATION_MS = 5 * 60 * 1000;
const HANDOFF_POLL_INTERVAL_MS = 1500;
const HANDOFF_BACKGROUND_TIMEOUT_MS = 5000;

let inMemoryHandoffState: DiscordHandoffState | null = null;
let handoffWatcherActive = false;
let handoffWatcherTimer: ReturnType<typeof setInterval> | null = null;
let handoffAttemptInFlight = false;
let handoffFocusHandler: (() => void) | null = null;
let handoffVisibilityHandler: (() => void) | null = null;
let handoffBlurHandler: (() => void) | null = null;
let handoffPageHideHandler: (() => void) | null = null;
let handoffWatcherQueryClient: QueryClient | null = null;
let handoffWatcherHasBackgrounded = false;

function readStoredHandoffState(): DiscordHandoffState | null {
  if (inMemoryHandoffState) {
    return inMemoryHandoffState;
  }

  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const raw = window.sessionStorage?.getItem(HANDOFF_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') {
      window.sessionStorage.removeItem(HANDOFF_STORAGE_KEY);
      return null;
    }
    const token = typeof parsed.token === 'string' ? parsed.token : null;
    const expiresAt = typeof parsed.expiresAt === 'number' ? parsed.expiresAt : null;
    const createdAt =
      typeof parsed.createdAt === 'number' && Number.isFinite(parsed.createdAt)
        ? parsed.createdAt
        : Date.now();
    if (!token || !expiresAt || !Number.isFinite(expiresAt)) {
      window.sessionStorage.removeItem(HANDOFF_STORAGE_KEY);
      return null;
    }
    const state: DiscordHandoffState = { token, expiresAt, createdAt };
    inMemoryHandoffState = state;
    return state;
  } catch (error) {
    console.warn('Discord handoff state could not be loaded from sessionStorage', error);
    return inMemoryHandoffState;
  }
}

function writeStoredHandoffState(state: DiscordHandoffState | null): void {
  inMemoryHandoffState = state;
  if (typeof window === 'undefined') {
    return;
  }
  try {
    if (state) {
      window.sessionStorage?.setItem(HANDOFF_STORAGE_KEY, JSON.stringify(state));
    } else {
      window.sessionStorage?.removeItem(HANDOFF_STORAGE_KEY);
    }
  } catch (error) {
    console.warn('Discord handoff state could not be persisted to sessionStorage', error);
  }
}

function clearStoredHandoffState(): void {
  writeStoredHandoffState(null);
  handoffWatcherHasBackgrounded = false;
}

function storeHandoffState(token: string, expiresAt?: number): void {
  const now = Date.now();
  const safeExpiresAt =
    typeof expiresAt === 'number' && Number.isFinite(expiresAt)
      ? expiresAt
      : now + HANDOFF_DEFAULT_DURATION_MS;
  writeStoredHandoffState({ token, expiresAt: safeExpiresAt, createdAt: now });
  if (typeof document !== 'undefined') {
    handoffWatcherHasBackgrounded = document.visibilityState === 'hidden';
  } else {
    handoffWatcherHasBackgrounded = false;
  }
}

function stopHandoffWatcher(): void {
  if (typeof window !== 'undefined' && handoffWatcherTimer !== null) {
    window.clearInterval(handoffWatcherTimer);
  }
  if (typeof window !== 'undefined' && handoffFocusHandler) {
    window.removeEventListener('focus', handoffFocusHandler);
  }
  if (typeof document !== 'undefined' && handoffVisibilityHandler) {
    document.removeEventListener('visibilitychange', handoffVisibilityHandler);
  }
  if (typeof window !== 'undefined' && handoffBlurHandler) {
    window.removeEventListener('blur', handoffBlurHandler);
  }
  if (typeof window !== 'undefined' && handoffPageHideHandler) {
    window.removeEventListener('pagehide', handoffPageHideHandler);
  }
  handoffWatcherTimer = null;
  handoffFocusHandler = null;
  handoffVisibilityHandler = null;
  handoffBlurHandler = null;
  handoffPageHideHandler = null;
  handoffWatcherActive = false;
  handoffAttemptInFlight = false;
  handoffWatcherQueryClient = null;
  handoffWatcherHasBackgrounded = false;
}

async function attemptDiscordSessionHandoff(): Promise<boolean> {
  if (handoffAttemptInFlight) {
    return false;
  }

  const state = readStoredHandoffState();
  if (!state) {
    stopHandoffWatcher();
    return false;
  }

  if (typeof window === 'undefined') {
    return false;
  }

  const now = Date.now();
  if (state.expiresAt <= now) {
    console.warn('Discord handoff token expired before completion');
    clearStoredHandoffState();
    stopHandoffWatcher();
    return false;
  }

  handoffAttemptInFlight = true;

  try {
    const response = await fetch('/api/auth/discord/handoff', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({ token: state.token }),
    });

    if (response.status === 404) {
      return false;
    }

    if (response.status === 410) {
      console.warn('Discord handoff token expired on server before completion');
      clearStoredHandoffState();
      stopHandoffWatcher();
      return false;
    }

    if (!response.ok) {
      console.error('Discord handoff endpoint returned an unexpected response', response.status);
      return false;
    }

    clearStoredHandoffState();
    stopHandoffWatcher();

    const queryClient = handoffWatcherQueryClient;
    if (queryClient) {
      await queryClient.invalidateQueries({ queryKey: ['discord', 'session'] });
      await queryClient.fetchQuery({
        queryKey: ['discord', 'session'],
        queryFn: fetchSession,
      });
    }

    return true;
  } catch (error) {
    console.error('Discord handoff attempt failed', error);
    return false;
  } finally {
    handoffAttemptInFlight = false;
  }
}

function ensureHandoffWatcher(queryClient: QueryClient): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return;
  }

  const state = readStoredHandoffState();
  if (!state) {
    stopHandoffWatcher();
    return;
  }

  if (!handoffWatcherHasBackgrounded && document.visibilityState === 'hidden') {
    handoffWatcherHasBackgrounded = true;
  }

  handoffWatcherQueryClient = queryClient;

  const attemptIfReady = () => {
    const currentState = readStoredHandoffState();
    if (!currentState) {
      stopHandoffWatcher();
      return;
    }

    if (!handoffWatcherHasBackgrounded) {
      if (Date.now() - currentState.createdAt > HANDOFF_BACKGROUND_TIMEOUT_MS) {
        handoffWatcherHasBackgrounded = true;
      } else {
        return;
      }
    }

    if (document.visibilityState !== 'visible') {
      return;
    }

    void attemptDiscordSessionHandoff();
  };

  if (handoffWatcherActive) {
    return;
  }

  handoffWatcherActive = true;

  handoffBlurHandler = () => {
    handoffWatcherHasBackgrounded = true;
  };
  handoffPageHideHandler = () => {
    handoffWatcherHasBackgrounded = true;
  };
  handoffFocusHandler = () => {
    attemptIfReady();
  };
  handoffVisibilityHandler = () => {
    if (document.visibilityState === 'hidden') {
      handoffWatcherHasBackgrounded = true;
      return;
    }

    attemptIfReady();
  };

  window.addEventListener('blur', handoffBlurHandler);
  window.addEventListener('focus', handoffFocusHandler);
  window.addEventListener('pagehide', handoffPageHideHandler);
  document.addEventListener('visibilitychange', handoffVisibilityHandler);
  handoffWatcherTimer = window.setInterval(attemptIfReady, HANDOFF_POLL_INTERVAL_MS);
  attemptIfReady();
}

function isProbablyMobileDevice(): boolean {
  if (typeof navigator === 'undefined') {
    return false;
  }

  const maybeNavigator = navigator as Navigator & { userAgentData?: { mobile?: boolean } };
  const uaData = maybeNavigator.userAgentData;
  if (uaData && typeof uaData.mobile === 'boolean') {
    return uaData.mobile;
  }

  const userAgent = navigator.userAgent || '';
  return /Android|iPhone|iPad|iPod/i.test(userAgent);
}

function openDiscordAppWithFallback(appAuthorizeUrl: string, webAuthorizeUrl: string): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    throw new Error('Discord deep link is not available in this environment');
  }

  let fallbackTimer: ReturnType<typeof setTimeout> | null = null;

  const clearFallback = () => {
    if (fallbackTimer !== null) {
      clearTimeout(fallbackTimer);
      fallbackTimer = null;
    }
    document.removeEventListener('visibilitychange', handleVisibilityChange);
  };

  const handleVisibilityChange = () => {
    if (document.visibilityState === 'hidden') {
      clearFallback();
    }
  };

  document.addEventListener('visibilitychange', handleVisibilityChange);

  fallbackTimer = window.setTimeout(() => {
    clearFallback();
    window.location.assign(webAuthorizeUrl);
  }, 2000);

  window.location.assign(appAuthorizeUrl);
}

function resolveLoginContext(): 'browser' | 'pwa' {
  if (typeof window === 'undefined') {
    return 'browser';
  }

  const mediaStandalone = typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches;
  const navigatorWithStandalone = window.navigator as Navigator & { standalone?: boolean };
  const isIosStandalone = typeof navigatorWithStandalone.standalone === 'boolean' && navigatorWithStandalone.standalone;

  return mediaStandalone || isIosStandalone ? 'pwa' : 'browser';
}

async function fetchSession(): Promise<DiscordSessionData> {
  const response = await fetch('/api/discord/me?soft=1', {
    headers: {
      Accept: 'application/json'
    },
    credentials: 'include'
  });

  if (!response.ok) {
    throw new Error('Failed to fetch discord session');
  }

  return (await response.json()) as DiscordSessionData;
}

export function useDiscordSession(): UseDiscordSessionResult {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['discord', 'session'],
    queryFn: fetchSession
  });

  useEffect(() => {
    ensureHandoffWatcher(queryClient);
  }, [queryClient]);

  const login = useCallback(async () => {
    const baseLoginUrl = '/api/auth/discord/start';
    const loginContext = resolveLoginContext();
    const loginUrl = `${baseLoginUrl}?context=${encodeURIComponent(loginContext)}`;

    try {
      const response = await fetch(loginUrl, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error(`Failed to initiate Discord authorization: ${response.status}`);
      }

      const contentType = response.headers.get('Content-Type') ?? '';
      if (!contentType.toLowerCase().includes('application/json')) {
        throw new Error('Discord authorization endpoint returned an unexpected response');
      }

      const payload = (await response.json()) as DiscordAuthorizeResponse;
      if (!payload.ok || !payload.authorizeUrl) {
        throw new Error('Discord authorization payload is invalid');
      }

      const authorizeUrl = payload.authorizeUrl;
      const appAuthorizeUrl = payload.appAuthorizeUrl;

      if (payload.handoffToken && loginContext === 'pwa') {
        storeHandoffState(payload.handoffToken, payload.handoffExpiresAt);
        ensureHandoffWatcher(queryClient);
      }

      if (appAuthorizeUrl && isProbablyMobileDevice()) {
        try {
          openDiscordAppWithFallback(appAuthorizeUrl, authorizeUrl);
          return;
        } catch (deeplinkError) {
          console.error('Discordディープリンクの起動に失敗しました。Web認証にフォールバックします', deeplinkError);
        }
      }

      window.location.assign(authorizeUrl);
    } catch (assignError) {
      console.error('Discordログインのディープリンク開始に失敗しました。Webリダイレクトにフォールバックします', assignError);

      try {
        window.location.assign(loginUrl);
        return;
      } catch (fallbackError) {
        console.error('Discordログインのフォールバックリダイレクトにも失敗しました', fallbackError);
        throw fallbackError instanceof Error ? fallbackError : new Error('Failed to initiate Discord login redirect');
      }
    }
  }, []);

  const logout = useCallback(async () => {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    await queryClient.invalidateQueries({ queryKey: ['discord', 'session'] });
  }, [queryClient]);

  const refetch = useCallback(async () => {
    const result = await query.refetch();
    return result.data;
  }, [query]);

  return {
    data: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
    login,
    logout,
    refetch
  };
}
