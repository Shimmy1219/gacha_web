import { useCallback } from 'react';
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
