import {
  decryptDiscordUserState,
  DiscordUserStateCryptoError,
  encryptDiscordUserState,
  resetCachedDiscordUserStateKey
} from './discordUserStateCrypto';

export class DiscordUserStateSyncError extends Error {
  constructor(message: string, public readonly recovery?: string) {
    super(message);
    this.name = 'DiscordUserStateSyncError';
  }
}

export interface DiscordUserStateSnapshot {
  selection?: unknown;
  memberCache?: Record<string, unknown> | undefined;
}

export const DISCORD_USER_STATE_STORAGE_PREFIX = 'discord.userState';
const LEGACY_DISCORD_USER_STATE_KEY = DISCORD_USER_STATE_STORAGE_PREFIX;

function getStorageKey(discordUserId: string): string {
  return `${DISCORD_USER_STATE_STORAGE_PREFIX}::${discordUserId}`;
}

function getSessionStorage(): Storage {
  if (typeof window === 'undefined' || !window.sessionStorage) {
    throw new DiscordUserStateCryptoError(
      'ブラウザのセッションストレージにアクセスできません。',
      'プライベートブラウジングを解除するか、別のブラウザでお試しください。'
    );
  }
  return window.sessionStorage;
}

let cleanupRegistered = false;

function ensureSessionCleanupHandler(): void {
  if (cleanupRegistered || typeof window === 'undefined' || typeof window.addEventListener !== 'function') {
    return;
  }
  cleanupRegistered = true;
  window.addEventListener('pagehide', () => {
    try {
      const storage = window.sessionStorage;
      if (!storage) return;
      for (let index = storage.length - 1; index >= 0; index -= 1) {
        const key = storage.key(index);
        if (key && key.startsWith(`${DISCORD_USER_STATE_STORAGE_PREFIX}::`)) {
          storage.removeItem(key);
        }
      }
    } catch (error) {
      console.warn('Failed to cleanup Discord session storage on unload', error);
    }
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function hasOwnProperty(object: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function normalizeDiscordUserState(
  candidate: DiscordUserStateSnapshot | null | undefined
): DiscordUserStateSnapshot | null {
  if (!candidate) {
    return null;
  }

  const normalized: DiscordUserStateSnapshot = {};

  if (hasOwnProperty(candidate, 'selection')) {
    normalized.selection = candidate.selection ?? null;
  }

  if (hasOwnProperty(candidate, 'memberCache')) {
    const cache = candidate.memberCache;
    if (cache && typeof cache === 'object') {
      const normalizedCache: Record<string, unknown> = {};
      for (const [guildId, entry] of Object.entries(cache)) {
        if (entry !== undefined && entry !== null) {
          normalizedCache[guildId] = entry;
        }
      }
      if (Object.keys(normalizedCache).length > 0) {
        normalized.memberCache = normalizedCache;
      }
    }
  }

  if (!hasOwnProperty(normalized, 'selection') && !hasOwnProperty(normalized, 'memberCache')) {
    return null;
  }

  return normalized;
}

function normalizeServerSnapshot(candidate: unknown): DiscordUserStateSnapshot | null {
  if (!isRecord(candidate)) {
    return null;
  }

  return normalizeDiscordUserState({
    selection: hasOwnProperty(candidate, 'selection') ? candidate.selection : undefined,
    memberCache: hasOwnProperty(candidate, 'memberCache') && isRecord(candidate.memberCache)
      ? candidate.memberCache
      : undefined,
  });
}

async function decryptSnapshot(serialized: string): Promise<DiscordUserStateSnapshot | null> {
  const decrypted = await decryptDiscordUserState(serialized);
  if (!isRecord(decrypted)) {
    throw new DiscordUserStateCryptoError('Discord情報の形式が不正です。', '再ログインして状態を再取得してください。');
  }

  const snapshot: DiscordUserStateSnapshot = {};
  if (hasOwnProperty(decrypted, 'selection')) {
    snapshot.selection = decrypted.selection ?? null;
  }
  if (hasOwnProperty(decrypted, 'memberCache') && isRecord(decrypted.memberCache)) {
    snapshot.memberCache = { ...decrypted.memberCache };
  }
  return snapshot;
}

async function persistSnapshotToSession(
  discordUserId: string,
  snapshot: DiscordUserStateSnapshot | null
): Promise<DiscordUserStateSnapshot | null> {
  const storage = getSessionStorage();
  ensureSessionCleanupHandler();
  const storageKey = getStorageKey(discordUserId);

  if (!snapshot) {
    storage.removeItem(storageKey);
    return null;
  }

  const serialized = await encryptDiscordUserState(snapshot);
  storage.setItem(storageKey, serialized);
  return snapshot;
}

async function fetchServerDiscordUserState(): Promise<DiscordUserStateSnapshot | null> {
  const response = await fetch('/api/discord/user-state', {
    method: 'GET',
    headers: { Accept: 'application/json' },
    credentials: 'include',
  });

  const payload = await response.json().catch(() => null);

  const ok = payload && typeof payload === 'object' && (payload as any).ok === true;
  if (!response.ok || !ok) {
    const message = (payload && typeof (payload as any).error === 'string')
      ? (payload as any).error
      : `Discord情報の取得に失敗しました (${response.status})`;
    throw new DiscordUserStateSyncError(message, 'ページを再読み込みしてから再度お試しください。');
  }

  const record = (payload as Record<string, unknown>).state;
  return normalizeServerSnapshot(record);
}

async function persistDiscordUserStateToServer(
  snapshot: DiscordUserStateSnapshot | null
): Promise<DiscordUserStateSnapshot | null> {
  const targetMethod = snapshot ? 'PUT' : 'DELETE';
  const response = await fetch('/api/discord/user-state', {
    method: targetMethod,
    headers: {
      Accept: 'application/json',
      ...(snapshot ? { 'Content-Type': 'application/json' } : {}),
    },
    credentials: 'include',
    body: snapshot ? JSON.stringify(snapshot) : undefined,
  });

  const payload = await response.json().catch(() => null);
  const ok = payload && typeof payload === 'object' && (payload as any).ok === true;

  if (!response.ok || !ok) {
    const message = payload && typeof (payload as any).error === 'string'
      ? (payload as any).error
      : `Discord情報の保存に失敗しました (${response.status})`;
    throw new DiscordUserStateSyncError(message, '時間をおいて再度お試しください。');
  }

  return normalizeServerSnapshot((payload as any).state) ?? snapshot;
}

function getLegacyLocalStorage(): Storage | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    if (typeof window.localStorage === 'undefined') {
      return null;
    }
    return window.localStorage;
  } catch (error) {
    console.warn('Failed to access legacy Discord user state in localStorage', error);
    return null;
  }
}

async function migrateLegacyDiscordUserState(discordUserId: string): Promise<void> {
  const legacyStorage = getLegacyLocalStorage();
  if (!legacyStorage) {
    return;
  }

  let raw: string | null = null;
  try {
    raw = legacyStorage.getItem(LEGACY_DISCORD_USER_STATE_KEY);
  } catch (error) {
    console.warn('Failed to read legacy Discord user state from localStorage', error);
  }

  if (!raw) {
    return;
  }

  let parsed: unknown = null;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    console.warn('Failed to parse legacy Discord user state from localStorage', error);
  }

  try {
    const normalized = isRecord(parsed) ? normalizeDiscordUserState(parsed) : null;
    if (normalized) {
      await persistDiscordUserStateToServer(normalized);
      console.info('Migrated legacy Discord user state from localStorage to server storage.');
    } else {
      console.info('Legacy Discord user state was empty or invalid; removed localStorage copy.');
    }
  } catch (error) {
    console.warn('Failed to migrate legacy Discord user state to server', error);
    throw new DiscordUserStateSyncError(
      '旧Discordデータの移行に失敗しました。',
      '再読み込み後にもう一度ログインしてください。'
    );
  } finally {
    try {
      legacyStorage.removeItem(LEGACY_DISCORD_USER_STATE_KEY);
    } catch (error) {
      console.warn('Failed to remove legacy Discord user state from localStorage', error);
    }
  }
}

export async function loadDiscordUserState(
  discordUserId: string | undefined | null
): Promise<DiscordUserStateSnapshot | null> {
  if (!discordUserId) {
    return null;
  }

  try {
    const storage = getSessionStorage();
    ensureSessionCleanupHandler();
    const raw = storage.getItem(getStorageKey(discordUserId));
    if (!raw) {
      return null;
    }

    return await decryptSnapshot(raw);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.warn('Failed to read Discord user state from sessionStorage', reason);
    resetCachedDiscordUserStateKey();
    if (error instanceof DiscordUserStateCryptoError) {
      throw error;
    }
    throw new DiscordUserStateCryptoError(
      'Discord情報の読み込みに失敗しました。',
      'ブラウザを再読み込みしてから、再度ログインしてください。'
    );
  }
}

const DEFAULT_INITIALIZATION_RETRY_DELAY_MS = 3000;
const DEFAULT_INITIALIZATION_MAX_RETRIES = 1;

export async function initializeDiscordUserState(
  discordUserId: string | undefined | null,
  options?: { maxRetries?: number; retryDelayMs?: number; signal?: AbortSignal }
): Promise<DiscordUserStateSnapshot | null> {
  if (!discordUserId || typeof window === 'undefined') {
    return null;
  }

  const maxRetries = options?.maxRetries ?? DEFAULT_INITIALIZATION_MAX_RETRIES;
  const retryDelayMs = options?.retryDelayMs ?? DEFAULT_INITIALIZATION_RETRY_DELAY_MS;
  const signal = options?.signal;

  let attempt = 0;
  let lastError: unknown;
  let migratedLegacyState = false;

  while (!signal?.aborted) {
    try {
      if (!migratedLegacyState) {
        await migrateLegacyDiscordUserState(discordUserId);
        migratedLegacyState = true;
      }
      const snapshot = await fetchServerDiscordUserState();
      return await persistSnapshotToSession(discordUserId, snapshot);
    } catch (error) {
      lastError = error;
      if (error instanceof DiscordUserStateCryptoError) {
        resetCachedDiscordUserStateKey();
      }

      if (attempt >= maxRetries) {
        throw error;
      }

      attempt += 1;
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
    }
  }

  if (signal?.aborted) {
    throw lastError instanceof Error ? lastError : new Error('Discord情報の初期化が中断されました');
  }

  return null;
}

export async function updateDiscordUserState(
  discordUserId: string | undefined | null,
  mutator: (state: DiscordUserStateSnapshot) => DiscordUserStateSnapshot | void | null
): Promise<DiscordUserStateSnapshot | null> {
  if (!discordUserId) {
    return null;
  }

  const currentState = await loadDiscordUserState(discordUserId);
  const draft: DiscordUserStateSnapshot = {
    ...(currentState ?? {}),
    memberCache: currentState?.memberCache ? { ...currentState.memberCache } : currentState?.memberCache
  };

  const result = mutator(draft) ?? draft;
  const normalized = normalizeDiscordUserState(result);

  try {
    const serverState = await persistDiscordUserStateToServer(normalized);
    return await persistSnapshotToSession(discordUserId, serverState);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.warn('Failed to persist Discord user state to sessionStorage', reason);
    if (error instanceof DiscordUserStateCryptoError) {
      throw error;
    }
    throw error;
  }
}

export async function clearDiscordUserState(discordUserId: string | undefined | null): Promise<void> {
  if (!discordUserId) {
    return;
  }

  try {
    await persistDiscordUserStateToServer(null);
  } catch (error) {
    console.warn('Failed to clear Discord user state from server', error);
  }

  try {
    const storage = getSessionStorage();
    storage.removeItem(getStorageKey(discordUserId));
  } catch (error) {
    console.warn('Failed to clear Discord user state from sessionStorage', error);
  }
}
