// /api/discord/find-channel.js
import { getCookies } from '../_lib/cookies.js';
import { getSessionWithRefresh } from '../_lib/getSessionWithRefresh.js';
import { dFetch, assertGuildOwner, build1to1Overwrites } from '../_lib/discordApi.js';

const CATEGORY_NAME = '景品お渡し';

export default async function handler(req, res){
  if (req.method !== 'GET'){
    res.setHeader('Allow','GET');
    return res.status(405).json({ ok:false, error:'Method Not Allowed' });
  }
  const { sid } = getCookies(req);
  const sess = await getSessionWithRefresh(sid);
  if (!sess) return res.status(401).json({ ok:false, error:'not logged in' });

  const guildId = String(req.query.guild_id || '');
  const memberId = String(req.query.member_id || '');
  if (!guildId || !memberId) return res.status(400).json({ ok:false, error:'guild_id and member_id required' });

  // オーナー検証
  try { await assertGuildOwner(sess.access_token, guildId); }
  catch(e){ return res.status(403).json({ ok:false, error: e.message || 'forbidden' }); }

  // 全チャンネル取得
  const chans = await dFetch(`/guilds/${guildId}/channels`, {
    token: process.env.DISCORD_BOT_TOKEN, isBot:true
  });

  // カテゴリ取得 or 作成
  let category = (Array.isArray(chans)?chans:[]).find(c => c.type === 4 && c.name === CATEGORY_NAME);
  if (!category){
    category = await dFetch(`/guilds/${guildId}/channels`, {
      token: process.env.DISCORD_BOT_TOKEN, isBot:true, method:'POST',
      body: { name: CATEGORY_NAME, type: 4 }
    });
  }

  // 1:1条件を満たす既存チャンネルを探索
  const kids = (Array.isArray(chans)?chans:[]).filter(c => c.parent_id === category.id && c.type === 0);
  const match = kids.find(ch => {
    const ow = ch.permission_overwrites || [];
    const hasOwner = ow.find(x => x.id === sess.uid && x.type === 1);
    const hasMember = ow.find(x => x.id === memberId && x.type === 1);
    const hasEveryone = ow.find(x => x.id === guildId && x.type === 0);
    return !!(hasOwner && hasMember && hasEveryone);
  });

  if (match){
    return res.json({ ok:true, channel_id: match.id, created:false });
  }

  // 無ければ作成
  const overwrites = build1to1Overwrites({ guildId, ownerId: sess.uid, memberId });
  const created = await dFetch(`/guilds/${guildId}/channels`, {
    token: process.env.DISCORD_BOT_TOKEN, isBot:true, method:'POST',
    body: {
      name: `gift-${memberId}`,
      type: 0,               // text
      parent_id: category.id,
      permission_overwrites: overwrites
    }
  });

  return res.json({ ok:true, channel_id: created.id, created:true });
}
