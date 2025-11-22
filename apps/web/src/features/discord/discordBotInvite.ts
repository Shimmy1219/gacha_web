const env = (import.meta as any).env ?? {};

const getEnv = (name: string): string | undefined => {
  return env[name] ?? process.env?.[name];
};

function buildRedirectUri(): string {
  const explicitRedirect = getEnv('NEXT_PUBLIC_DISCORD_REDIRECT_URI') || getEnv('DISCORD_REDIRECT_URI');
  if (explicitRedirect) return explicitRedirect;

  const origin = getEnv('NEXT_PUBLIC_SITE_ORIGIN') || getEnv('SITE_ORIGIN');
  if (origin) return `${origin.replace(/\/$/, '')}/api/auth/discord/callback`;

  throw new Error('Discord redirect URI is not configured.');
}

export function getDiscordBotInviteUrl(): string {
  const clientId = getEnv('NEXT_PUBLIC_DISCORD_CLIENT_ID') || getEnv('DISCORD_CLIENT_ID');
  if (!clientId) {
    throw new Error('Discord client ID is not configured.');
  }

  const permissions = getEnv('NEXT_PUBLIC_DISCORD_BOT_PERMISSIONS') || getEnv('DISCORD_BOT_PERMISSIONS');
  if (!permissions) {
    throw new Error('Discord bot permissions are not configured.');
  }

  const params = new URLSearchParams({
    client_id: clientId,
    permissions,
    redirect_uri: buildRedirectUri(),
    integration_type: '0',
    scope: 'bot'
  });

  return `https://discord.com/oauth2/authorize?${params.toString()}`;
}
