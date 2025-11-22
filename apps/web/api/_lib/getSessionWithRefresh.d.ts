export type SessionRecord = Record<string, unknown> & {
  access_token?: string;
  refresh_token?: string;
  access_expires_at?: number;
};

export function getSessionWithRefresh(sid: string): Promise<SessionRecord | null>;
