// /api/_lib/edgeLogger.js
// Edge Runtime向けの簡易リクエストロガー。createRequestLoggerと同等のインターフェースを提供する。

let requestCounter = 0;

function nextRequestId() {
  requestCounter = (requestCounter + 1) % 1_000_000;
  return `${Date.now().toString(36)}-${requestCounter.toString(36)}`;
}

function normalizeError(error) {
  if (!(error instanceof Error)) {
    return error;
  }
  return {
    message: error.message,
    name: error.name,
    stack: error.stack,
  };
}

function formatMeta(request, meta = {}) {
  const base = {
    requestId: meta?.requestId,
    method: request?.method,
    url: request?.url,
  };

  if (!meta) {
    return base;
  }

  const { error, ...rest } = meta;
  const payload = { ...base, ...rest };
  if (error) {
    payload.error = normalizeError(error);
  }
  return payload;
}

export function createEdgeRequestLogger(scope, request) {
  const requestId = nextRequestId();

  function log(level, message, meta) {
    const payload = formatMeta(request, { ...meta, requestId });
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
