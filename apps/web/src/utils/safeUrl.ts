export interface SafeUrlOptions {
  allowedProtocols?: readonly string[];
  allowRelative?: boolean;
}

const DEFAULT_ALLOWED_PROTOCOLS = ['http:', 'https:', 'blob:'] as const;

function isAllowedProtocol(protocol: string, allowedProtocols: readonly string[]): boolean {
  return allowedProtocols.includes(protocol);
}

export function resolveSafeUrl(value: string | null | undefined, options: SafeUrlOptions = {}): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  if (options.allowRelative) {
    if (trimmed.startsWith('/') && !trimmed.startsWith('//')) {
      return trimmed;
    }
    if (trimmed.startsWith('./') || trimmed.startsWith('../') || trimmed.startsWith('#') || trimmed.startsWith('?')) {
      return trimmed;
    }
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }

  const allowedProtocols = options.allowedProtocols ?? DEFAULT_ALLOWED_PROTOCOLS;
  if (!isAllowedProtocol(parsed.protocol, allowedProtocols)) {
    return null;
  }

  return parsed.toString();
}
