export function getCookies(source: unknown): Record<string, string>;
export function setCookie(
  target: unknown,
  name: string,
  value: string,
  options?: Record<string, unknown>
): string;
