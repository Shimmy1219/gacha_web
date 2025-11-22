export class DiscordUserStateCryptoError extends Error {
  constructor(message: string, public readonly recovery?: string) {
    super(message);
    this.name = 'DiscordUserStateCryptoError';
  }
}

function getCrypto(): Crypto {
  const cryptoApi = globalThis.crypto;
  if (!cryptoApi || typeof cryptoApi.subtle === 'undefined') {
    throw new DiscordUserStateCryptoError(
      'このブラウザでは暗号化機能を利用できません。',
      '最新のブラウザに更新してから、再度ログインしてください。'
    );
  }
  return cryptoApi;
}

function toBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64');
  }
  let binary = '';
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }
  if (typeof btoa === 'function') {
    return btoa(binary);
  }
  throw new DiscordUserStateCryptoError('Base64エンコードに失敗しました。', 'ブラウザを最新化してから再度お試しください。');
}

function fromBase64(value: string): Uint8Array {
  if (!value) {
    throw new DiscordUserStateCryptoError('暗号鍵の形式が不正です。', '再ログインして鍵を再取得してください。');
  }
  try {
    if (typeof Buffer !== 'undefined') {
      return new Uint8Array(Buffer.from(value, 'base64'));
    }
    const binary = typeof atob === 'function' ? atob(value) : '';
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
  } catch (error) {
    throw new DiscordUserStateCryptoError(
      '暗号鍵の復元に失敗しました。',
      'ブラウザを再読み込みしても解決しない場合、再ログインしてください。'
    );
  }
}

let cachedKeyPromise: Promise<CryptoKey> | null = null;

function handleKeyResponse(payload: unknown): string {
  if (!payload || typeof payload !== 'object') {
    throw new DiscordUserStateCryptoError('暗号鍵の取得に失敗しました。', 'ログインし直してください。');
  }
  const record = payload as Record<string, unknown>;
  if (record.ok !== true || typeof record.key !== 'string') {
    const message = typeof record.error === 'string' ? record.error : '暗号鍵の取得に失敗しました。';
    throw new DiscordUserStateCryptoError(message, 'ブラウザを再読み込みするか再ログインしてください。');
  }
  return record.key;
}

async function requestKey(): Promise<CryptoKey> {
  const response = await fetch('/api/discord/user-state-key', {
    method: 'GET',
    headers: { Accept: 'application/json' },
    credentials: 'include',
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message = payload?.error || `暗号鍵の取得に失敗しました (${response.status})`;
    throw new DiscordUserStateCryptoError(message, '再ログインしてからお試しください。');
  }
  const key = handleKeyResponse(payload);
  const cryptoApi = getCrypto();
  const rawKey = fromBase64(key);
  try {
    return await cryptoApi.subtle.importKey('raw', rawKey, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
  } catch (error) {
    throw new DiscordUserStateCryptoError(
      '暗号鍵の初期化に失敗しました。',
      'ブラウザを再読み込みしてから、再度Discordにログインしてください。'
    );
  }
}

export function resetCachedDiscordUserStateKey(): void {
  cachedKeyPromise = null;
}

export async function getDiscordUserStateKey(): Promise<CryptoKey> {
  if (!cachedKeyPromise) {
    cachedKeyPromise = requestKey();
  }
  return cachedKeyPromise;
}

function encodeIv(iv: Uint8Array): string {
  return toBase64(iv);
}

function decodeIv(serialized: string): Uint8Array {
  return fromBase64(serialized);
}

function serializeCiphertext(ciphertext: ArrayBuffer): string {
  return toBase64(new Uint8Array(ciphertext));
}

function deserializeCiphertext(serialized: string): Uint8Array {
  return fromBase64(serialized);
}

export async function encryptDiscordUserState(payload: unknown): Promise<string> {
  const cryptoApi = getCrypto();
  const key = await getDiscordUserStateKey();
  const iv = cryptoApi.getRandomValues(new Uint8Array(12));
  const encoder = new TextEncoder();
  const encoded = encoder.encode(JSON.stringify(payload));

  try {
    const cipher = await cryptoApi.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);
    const ivPart = encodeIv(iv);
    const cipherPart = serializeCiphertext(cipher);
    return `${ivPart}:${cipherPart}`;
  } catch (error) {
    throw new DiscordUserStateCryptoError(
      'Discord情報の暗号化に失敗しました。',
      'ページを再読み込みしても改善しない場合、Discordに再ログインしてください。'
    );
  }
}

export async function decryptDiscordUserState(serialized: string): Promise<unknown> {
  const cryptoApi = getCrypto();
  const key = await getDiscordUserStateKey();
  const [ivPart, cipherPart] = serialized.split(':');
  if (!ivPart || !cipherPart) {
    throw new DiscordUserStateCryptoError('保存されたDiscord情報が破損しています。', '再ログインしてデータを再取得してください。');
  }

  try {
    const iv = decodeIv(ivPart);
    const ciphertext = deserializeCiphertext(cipherPart);
    const plainBuffer = await cryptoApi.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
    const decoder = new TextDecoder();
    return JSON.parse(decoder.decode(plainBuffer));
  } catch (error) {
    throw new DiscordUserStateCryptoError(
      'Discord情報の復号に失敗しました。',
      'ブラウザを再読み込みし、それでも失敗する場合は再ログインしてください。'
    );
  }
}
