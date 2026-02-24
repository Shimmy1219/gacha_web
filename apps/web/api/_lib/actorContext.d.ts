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
  d_uid: string | null;
  d_uname: string | null;
  d_dname: string | null;
  discordId?: string;
  discordName?: string;
  discordUsername?: string | null;
  discordDisplayName?: string | null;
  ownerName?: string;
};
