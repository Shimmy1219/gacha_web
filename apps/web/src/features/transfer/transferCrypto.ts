const MAGIC = 'SHIMMYXFER';
const VERSION = 1;
const KDF_PBKDF2_SHA256 = 1;
const DEFAULT_ITERATIONS = 210_000;
const DEFAULT_SALT_LENGTH = 16;
const DEFAULT_IV_LENGTH = 12;

export class TransferCryptoError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message);
    if (options?.cause) {
      try {
        (this as Error & { cause?: unknown }).cause = options.cause;
      } catch {
        // noop
      }
    }
    this.name = 'TransferCryptoError';
  }
}

function ensureWebCrypto(): Crypto {
  const cryptoApi = globalThis.crypto;
  if (!cryptoApi || typeof cryptoApi.getRandomValues !== 'function' || !cryptoApi.subtle) {
    throw new TransferCryptoError('この環境では暗号化機能を利用できません（WebCryptoが利用不可）');
  }
  return cryptoApi;
}

export function validateTransferPin(pin: string): void {
  if (typeof pin !== 'string' || !/^[0-9]{4}$/.test(pin)) {
    throw new TransferCryptoError('暗証番号は4桁の数字で入力してください');
  }
}

export function normalizeTransferCode(code: string): string {
  if (typeof code !== 'string') {
    throw new TransferCryptoError('引継ぎコードが未入力です');
  }
  const trimmed = code.trim();
  if (!/^[0-9]{5}$/.test(trimmed)) {
    throw new TransferCryptoError('引継ぎコードは5桁の数字で入力してください');
  }
  return trimmed;
}

function encodeHeader(params: { iterations: number; salt: Uint8Array; iv: Uint8Array }): Uint8Array {
  const magicBytes = new TextEncoder().encode(MAGIC);
  const headerLength = magicBytes.length + 1 + 1 + 4 + 1 + 1 + params.salt.length + params.iv.length;
  const out = new Uint8Array(headerLength);
  out.set(magicBytes, 0);
  let offset = magicBytes.length;
  out[offset] = VERSION;
  offset += 1;
  out[offset] = KDF_PBKDF2_SHA256;
  offset += 1;

  const view = new DataView(out.buffer);
  view.setUint32(offset, params.iterations, true);
  offset += 4;

  out[offset] = params.salt.length;
  offset += 1;
  out[offset] = params.iv.length;
  offset += 1;

  out.set(params.salt, offset);
  offset += params.salt.length;
  out.set(params.iv, offset);

  return out;
}

function decodeHeader(bytes: Uint8Array): {
  headerLength: number;
  iterations: number;
  salt: Uint8Array;
  iv: Uint8Array;
} {
  const magicBytes = new TextEncoder().encode(MAGIC);
  if (bytes.length < magicBytes.length + 1 + 1 + 4 + 1 + 1) {
    throw new TransferCryptoError('引継ぎデータが壊れています（ヘッダ不足）');
  }

  for (let i = 0; i < magicBytes.length; i += 1) {
    if (bytes[i] !== magicBytes[i]) {
      throw new TransferCryptoError('引継ぎデータ形式が不正です（MAGIC不一致）');
    }
  }

  let offset = magicBytes.length;
  const version = bytes[offset];
  offset += 1;
  const kdf = bytes[offset];
  offset += 1;

  if (version !== VERSION) {
    throw new TransferCryptoError('引継ぎデータ形式のバージョンが未対応です');
  }
  if (kdf !== KDF_PBKDF2_SHA256) {
    throw new TransferCryptoError('引継ぎデータの暗号化方式が未対応です');
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const iterations = view.getUint32(offset, true);
  offset += 4;

  const saltLength = bytes[offset];
  offset += 1;
  const ivLength = bytes[offset];
  offset += 1;

  if (!saltLength || saltLength > 64 || !ivLength || ivLength > 32) {
    throw new TransferCryptoError('引継ぎデータが壊れています（salt/iv長が不正）');
  }

  const required = offset + saltLength + ivLength;
  if (bytes.length < required) {
    throw new TransferCryptoError('引継ぎデータが壊れています（salt/iv不足）');
  }

  const salt = bytes.slice(offset, offset + saltLength);
  offset += saltLength;
  const iv = bytes.slice(offset, offset + ivLength);
  offset += ivLength;

  return {
    headerLength: offset,
    iterations,
    salt,
    iv
  };
}

async function deriveAesKey(pin: string, params: { salt: Uint8Array; iterations: number }): Promise<CryptoKey> {
  const cryptoApi = ensureWebCrypto();
  validateTransferPin(pin);

  if (!Number.isInteger(params.iterations) || params.iterations < 10_000) {
    throw new TransferCryptoError('引継ぎデータが壊れています（iterationsが不正）');
  }

  const baseKey = await cryptoApi.subtle.importKey(
    'raw',
    new TextEncoder().encode(pin),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );

  return cryptoApi.subtle.deriveKey(
    { name: 'PBKDF2', salt: params.salt, iterations: params.iterations, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function encryptShimmyBlobForTransfer(plainShimmy: Blob, pin: string): Promise<Blob> {
  ensureWebCrypto();
  validateTransferPin(pin);

  if (!(plainShimmy instanceof Blob)) {
    throw new TransferCryptoError('暗号化対象のバックアップデータが不正です');
  }

  const cryptoApi = globalThis.crypto;
  const salt = new Uint8Array(DEFAULT_SALT_LENGTH);
  const iv = new Uint8Array(DEFAULT_IV_LENGTH);
  cryptoApi.getRandomValues(salt);
  cryptoApi.getRandomValues(iv);

  const iterations = DEFAULT_ITERATIONS;
  const key = await deriveAesKey(pin, { salt, iterations });

  let plaintext: ArrayBuffer;
  try {
    plaintext = await plainShimmy.arrayBuffer();
  } catch (error) {
    throw new TransferCryptoError('バックアップデータの読み込みに失敗しました', { cause: error });
  }

  let ciphertext: ArrayBuffer;
  try {
    ciphertext = await cryptoApi.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext);
  } catch (error) {
    throw new TransferCryptoError('暗号化に失敗しました', { cause: error });
  }

  const header = encodeHeader({ iterations, salt, iv });
  return new Blob([header, ciphertext], { type: 'application/octet-stream' });
}

export async function decryptTransferBlobToShimmy(encrypted: Blob, pin: string): Promise<Blob> {
  ensureWebCrypto();
  validateTransferPin(pin);

  if (!(encrypted instanceof Blob)) {
    throw new TransferCryptoError('引継ぎデータの取得に失敗しました');
  }

  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await encrypted.arrayBuffer());
  } catch (error) {
    throw new TransferCryptoError('引継ぎデータの読み込みに失敗しました', { cause: error });
  }

  const header = decodeHeader(bytes);
  const key = await deriveAesKey(pin, { salt: header.salt, iterations: header.iterations });
  const ciphertext = bytes.slice(header.headerLength);

  let plaintext: ArrayBuffer;
  try {
    plaintext = await globalThis.crypto.subtle.decrypt({ name: 'AES-GCM', iv: header.iv }, key, ciphertext);
  } catch (error) {
    throw new TransferCryptoError('暗証番号が違うか、引継ぎデータが壊れています', { cause: error });
  }

  return new Blob([plaintext], { type: 'application/x-shimmy' });
}

