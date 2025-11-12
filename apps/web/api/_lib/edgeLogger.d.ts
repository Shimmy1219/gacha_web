export type EdgeLogger = {
  requestId: string;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
  debug(message: string, meta?: Record<string, unknown>): void;
};

export function createEdgeRequestLogger(scope: string, request?: Request): EdgeLogger;
