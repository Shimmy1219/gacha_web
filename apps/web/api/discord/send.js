// /api/discord/send.js
import { withApiGuards } from '../_lib/apiGuards.js';
import { getCookies } from '../_lib/cookies.js';
import { DEFAULT_CSRF_HEADER_NAME } from '../_lib/csrf.js';
import { getSessionWithRefresh } from '../_lib/getSessionWithRefresh.js';
import {
  dFetch,
  DISCORD_API_ERROR_CODE_UNKNOWN_CHANNEL,
  DISCORD_API_ERROR_CODE_MISSING_PERMISSIONS,
  DISCORD_MISSING_PERMISSIONS_GUIDE_MESSAGE_JA,
  isDiscordUnknownChannelError,
  isDiscordMissingPermissionsError
} from '../_lib/discordApi.js';
import { createRequestLogger } from '../_lib/logger.js';

export default withApiGuards({
  route: '/api/discord/send',
  health: { enabled: true },
  methods: ['POST'],
  origin: true,
  csrf: { cookieName: 'discord_csrf', source: 'header', headerName: DEFAULT_CSRF_HEADER_NAME },
  rateLimit: { name: 'discord:send', limit: 20, windowSec: 60 },
})(async function handler(req, res) {
  const log = createRequestLogger('api/discord/send', req);
  log.info('request received');

  const { sid } = getCookies(req);
  const sess = await getSessionWithRefresh(sid);
  if (!sess) {
    log.info('session missing or invalid');
    return res.status(401).json({ ok:false, error:'not logged in' });
  }

  const { channel_id, share_url, title, comment, mode='bot' } = req.body || {};
  if (!channel_id || !share_url){
    log.warn('missing channel_id or share_url', { hasChannelId: Boolean(channel_id), hasShareUrl: Boolean(share_url) });
    return res.status(400).json({ ok:false, error:'channel_id and share_url required' });
  }
  const content = [title || '景品リンクです', share_url, comment || ''].filter(Boolean).join('\n');

  function respondDiscordApiError(error, context) {
    const message = error instanceof Error ? error.message : String(error);
    if (isDiscordUnknownChannelError(error)) {
      log.warn('【既知のエラー】discord channel is not accessible for send operation', {
        context,
        message,
        channelId: channel_id
      });
      return res.status(404).json({
        ok: false,
        error:
          '選択されていたDiscordチャンネルが見つかりません。削除されている可能性があります。チャンネルを選択しなおして、もう一度お試しください。',
        errorCode: DISCORD_API_ERROR_CODE_UNKNOWN_CHANNEL
      });
    }
    if (isDiscordMissingPermissionsError(error)) {
      log.warn('【既知のエラー】discord bot is missing permissions', {
        context,
        message,
        channelId: channel_id
      });
      return res.status(403).json({
        ok: false,
        error: DISCORD_MISSING_PERMISSIONS_GUIDE_MESSAGE_JA,
        errorCode: DISCORD_API_ERROR_CODE_MISSING_PERMISSIONS
      });
    }
    log.error('【既知のエラー】discord api request failed', {
      context,
      message,
      channelId: channel_id
    });
    return res.status(502).json({ ok: false, error: 'discord api request failed' });
  }

  if (mode === 'bot'){
    try {
      const j = await dFetch(`/channels/${channel_id}/messages`, {
        token: process.env.DISCORD_BOT_TOKEN, isBot:true, method:'POST',
        body: { content, allowed_mentions: { parse: [] } }
      });
      log.info('message sent via bot', { channelId: channel_id, messageId: j.id || null });
      return res.json({ ok:true, message_id: j.id || null, via:'bot' });
    } catch (error) {
      return respondDiscordApiError(error, 'send-message-via-bot');
    }
  }

  try {
    // webhook mode
    const hooks = await dFetch(`/channels/${channel_id}/webhooks`, {
      token: process.env.DISCORD_BOT_TOKEN, isBot:true
    });
    let hook = (Array.isArray(hooks)?hooks:[]).find(h => h.name === 'Gacha Sender') || null;
    if (!hook){
      hook = await dFetch(`/channels/${channel_id}/webhooks`, {
        token: process.env.DISCORD_BOT_TOKEN, isBot:true, method:'POST',
        body: { name:'Gacha Sender' }
      });
    }
    const wurl = `https://discord.com/api/webhooks/${hook.id}/${hook.token}`;
    const r = await dFetch(wurl, {
      method:'POST',
      body: { content, allowed_mentions: { parse: [] } }
    });
    log.info('message sent via webhook', { channelId: channel_id, messageId: r.id || null });
    return res.json({ ok:true, message_id: r.id || null, via:'webhook' });
  } catch (error) {
    return respondDiscordApiError(error, 'send-message-via-webhook');
  }
});
