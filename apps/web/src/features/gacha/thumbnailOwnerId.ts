const ANON_OWNER_ID_STORAGE_KEY = 'gacha:thumbnail:anon-owner-id:v1';
const ANON_OWNER_ID_PREFIX = 'anon-';
const ANON_OWNER_ID_RANDOM_LENGTH = 24;

function generateRandomBase64Url(length: number): string {
  if (length <= 0) {
    return '';
  }
  const requiredBytes = Math.ceil((length * 3) / 4);
  const bytes = new Uint8Array(requiredBytes);
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(bytes);
  } else {
    for (let index = 0; index < requiredBytes; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }
  const binary = String.fromCharCode(...Array.from(bytes));
  const encoded = btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  return encoded.slice(0, length);
}

/**
 * 匿名オーナーIDとして許可される文字列かを判定する。
 *
 * @param value 判定対象の値
 * @returns 匿名オーナーIDとして利用可能な場合は true
 */
export function isValidAnonThumbnailOwnerId(value: string | null | undefined): value is string {
  if (typeof value !== 'string') {
    return false;
  }
  const trimmed = value.trim();
  return /^anon-[A-Za-z0-9_-]{8,64}$/.test(trimmed);
}

/**
 * 新しい匿名オーナーIDを生成する。
 *
 * @returns `anon-` から始まる固定長ID
 */
export function createAnonThumbnailOwnerId(): string {
  return `${ANON_OWNER_ID_PREFIX}${generateRandomBase64Url(ANON_OWNER_ID_RANDOM_LENGTH)}`;
}

/**
 * ブラウザの localStorage から匿名オーナーIDを取得し、未作成なら生成して保存する。
 *
 * @returns 匿名オーナーID。ブラウザ外では undefined
 */
export function getOrCreateAnonThumbnailOwnerId(): string | undefined {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    return undefined;
  }
  const stored = window.localStorage.getItem(ANON_OWNER_ID_STORAGE_KEY);
  if (isValidAnonThumbnailOwnerId(stored)) {
    return stored;
  }
  const created = createAnonThumbnailOwnerId();
  window.localStorage.setItem(ANON_OWNER_ID_STORAGE_KEY, created);
  return created;
}

/**
 * 現在の配信サムネイルownerIdを解決する。
 * Discordログイン時はdiscord user id、未ログイン時は匿名ownerIdを返す。
 *
 * @param discordUserId Discordログイン中ユーザーID
 * @returns ownerId。解決できない場合は undefined
 */
export function resolveThumbnailOwnerId(discordUserId: string | null | undefined): string | undefined {
  const normalizedDiscordId = typeof discordUserId === 'string' ? discordUserId.trim() : '';
  if (normalizedDiscordId.length > 0) {
    return normalizedDiscordId;
  }
  return getOrCreateAnonThumbnailOwnerId();
}
