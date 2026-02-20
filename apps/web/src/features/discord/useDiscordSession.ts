import { useCallback, useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import {
  logDiscordAuthError,
  logDiscordAuthEvent
} from './discordAuthDebugLogStore';
import {
  DISCORD_PWA_PENDING_STATE_STORAGE_KEY,
  getDiscordInfoStore
} from './discordInfoStore';
import {
  clearDiscordSessionHintCookieClientSide,
  hasDiscordSessionHintCookie
} from './discordSessionHint';
import {
  createCsrfRetryRequestHeaders,
  fetchWithCsrfRetry,
  getCsrfMismatchGuideMessageJa,
  inspectCsrfFailurePayload
} from '../csrf/csrfGuards';

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
  isFetching: boolean;
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

const PWA_PENDING_STATE_MAX_AGE_MS = 10 * 60 * 1000; // 10 minutes
type PwaClaimResult =
  | 'skipped'
  | 'no-pending'
  | 'claimed'
  | 'cleared'
  | 'failed'
  | 'aborted';

let activePwaClaimPromise: Promise<PwaClaimResult> | null = null;
let activePwaClaimState: string | null = null;

function createStatePreview(state: string): string {
  return state.length > 8 ? `${state.slice(0, 4)}...` : state;
}

function isDiscordInfoStoreReady(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  return getDiscordInfoStore().isReady();
}

function persistPendingPwaState(record: PendingPwaStateRecord): void {
  if (!isDiscordInfoStoreReady()) {
    return;
  }
  try {
    void getDiscordInfoStore().saveJson(DISCORD_PWA_PENDING_STATE_STORAGE_KEY, record);
  } catch (error) {
    console.warn('Failed to persist Discord PWA pending state', error);
  }
}

function clearPendingPwaState(): void {
  if (!isDiscordInfoStoreReady()) {
    return;
  }
  try {
    void getDiscordInfoStore().remove(DISCORD_PWA_PENDING_STATE_STORAGE_KEY);
  } catch (error) {
    console.warn('Failed to clear Discord PWA pending state', error);
  }
}

function readPendingPwaState(): PendingPwaStateRecord | null {
  if (!isDiscordInfoStoreReady()) {
    return null;
  }
  try {
    const parsed = getDiscordInfoStore().getJson<Partial<PendingPwaStateRecord>>(
      DISCORD_PWA_PENDING_STATE_STORAGE_KEY
    );
    if (!parsed || typeof parsed.state !== 'string' || parsed.state.length === 0) {
      void getDiscordInfoStore().remove(DISCORD_PWA_PENDING_STATE_STORAGE_KEY);
      return null;
    }
    const createdAt = typeof parsed.createdAt === 'number' ? parsed.createdAt : Date.now();
    if (Date.now() - createdAt > PWA_PENDING_STATE_MAX_AGE_MS) {
      void getDiscordInfoStore().remove(DISCORD_PWA_PENDING_STATE_STORAGE_KEY);
      return null;
    }
    return { state: parsed.state, createdAt };
  } catch (error) {
    console.warn('Failed to read Discord PWA pending state', error);
    try {
      void getDiscordInfoStore().remove(DISCORD_PWA_PENDING_STATE_STORAGE_KEY);
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
    credentials: 'include',
    // 304が返るとヒントcookie削除が反映できないため、HTTPキャッシュを使わず毎回取得する。
    cache: 'no-store'
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

/**
 * Discordログイン状態を取得・維持するためのカスタムフック。
 *
 * `sid` は HttpOnly クッキーでクライアントから直接参照できないため、
 * `discord_session_hint` を使って `/api/discord/me` の自動取得可否を制御する。
 *
 * @returns Discordセッション情報とログイン/ログアウト操作
 */
export function useDiscordSession(): UseDiscordSessionResult {
  const queryClient = useQueryClient();
  const [shouldDelaySessionFetch, setShouldDelaySessionFetch] = useState<boolean>(() => {
    if (typeof window === 'undefined') {
      return false;
    }
    return resolveLoginContext() === 'pwa' && readPendingPwaState() !== null;
  });
  const [hasSessionHint, setHasSessionHint] = useState<boolean>(() => hasDiscordSessionHintCookie());

  const syncSessionHintFromCookie = useCallback((): boolean => {
    const next = hasDiscordSessionHintCookie();
    setHasSessionHint(next);
    return next;
  }, []);

  const claimPendingPwaSession = useCallback(
    async (options?: { signal?: AbortSignal }): Promise<PwaClaimResult> => {
      if (typeof window === 'undefined') {
        return 'skipped';
      }

      const loginContext = resolveLoginContext();
      if (loginContext !== 'pwa') {
        setShouldDelaySessionFetch(false);
        return 'skipped';
      }

      const signal = options?.signal;

      for (;;) {
        if (signal?.aborted) {
          console.info('Discord PWA セッション復旧が呼び出し元の指示で中断されました');
          setShouldDelaySessionFetch(false);
          return 'aborted';
        }

        const pendingState = readPendingPwaState();
        if (!pendingState) {
          setShouldDelaySessionFetch(false);
          return 'no-pending';
        }

        setShouldDelaySessionFetch(true);

        const state = pendingState.state;
        const statePreview = createStatePreview(state);

        if (activePwaClaimPromise) {
          const activeStatePreview =
            activePwaClaimState != null ? createStatePreview(activePwaClaimState) : null;
          if (activePwaClaimState === state) {
            console.info('Discord PWA セッション復旧が既に進行中のため同一stateの再実行を待機します', {
              statePreview
            });
          } else {
            console.info('別のDiscord PWA セッション復旧処理が進行中のため完了を待機します', {
              statePreview,
              activeStatePreview
            });
          }
          try {
            const result = await activePwaClaimPromise;
            if (result === 'claimed' || result === 'cleared' || result === 'no-pending') {
              setShouldDelaySessionFetch(false);
            }
            return result;
          } catch (error) {
            console.warn('進行中のDiscord PWA セッション復旧処理でエラーが発生しました', error);
            setShouldDelaySessionFetch(false);
            return 'failed';
          }
        }

        activePwaClaimState = state;
        activePwaClaimPromise = (async (): Promise<PwaClaimResult> => {
          try {
            if (signal?.aborted) {
              console.info('Discord PWA セッション復旧が開始前に中断されました', {
                statePreview
              });
              return 'aborted';
            }

            console.info('Discord PWA セッション復旧を開始します', { statePreview });
            const response = await fetch('/api/auth/discord/claim-session', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json'
              },
              credentials: 'include',
              body: JSON.stringify({ state })
            });

            if (!response.ok) {
              const errorText = await response.text();
              console.warn('Discord PWA セッション復旧に失敗しました', {
                statePreview,
                status: response.status,
                body: errorText
              });
              if ([401, 403, 404, 409, 410].includes(response.status)) {
                console.info('Discord PWA pending state will be cleared after unrecoverable response', {
                  statePreview
                });
                clearPendingPwaState();
                return 'cleared';
              }
              return 'failed';
            }

            const contentType = response.headers.get('Content-Type') ?? '';
            if (!contentType.toLowerCase().includes('application/json')) {
              console.warn('Discord PWA セッション復旧レスポンスの形式が不正です', {
                statePreview
              });
              return 'failed';
            }

            const payload = (await response.json()) as { ok?: boolean; claimed?: boolean };
            if (!payload?.ok || !payload?.claimed) {
              console.warn('Discord PWA セッション復旧レスポンスが不正です', {
                statePreview,
                payload
              });
              console.info('Discord PWA pending state will be cleared because response payload is invalid', {
                statePreview
              });
              clearPendingPwaState();
              return 'cleared';
            }

            clearPendingPwaState();
            console.info('Discord PWA セッション復旧に成功しました', { statePreview });
            // claim-session 成功時はレスポンスの Set-Cookie で hint が更新されるため同期する
            syncSessionHintFromCookie();
            await queryClient.invalidateQueries({ queryKey: ['discord', 'session'] });
            return 'claimed';
          } catch (error) {
            console.error('Discord PWA セッション復旧中にエラーが発生しました', error);
            return 'failed';
          } finally {
            activePwaClaimState = null;
            activePwaClaimPromise = null;
          }
        })();

        const result = await activePwaClaimPromise;
        if (result === 'claimed' || result === 'cleared' || result === 'no-pending') {
          setShouldDelaySessionFetch(false);
        }
        if (result === 'failed') {
          return 'failed';
        }
        if (result === 'aborted') {
          setShouldDelaySessionFetch(false);
          return 'aborted';
        }
        if (result === 'claimed' || result === 'cleared') {
          return result;
        }

        const stillPending = readPendingPwaState();
        if (!stillPending) {
          setShouldDelaySessionFetch(false);
          return 'no-pending';
        }
        // pending state still exists (e.g. recoverable failure). Retry on next loop iteration.
      }
    },
    [queryClient, setShouldDelaySessionFetch, syncSessionHintFromCookie]
  );

  const query = useQuery({
    queryKey: ['discord', 'session'],
    queryFn: fetchSession,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    // 未ログイン利用者は hint が無い限り /api/discord/me を自動実行しない
    enabled: !shouldDelaySessionFetch && hasSessionHint,
    onSuccess: (payload) => {
      if (payload.loggedIn) {
        return;
      }
      // サーバーが hint を削除した直後に、同一タブでも即時反映して再取得ループを防ぐ
      clearDiscordSessionHintCookieClientSide();
      setHasSessionHint(false);
    }
  });
  const { refetch: refetchQuery } = query;

  // アプリ復帰時にPWA復旧と必要な場合のみセッション再取得を行う。
  // claimPendingPwaSession/refetchQuery/syncSessionHintFromCookie は effect 内で参照するため依存に含める。
  useEffect(() => {
    if (typeof document === 'undefined') {
      return;
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'visible') {
        return;
      }

      void (async () => {
        const result = await claimPendingPwaSession();
        if (result === 'claimed') {
          logDiscordAuthEvent('Discord PWA セッション復旧が完了したためセッション情報の反映を待機します');
          return;
        }
        if (result === 'failed') {
          logDiscordAuthError('Discord PWA セッション復旧に失敗したため再取得を延期します');
          return;
        }
        if (result === 'aborted') {
          logDiscordAuthEvent('Discord PWA セッション復旧がキャンセルされたためセッション再取得をスキップします');
          return;
        }
        const canFetchSession = syncSessionHintFromCookie();
        if (!canFetchSession) {
          logDiscordAuthEvent('Discordセッションヒントが存在しないため再取得をスキップします');
          return;
        }
        logDiscordAuthEvent('アプリが前面に復帰したためDiscordセッション情報の再取得を開始します');
        await refetchQuery();
      })();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [claimPendingPwaSession, refetchQuery, syncSessionHintFromCookie]);

  const login = useCallback(async () => {
    const baseLoginUrl = '/api/auth/discord/start';
    const loginContext = resolveLoginContext();
    const returnTo =
      typeof window !== 'undefined'
        ? `${window.location.pathname}${window.location.search}${window.location.hash}`
        : '/gacha';
    const loginUrl = `${baseLoginUrl}?context=${encodeURIComponent(loginContext)}&returnTo=${encodeURIComponent(returnTo)}`;

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
    const issueCsrf = async (): Promise<string> => {
      const csrfResponse = await fetch(`/api/blob/csrf?ts=${Date.now()}`, {
        method: 'GET',
        credentials: 'include',
        cache: 'no-store',
        headers: { Accept: 'application/json' }
      });
      const csrfPayload = (await csrfResponse.json().catch(() => null)) as { ok?: boolean; token?: string } | null;
      if (!csrfResponse.ok || !csrfPayload?.ok || typeof csrfPayload.token !== 'string' || csrfPayload.token.length === 0) {
        const reason = csrfResponse.status;
        throw new Error(`CSRF token issuance failed (status ${reason})`);
      }
      return csrfPayload.token;
    };

    let csrfToken: string | null = null;
    let response: Response;
    try {
      response = await fetchWithCsrfRetry({
        fetcher: fetch,
        getToken: async () => {
          if (csrfToken) {
            return csrfToken;
          }
          csrfToken = await issueCsrf();
          return csrfToken;
        },
        refreshToken: async () => {
          csrfToken = await issueCsrf();
          return csrfToken;
        },
        performRequest: async (csrf, currentFetcher, meta) =>
          currentFetcher('/api/auth/logout', {
            method: 'POST',
            credentials: 'include',
            headers: {
              'Content-Type': 'application/json',
              Accept: 'application/json',
              ...createCsrfRetryRequestHeaders(meta)
            },
            body: JSON.stringify({ csrf })
          }),
        maxRetry: 1
      });
    } catch (error) {
      logDiscordAuthError('CSRFトークンの発行またはログアウト通信に失敗しました', error);
      return;
    }

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as {
        error?: string;
        errorCode?: string;
        csrfReason?: string;
      } | null;
      const csrfFailure = inspectCsrfFailurePayload(payload);
      if (csrfFailure.isMismatch) {
        logDiscordAuthError('DiscordログアウトAPIがCSRF検証で失敗しました', {
          status: response.status,
          csrfReason: csrfFailure.reason,
          guide: getCsrfMismatchGuideMessageJa(csrfFailure.reason)
        });
      }
      logDiscordAuthError('DiscordログアウトAPIの呼び出しに失敗しました', {
        status: response.status,
        error: payload?.error
      });
    } else {
      logDiscordAuthEvent('DiscordログアウトAPIの呼び出しが完了しました', {
        status: response.status
      });
      // ログアウト成功時のみクッキー削除を反映し、不要な /api/discord/me 再取得を止める
      clearDiscordSessionHintCookieClientSide();
      setHasSessionHint(false);
    }
    await queryClient.invalidateQueries({ queryKey: ['discord', 'session'] });
  }, [queryClient]);

  const refetch = useCallback(async () => {
    const canFetchSession = syncSessionHintFromCookie();
    if (!canFetchSession) {
      return undefined;
    }
    const result = await refetchQuery();
    return result.data;
  }, [refetchQuery, syncSessionHintFromCookie]);

  // 初回マウント時にPWA保留stateの回収を開始する。
  // claimPendingPwaSession が差し替わった場合は最新ロジックで再実行するため依存に含める。
  useEffect(() => {
    const controller = new AbortController();

    void claimPendingPwaSession({ signal: controller.signal });

    return () => {
      controller.abort();
    };
  }, [claimPendingPwaSession]);

  return {
    data: query.data,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isError: query.isError,
    login,
    logout,
    refetch
  };
}
