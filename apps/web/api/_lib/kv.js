// /api/_lib/kv.js
import { Redis } from '@upstash/redis';

const CONFIG_CANDIDATES = [
  {
    urlKeys: ['UPSTASH_REDIS_REST_KV_REST_API_URL', 'UPSTASH_KV_REST_API_URL'],
    tokenKeys: [
      'UPSTASH_REDIS_REST_KV_REST_API_TOKEN',
      'UPSTASH_REDIS_REST_KV_REST_API_READ_ONLY_TOKEN',
      'UPSTASH_KV_REST_API_TOKEN',
    ],
  },
  {
    urlKeys: ['UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_API_URL'],
    tokenKeys: ['UPSTASH_REDIS_REST_TOKEN', 'UPSTASH_REDIS_REST_API_TOKEN'],
  },
  {
    urlKeys: ['KV_REST_API_URL', 'VERCEL_KV_REST_API_URL'],
    tokenKeys: ['KV_REST_API_TOKEN', 'VERCEL_KV_REST_API_TOKEN'],
  },
];

let cachedConfig = null;
let cachedClient = null;

function pickFirstEnv(keys = []) {
  for (const key of keys) {
    const raw = process.env[key];
    if (typeof raw === 'string' && raw.trim()) {
      return raw.trim();
    }
  }
  return null;
}

function normalizeUrl(rawUrl) {
  if (!rawUrl) return null;
  const trimmed = rawUrl.trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

function resolveConfig() {
  if (cachedConfig) return cachedConfig;
  for (const candidate of CONFIG_CANDIDATES) {
    const url = normalizeUrl(pickFirstEnv(candidate.urlKeys));
    const token = pickFirstEnv(candidate.tokenKeys);
    if (url && token) {
      cachedConfig = { url, token };
      break;
    }
  }
  return cachedConfig;
}

export function hasKvConfig() {
  return Boolean(resolveConfig());
}

export function getKvClient() {
  if (cachedClient) return cachedClient;
  const config = resolveConfig();
  if (!config) return null;
  cachedClient = new Redis({ url: config.url, token: config.token });
  return cachedClient;
}

export function requireKvClient() {
  const client = getKvClient();
  if (!client) {
    throw new Error('[Upstash Redis] REST APIの接続情報が見つかりません。');
  }
  return client;
}

