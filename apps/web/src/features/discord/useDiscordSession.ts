import { useCallback, useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

export interface DiscordUserProfile {
  id: string;
  name?: string;
  avatar?: string;
}

export interface DiscordSessionData {
  ok: boolean;
  loggedIn: boolean;
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
  state: string;
}

interface PendingPwaStateRecord {
  state: string;
  createdAt: number;
}

const PWA_PENDING_STATE_STORAGE_KEY = 'discord:pwa:pending_state';
const PWA_PENDING_STATE_MAX_AGE_MS = 10 * 60 * 1000; // 10 minutes
let localStorageAvailabilityCache: boolean | null = null;

function isLocalStorageAvailable(): boolean {
  if (localStorageAvailabilityCache !== null) {
    return localStorageAvailabilityCache;
  }
  if (typeof window === 'undefined') {
    return false;
  }
  try {
    const testKey = '__discord_auth_test__';
    window.localStorage.setItem(testKey, '1');
    window.localStorage.removeItem(testKey);
    localStorageAvailabilityCache = true;
    return localStorageAvailabilityCache;
  } catch (error) {
    console.warn('Discord PWA state persistence is unavailable', error);
    localStorageAvailabilityCache = false;
    return localStorageAvailabilityCache;
  }
}

function persistPendingPwaState(record: PendingPwaStateRecord): void {
  if (!isLocalStorageAvailable()) {
    return;
  }
  try {
    window.localStorage.setItem(PWA_PENDING_STATE_STORAGE_KEY, JSON.stringify(record));
  } catch (error) {
    console.warn('Failed to persist Discord PWA pending state', error);
  }
}

function clearPendingPwaState(): void {
  if (!isLocalStorageAvailable()) {
    return;
  }
  try {
    window.localStorage.removeItem(PWA_PENDING_STATE_STORAGE_KEY);
  } catch (error) {
    console.warn('Failed to clear Discord PWA pending state', error);
  }
}

function readPendingPwaState(): PendingPwaStateRecord | null {
  if (!isLocalStorageAvailable()) {
    return null;
  }
  try {
    const raw = window.localStorage.getItem(PWA_PENDING_STATE_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as Partial<PendingPwaStateRecord> | null;
    if (!parsed || typeof parsed.state !== 'string' || parsed.state.length === 0) {
      window.localStorage.removeItem(PWA_PENDING_STATE_STORAGE_KEY);
      return null;
    }
    const createdAt = typeof parsed.createdAt === 'number' ? parsed.createdAt : Date.now();
    if (Date.now() - createdAt > PWA_PENDING_STATE_MAX_AGE_MS) {
      window.localStorage.removeItem(PWA_PENDING_STATE_STORAGE_KEY);
      return null;
    }
    return { state: parsed.state, createdAt };
  } catch (error) {
    console.warn('Failed to read Discord PWA pending state', error);
    try {
      window.localStorage.removeItem(PWA_PENDING_STATE_STORAGE_KEY);
    } catch (cleanupError) {
      console.warn('Failed to cleanup invalid Discord PWA pending state', cleanupError);
    }
    return null;
  }
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
  const claimInProgressRef = useRef(false);

  const query = useQuery({
    queryKey: ['discord', 'session'],
    queryFn: fetchSession,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false
  });

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
      const state = payload.state;

      if (typeof state !== 'string' || state.length === 0) {
        throw new Error('Discord authorization state is missing in response');
      }

      if (loginContext === 'pwa') {
        const statePreview = state.length > 8 ? `${state.slice(0, 4)}...` : state;
        console.info('Discord PWA ログイン state を保存します', { statePreview });
        persistPendingPwaState({ state, createdAt: Date.now() });
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

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const loginContext = resolveLoginContext();
    if (loginContext !== 'pwa') {
      return;
    }

    const pendingState = readPendingPwaState();
    if (!pendingState) {
      return;
    }

    const state = pendingState.state;
    const statePreview = state.length > 8 ? `${state.slice(0, 4)}...` : state;
    const controller = new AbortController();

    const claimSession = async () => {
      if (claimInProgressRef.current) {
        return;
      }
      claimInProgressRef.current = true;
      try {
        console.info('Discord PWA セッション復旧を開始します', { statePreview });
        const response = await fetch('/api/auth/discord/claim-session', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          credentials: 'include',
          body: JSON.stringify({ state }),
          signal: controller.signal,
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.warn('Discord PWA セッション復旧に失敗しました', {
            statePreview,
            status: response.status,
            body: errorText,
          });
          return;
        }

        const contentType = response.headers.get('Content-Type') ?? '';
        if (!contentType.toLowerCase().includes('application/json')) {
          console.warn('Discord PWA セッション復旧レスポンスの形式が不正です', {
            statePreview,
          });
          return;
        }

        const payload = (await response.json()) as { ok?: boolean; claimed?: boolean };
        if (!payload?.ok || !payload?.claimed) {
          console.warn('Discord PWA セッション復旧レスポンスが不正です', {
            statePreview,
            payload,
          });
          return;
        }

        clearPendingPwaState();
        console.info('Discord PWA セッション復旧に成功しました', { statePreview });
        await queryClient.invalidateQueries({ queryKey: ['discord', 'session'] });
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          console.info('Discord PWA セッション復旧が中断されました', { statePreview });
          return;
        }
        console.error('Discord PWA セッション復旧中にエラーが発生しました', error);
      } finally {
        claimInProgressRef.current = false;
      }
    };

    void claimSession();

    return () => {
      controller.abort();
    };
  }, [queryClient]);

  return {
    data: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
    login,
    logout,
    refetch
  };
}
