const DEFAULT_DISCORD_REDIRECT_URI = 'https://shimmy3.com/api/auth/discord/callback';

export const resolveDiscordRedirectUri = (): string => {
  const envRedirectUri = import.meta.env.VITE_DISCORD_REDIRECT_URI;
  if (typeof envRedirectUri === 'string' && envRedirectUri.trim().length > 0) {
    return envRedirectUri.trim();
  }
  return DEFAULT_DISCORD_REDIRECT_URI;
};

export const buildDiscordBotInviteUrl = (): string => {
  const url = new URL('https://discord.com/oauth2/authorize');
  url.searchParams.set('client_id', '1421371141666377839');
  url.searchParams.set('permissions', '805317648');
  url.searchParams.set('redirect_uri', resolveDiscordRedirectUri());
  url.searchParams.set('integration_type', '0');
  url.searchParams.set('scope', 'bot');
  return url.toString();
};

export const DISCORD_BOT_INVITE_URL = buildDiscordBotInviteUrl();
