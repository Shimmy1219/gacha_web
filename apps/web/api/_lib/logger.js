// /api/_lib/logger.js
// APIエンドポイント用の簡易ロガー。各リクエストに requestId を割り当てて一貫したログを出力する。
import { resolveActorContext } from './actorContext.js';

let requestCounter = 0;

function nextRequestId() {
  const counter = (requestCounter = (requestCounter + 1) % 1_000_000);
  return `${Date.now().toString(36)}-${counter.toString(36)}`;
}

function formatMeta(req, meta, actorContext) {
  const base = {
    requestId: meta?.requestId,
    method: req.method,
    url: req.url,
    ...actorContext,
  };

  if (!meta) {
    return base;
  }

  const { error, ...rest } = meta;

  if (error instanceof Error) {
    return {
      ...base,
      ...rest,
      error: {
        message: error.message,
        name: error.name,
        stack: error.stack,
      },
    };
  }

  return { ...base, ...meta };
}

export function createRequestLogger(scope, req) {
  const requestId = nextRequestId();
  const actorContext = resolveActorContext(req);

  function log(level, message, meta) {
    const payload = formatMeta(req, { ...meta, requestId }, actorContext);
    const text = `[${scope}] ${message}`;

    switch (level) {
      case 'error':
        console.error(text, payload);
        break;
      case 'warn':
        console.warn(text, payload);
        break;
      case 'debug':
        console.debug(text, payload);
        break;
      default:
        console.info(text, payload);
        break;
    }
  }

  return {
    requestId,
    info(message, meta) {
      log('info', message, meta);
    },
    warn(message, meta) {
      log('warn', message, meta);
    },
    error(message, meta) {
      log('error', message, meta);
    },
    debug(message, meta) {
      log('debug', message, meta);
    },
  };
}
