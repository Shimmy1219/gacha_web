import { useCallback, useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import {
  logDiscordAuthError,
  logDiscordAuthEvent
} from './discordAuthDebugLogStore';

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
      logDiscordAuthEvent('Discordアプリが前面に表示されたためフォールバック待機を終了しました');
      clearFallback();
    }
  };

  document.addEventListener('visibilitychange', handleVisibilityChange);

  fallbackTimer = window.setTimeout(() => {
    clearFallback();
    logDiscordAuthEvent('ディープリンクに失敗したためWeb版の認可ページへフォールバックします', {
      authorizeUrl: webAuthorizeUrl
    });
    window.location.assign(webAuthorizeUrl);
  }, 2000);

  logDiscordAuthEvent('Discordアプリのディープリンクを試行します', {
    appAuthorizeUrl,
    fallbackAuthorizeUrl: webAuthorizeUrl
  });
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
  logDiscordAuthEvent('Discordセッション情報の確認を開始します', {
    endpoint: '/api/discord/me?soft=1'
  });
  const response = await fetch('/api/discord/me?soft=1', {
    headers: {
      Accept: 'application/json'
    },
    credentials: 'include'
  });

  if (!response.ok) {
    logDiscordAuthError('Discordセッション情報の取得に失敗しました', {
      status: response.status
    });
    throw new Error('Failed to fetch discord session');
  }

  const payload = (await response.json()) as DiscordSessionData;

  logDiscordAuthEvent('Discordセッション情報の取得に成功しました', {
    loggedIn: payload.loggedIn,
    userId: payload.user?.id ?? null
  });

  return payload;
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
  const { refetch: refetchQuery } = query;

  useEffect(() => {
    if (typeof document === 'undefined') {
      return;
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'visible') {
        return;
      }

      logDiscordAuthEvent('アプリが前面に復帰したためDiscordセッション情報の再取得を開始します');
      void refetchQuery();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [refetchQuery]);

  const login = useCallback(async () => {
    const baseLoginUrl = '/api/auth/discord/start';
    const loginContext = resolveLoginContext();
    const loginUrl = `${baseLoginUrl}?context=${encodeURIComponent(loginContext)}`;

    try {
      logDiscordAuthEvent('Discordログイン開始APIへリクエストを送信します', {
        loginUrl,
        loginContext
      });
      const response = await fetch(loginUrl, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        credentials: 'include',
      });

      if (!response.ok) {
        logDiscordAuthError('Discordログイン開始APIの呼び出しに失敗しました', {
          status: response.status
        });
        throw new Error(`Failed to initiate Discord authorization: ${response.status}`);
      }

      const contentType = response.headers.get('Content-Type') ?? '';
      if (!contentType.toLowerCase().includes('application/json')) {
        logDiscordAuthError('Discordログイン開始APIが想定外のレスポンスを返却しました', {
          contentType
        });
        throw new Error('Discord authorization endpoint returned an unexpected response');
      }

      const payload = (await response.json()) as DiscordAuthorizeResponse;
      if (!payload.ok || !payload.authorizeUrl) {
        logDiscordAuthError('Discordログイン開始APIから受け取ったペイロードが不正です', payload);
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

      logDiscordAuthEvent('Discordログイン開始APIから認可URLを受信しました', {
        authorizeUrl,
        appAuthorizeUrl: appAuthorizeUrl ?? null
      });

      if (appAuthorizeUrl && isProbablyMobileDevice()) {
        try {
          logDiscordAuthEvent('モバイル向けディープリンクでDiscord認証を開始します', {
            appAuthorizeUrl,
            authorizeUrl
          });
          openDiscordAppWithFallback(appAuthorizeUrl, authorizeUrl);
          return;
        } catch (deeplinkError) {
          logDiscordAuthError('Discordディープリンクの起動に失敗したためWeb認証へフォールバックします', deeplinkError);
          console.error('Discordディープリンクの起動に失敗しました。Web認証にフォールバックします', deeplinkError);
        }
      }

      logDiscordAuthEvent('ブラウザでDiscordの認可ページへ遷移します', {
        authorizeUrl
      });
      window.location.assign(authorizeUrl);
    } catch (assignError) {
      logDiscordAuthError('Discordログイン処理の開始に失敗しました。Webリダイレクトを試行します', assignError);
      console.error('Discordログインのディープリンク開始に失敗しました。Webリダイレクトにフォールバックします', assignError);

      try {
        logDiscordAuthEvent('WebリダイレクトでDiscord認証を再試行します', {
          loginUrl
        });
        window.location.assign(loginUrl);
        return;
      } catch (fallbackError) {
        logDiscordAuthError('DiscordログインのWebリダイレクトにも失敗しました', fallbackError);
        console.error('Discordログインのフォールバックリダイレクトにも失敗しました', fallbackError);
        throw fallbackError instanceof Error ? fallbackError : new Error('Failed to initiate Discord login redirect');
      }
    }
  }, []);

  const logout = useCallback(async () => {
    logDiscordAuthEvent('DiscordログアウトAPIを呼び出します', {
      endpoint: '/api/auth/logout'
    });
    const response = await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    if (!response.ok) {
      logDiscordAuthError('DiscordログアウトAPIの呼び出しに失敗しました', {
        status: response.status
      });
    } else {
      logDiscordAuthEvent('DiscordログアウトAPIの呼び出しが完了しました', {
        status: response.status
      });
    }
    await queryClient.invalidateQueries({ queryKey: ['discord', 'session'] });
  }, [queryClient]);

  const refetch = useCallback(async () => {
    const result = await refetchQuery();
    return result.data;
  }, [refetchQuery]);

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
          if ([401, 403, 404, 409, 410].includes(response.status)) {
            console.info('Discord PWA pending state will be cleared after unrecoverable response', {
              statePreview,
            });
            clearPendingPwaState();
          }
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
          console.info('Discord PWA pending state will be cleared because response payload is invalid', {
            statePreview,
          });
          clearPendingPwaState();
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
