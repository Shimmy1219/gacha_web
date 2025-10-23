// /api/_lib/sessionCookie.js
import crypto from 'crypto';

const VERSION = 1;
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

export function createSessionCookieCodec(secret) {
  const trimmed = (secret || '').trim();
  if (!trimmed) {
    throw new Error('[Session Cookie] SESSION_SECRET が設定されていません。');
  }
  if (trimmed.length < 32) {
    throw new Error('[Session Cookie] SESSION_SECRET は32文字以上にしてください。');
  }

  const key = crypto.createHash('sha256').update(trimmed).digest();

  return {
    encode(payload) {
      const iv = crypto.randomBytes(IV_LENGTH);
      const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
      const json = JSON.stringify(payload ?? {});
      const encrypted = Buffer.concat([cipher.update(json, 'utf8'), cipher.final()]);
      const tag = cipher.getAuthTag();
      const out = Buffer.alloc(1 + IV_LENGTH + TAG_LENGTH + encrypted.length);
      out.writeUInt8(VERSION, 0);
      iv.copy(out, 1);
      tag.copy(out, 1 + IV_LENGTH);
      encrypted.copy(out, 1 + IV_LENGTH + TAG_LENGTH);
      return out.toString('base64url');
    },
    decode(cookieValue) {
      if (!cookieValue) return null;
      let buf;
      try {
        buf = Buffer.from(cookieValue, 'base64url');
      } catch {
        return null;
      }
      if (buf.length < 1 + IV_LENGTH + TAG_LENGTH) {
        return null;
      }
      const version = buf.readUInt8(0);
      if (version !== VERSION) {
        return null;
      }
      const iv = buf.subarray(1, 1 + IV_LENGTH);
      const tag = buf.subarray(1 + IV_LENGTH, 1 + IV_LENGTH + TAG_LENGTH);
      const data = buf.subarray(1 + IV_LENGTH + TAG_LENGTH);
      try {
        const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
        decipher.setAuthTag(tag);
        const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
        return JSON.parse(decrypted.toString('utf8'));
      } catch {
        return null;
      }
    },
  };
}

