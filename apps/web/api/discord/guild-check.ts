import { getCookies } from '../_lib/cookies.js';
import { getSessionWithRefresh } from '../_lib/getSessionWithRefresh.js';
import {
  dFetch,
  assertGuildOwner,
  isDiscordUnknownGuildError,
  PERM,
  resolveBotIdentity
} from '../_lib/discordApi.js';
import { createRequestLogger } from '../_lib/logger.js';

interface GuildCategorySummary {
  id: string;
  name: string;
  position: number;
}

interface GuildCheckMessages {
  fetchCategories: string | null;
  ensurePrivateChannel: string | null;
  sendMessage: string | null;
}

interface GuildCheckResult {
  ok: boolean;
  guildId: string;
  checkedAt: string;
  canFetchCategories: boolean;
  canEnsurePrivateChannel: boolean;
  canSendMessage: boolean;
  categoryId: string | null;
  messages: GuildCheckMessages;
  categories: GuildCategorySummary[];
}

const VIEW_ALLOW_MASK = String(
  PERM.VIEW_CHANNEL | PERM.SEND_MESSAGES | PERM.READ_MESSAGE_HISTORY
);

function normalizeCategoryResponse(channel: any): GuildCategorySummary {
  return {
    id: String(channel?.id ?? ''),
    name: String(channel?.name ?? ''),
    position: typeof channel?.position === 'number' ? channel.position : 0
  };
}

function sanitizeMessage(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function formatErrorMessage(prefix: string, error: unknown): string {
  const base = sanitizeMessage(error instanceof Error ? error.message : String(error));
  return base ? `${prefix}: ${base}` : prefix;
}

export default async function handler(req: any, res: any): Promise<void> {
  const log = createRequestLogger('api/discord/guild-check', req);
  const method = req.method ?? 'GET';

  if (method !== 'POST') {
    res.setHeader('Allow', 'POST');
    log.warn('method not allowed', { method });
    res.status(405).json({ ok: false, error: 'Method Not Allowed' });
    return;
  }

  const { sid } = getCookies(req);
  const session = await getSessionWithRefresh(sid);
  if (!session) {
    log.info('session missing or invalid');
    res.status(401).json({ ok: false, error: 'not logged in' });
    return;
  }

  const body = typeof req.body === 'object' && req.body !== null ? req.body : {};
  const guildIdRaw = body.guild_id ?? body.guildId;
  const categoryIdRaw = body.category_id ?? body.categoryId;

  const guildId = sanitizeMessage(guildIdRaw) ?? '';
  const categoryId = sanitizeMessage(categoryIdRaw);

  if (!guildId) {
    log.warn('missing guild id');
    res.status(400).json({ ok: false, error: 'guild_id required' });
    return;
  }

  try {
    await assertGuildOwner(session.access_token, guildId);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log.warn('guild ownership assertion failed', { message });
    res.status(403).json({ ok: false, error: message || 'forbidden' });
    return;
  }

  const checkedAt = new Date().toISOString();
  const messages: GuildCheckMessages = {
    fetchCategories: null,
    ensurePrivateChannel: null,
    sendMessage: null
  };

  const result: GuildCheckResult = {
    ok: true,
    guildId,
    checkedAt,
    canFetchCategories: false,
    canEnsurePrivateChannel: false,
    canSendMessage: false,
    categoryId: categoryId ?? null,
    messages,
    categories: []
  };

  const botToken = sanitizeMessage(process.env.DISCORD_BOT_TOKEN);
  if (!botToken) {
    messages.fetchCategories = 'Discord Botの設定が完了していません。運営へお問い合わせください。';
    messages.ensurePrivateChannel = 'Botの権限を確認できません。運営へお問い合わせください。';
    messages.sendMessage = 'Botの権限を確認できません。運営へお問い合わせください。';
    log.error('discord bot token missing');
    res.status(200).json(result);
    return;
  }

  let channels: any[] = [];
  try {
    const response = await dFetch(`/guilds/${guildId}/channels`, {
      token: botToken,
      isBot: true
    });
    channels = Array.isArray(response) ? response : [];
    result.canFetchCategories = true;
    messages.fetchCategories = 'カテゴリ一覧の取得に成功しました。';
    log.info('guild channels fetched for check', { guildId, count: channels.length });
  } catch (error) {
    if (isDiscordUnknownGuildError(error)) {
      messages.fetchCategories =
        '選択されたDiscordギルドを操作できません。Botを再招待し、必要な権限を付与してください。';
      messages.ensurePrivateChannel =
        'Botを再招待すると自動チャンネル作成テストを再実行できます。';
      messages.sendMessage =
        'Botがチャンネルにアクセスできないためメッセージ送信テストを実施できませんでした。';
      log.warn('guild is not accessible for bot operations', {
        message: error instanceof Error ? error.message : String(error)
      });
    } else {
      messages.fetchCategories = formatErrorMessage('カテゴリ一覧の取得に失敗しました', error);
      messages.ensurePrivateChannel =
        'カテゴリ情報を取得できなかったためチャンネル作成テストを実施できませんでした。';
      messages.sendMessage =
        'チャンネル作成テストが実施できなかったためメッセージ送信テストを実施できませんでした。';
      log.error('failed to fetch guild channels for check', {
        message: error instanceof Error ? error.message : String(error)
      });
    }
    res.status(200).json(result);
    return;
  }

  const categories = channels
    .filter((channel) => channel?.type === 4)
    .map(normalizeCategoryResponse)
    .sort((a, b) => {
      if (a.position !== b.position) {
        return a.position - b.position;
      }
      return a.id.localeCompare(b.id);
    });
  result.categories = categories;

  if (!categoryId) {
    result.canEnsurePrivateChannel = true;
    result.canSendMessage = true;
    messages.ensurePrivateChannel = 'カテゴリが未設定のためチャンネル作成テストはスキップしました。';
    messages.sendMessage =
      'カテゴリ選択後にメッセージ送信テストを実行するには、再度権限チェックを行ってください。';
    res.status(200).json(result);
    return;
  }

  const categoryExists = categories.some((category) => category.id === categoryId);
  if (!categoryExists) {
    messages.ensurePrivateChannel = '指定されたカテゴリが見つかりませんでした。最新の情報を再取得してください。';
    messages.sendMessage =
      'お渡しチャンネルを作成できなかったためメッセージ送信テストを実施できませんでした。';
    res.status(200).json(result);
    return;
  }

  const { primaryId: botUserId } = await resolveBotIdentity(log);
  if (!botUserId) {
    messages.ensurePrivateChannel =
      'BotユーザーIDを特定できませんでした。環境変数 DISCORD_BOT_USER_ID を設定してください。';
    messages.sendMessage =
      'BotユーザーIDが不明なためメッセージ送信テストを実施できませんでした。';
    res.status(200).json(result);
    return;
  }

  const overwrites = [
    { id: guildId, type: 0, allow: '0', deny: String(PERM.VIEW_CHANNEL) },
    { id: session.uid, type: 1, allow: VIEW_ALLOW_MASK, deny: '0' },
    { id: botUserId, type: 1, allow: VIEW_ALLOW_MASK, deny: '0' }
  ];

  const channelName = `shimmy3-check-${Date.now().toString(36)}`;
  let createdChannelId: string | null = null;

  try {
    const created = await dFetch(`/guilds/${guildId}/channels`, {
      token: botToken,
      isBot: true,
      method: 'POST',
      body: {
        name: channelName,
        type: 0,
        parent_id: categoryId,
        permission_overwrites: overwrites
      }
    });
    createdChannelId = sanitizeMessage(created?.id);
    if (!createdChannelId) {
      throw new Error('作成したチャンネルIDを取得できませんでした。');
    }
    result.canEnsurePrivateChannel = true;
    messages.ensurePrivateChannel = 'チャンネル作成テストに成功しました。';
    log.info('temporary channel created for capability check', {
      guildId,
      categoryId,
      channelId: createdChannelId
    });
  } catch (error) {
    messages.ensurePrivateChannel = formatErrorMessage('チャンネル作成テストに失敗しました', error);
    messages.sendMessage =
      'チャンネル作成テストが失敗したためメッセージ送信テストを実施できませんでした。';
    log.error('failed to create temporary channel for capability check', {
      message: error instanceof Error ? error.message : String(error)
    });
    res.status(200).json(result);
    return;
  }

  try {
    await dFetch(`/channels/${createdChannelId}/messages`, {
      token: botToken,
      isBot: true,
      method: 'POST',
      body: {
        content:
          'Shimmy3 Bot権限チェック用のテストメッセージです。このチャンネルは自動的に削除されます。',
        allowed_mentions: { parse: [] }
      }
    });
    result.canSendMessage = true;
    messages.sendMessage = 'メッセージ送信テストに成功しました。';
    log.info('temporary channel message sent for capability check', {
      channelId: createdChannelId
    });
  } catch (error) {
    messages.sendMessage = formatErrorMessage('メッセージ送信テストに失敗しました', error);
    log.error('failed to send message during capability check', {
      channelId: createdChannelId,
      message: error instanceof Error ? error.message : String(error)
    });
  } finally {
    try {
      await dFetch(`/channels/${createdChannelId}`, {
        token: botToken,
        isBot: true,
        method: 'DELETE'
      });
      log.info('temporary channel cleaned up after capability check', {
        channelId: createdChannelId
      });
    } catch (error) {
      log.warn('failed to cleanup temporary channel after capability check', {
        channelId: createdChannelId,
        message: error instanceof Error ? error.message : String(error)
      });
    }
  }

  res.status(200).json(result);
}
