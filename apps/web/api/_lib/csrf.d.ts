export const DEFAULT_CSRF_COOKIE_NAME: string;
export const DEFAULT_CSRF_HEADER_NAME: string;
export function issueCsrfToken(
  response: unknown,
  options?: {
    cookieName?: string;
    cookieOptions?: Record<string, unknown>;
    tokenBytes?: number;
  }
): string;
