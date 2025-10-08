// /api/auth/discord/start.js
// PKCE + state を発行して Discord 認可画面へ 302
import crypto from 'crypto';
import { setCookie } from '../../_lib/cookies.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ ok: false, error: 'Method Not Allowed' });
  }

  const state = crypto.randomBytes(16).toString('base64url');
  const verifier = crypto.randomBytes(32).toString('base64url');
  const challenge = crypto
    .createHash('sha256')
    .update(verifier)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');

  // 10分だけ有効
  setCookie(res, 'd_state', state, { maxAge: 600 });
  setCookie(res, 'd_verifier', verifier, { maxAge: 600 });

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: process.env.DISCORD_CLIENT_ID,
    redirect_uri: process.env.DISCORD_REDIRECT_URI,
    scope: 'identify guilds',
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    prompt: 'consent', // 再承認を促したい時は維持、不要なら削除可
  });

  res.setHeader('Cache-Control', 'no-store');
  return res.redirect(`https://discord.com/oauth2/authorize?${params.toString()}`);
}
