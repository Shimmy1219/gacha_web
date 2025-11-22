function buildRedirectUri(): string {
  const explicitRedirect =
    process.env.NEXT_PUBLIC_DISCORD_REDIRECT_URI || process.env.DISCORD_REDIRECT_URI;
  if (explicitRedirect) return explicitRedirect;

  const origin = process.env.NEXT_PUBLIC_SITE_ORIGIN || process.env.SITE_ORIGIN;
  if (origin) return `${origin.replace(/\/$/, '')}/api/auth/discord/callback`;

  throw new Error('Discord redirect URI is not configured.');
}

export function getDiscordBotInviteUrl(): string {
  const clientId = process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID || process.env.DISCORD_CLIENT_ID;
  if (!clientId) {
    throw new Error('Discord client ID is not configured.');
  }

  const permissions =
    process.env.NEXT_PUBLIC_DISCORD_BOT_PERMISSIONS || process.env.DISCORD_BOT_PERMISSIONS;
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
