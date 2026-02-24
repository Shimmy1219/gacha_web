export const VISITOR_ID_COOKIE_NAME: 'visitor_id';
export const VISITOR_ID_COOKIE_MAX_AGE_SEC: number;

export function normalizeVisitorId(value: unknown): string;
export function createVisitorId(): string;
export function setVisitorIdOverride(source: unknown, visitorId: unknown): void;
export function ensureVisitorIdCookie(
  target: unknown,
  source: unknown,
  options?: { maxAgeSec?: number }
): string;

export function resolveActorContext(
  source: unknown,
  options?: { fallbackVisitorId?: string | null }
): {
  visitorId?: string;
  actorType: 'discord' | 'owner' | 'anonymous';
  actorLabel: string;
  actorTrust: 'cookie' | 'self-asserted' | 'none';
  discordId?: string;
  discordName?: string;
  ownerName?: string;
};
