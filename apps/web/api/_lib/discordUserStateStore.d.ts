export interface DiscordUserStatePayload {
  selection?: unknown;
  memberCache?: Record<string, unknown> | undefined;
}

export interface DiscordUserStateRecord extends DiscordUserStatePayload {
  updatedAt: number;
}

export interface DiscordUserStateValidationSuccess {
  ok: true;
  value: DiscordUserStatePayload;
}

export interface DiscordUserStateValidationFailure {
  ok: false;
  error: string;
}

export type DiscordUserStateValidationResult =
  | DiscordUserStateValidationSuccess
  | DiscordUserStateValidationFailure;

export function normalizeDiscordUserStateInput(
  payload: unknown
): DiscordUserStateValidationResult;

export function saveDiscordUserState(
  discordUserId: string,
  payload: DiscordUserStatePayload
): Promise<DiscordUserStateRecord>;

export function getDiscordUserState(
  discordUserId: string
): Promise<DiscordUserStateRecord | null>;

export function deleteDiscordUserState(discordUserId: string): Promise<void>;
