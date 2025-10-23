// /api/_lib/kv.js
import { Redis } from '@upstash/redis';

// 必須: REST API URL
const URL = process.env.KV_REST_API_URL;
// 優先: 書き込み可トークン、無ければ読み取り専用トークンでフォールバック
const TOKEN =
  process.env.KV_REST_API_TOKEN ||
  process.env.KV_REST_API_READ_ONLY_TOKEN ||
  process.env.KV_REST_API_READ_ONLY_TOKEN; // 同名の表記揺れ保険（不要なら削ってOK）

if (!URL) {
  throw new Error(
    "[Upstash Redis] 'KV_REST_API_URL' が未設定です。"
  );
}
if (!TOKEN) {
  throw new Error(
    "[Upstash Redis] 'KV_REST_API_TOKEN' もしくは 'KV_REST_API_READ_ONLY_TOKEN' が未設定です。"
  );
}

// ここは REST 経由で使います（TCP用の 'REDIS_URL' や '...KV_URL' は未使用）
export const kv = new Redis({ url: URL, token: TOKEN });
