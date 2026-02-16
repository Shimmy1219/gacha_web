import { ConfirmDialog, type ModalComponentProps } from '../../modals';
import { pushDiscordApiWarningByErrorCode } from '../../modals/dialogs/_lib/discordApiErrorHandling';
import {
  loadDiscordGuildSelection,
  saveDiscordGuildSelection,
  type DiscordGuildCategorySelection,
  type DiscordGuildSelection
} from './discordGuildSelectionStorage';
import { fetchDiscordApi } from './fetchDiscordApi';

interface DiscordCategorySummary {
  id: string;
  name: string;
}

interface DiscordCategoriesResponse {
  ok?: boolean;
  categories?: DiscordCategorySummary[];
  error?: string;
  errorCode?: string;
}

interface DiscordCategoryCreateResponse {
  ok?: boolean;
  category?: DiscordCategorySummary;
  error?: string;
  errorCode?: string;
}

interface RecoverDiscordCategoryLimitParams {
  push: ModalComponentProps['push'];
  discordUserId: string;
  guildSelection: DiscordGuildSelection;
  currentCategoryId: string;
  currentCategoryName?: string | null;
}

const CATEGORY_LIMIT_CONFIRM_MESSAGE =
  'カテゴリ内のチャンネル数が50に到達しました。これ以上お渡しチャンネルを作成することは出来ません。新たなカテゴリを作成します。よろしいですか？';
const CATEGORY_LIMIT_CONFIRM_TITLE = 'カテゴリ上限に到達しました';
const CATEGORY_LIMIT_CONFIRM_ID = 'discord-category-limit-recovery-confirm';
const CATEGORY_NAME_FALLBACK = 'お渡しチャンネル';

function normalizeOptionalString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function resolveCategorySeriesBaseName(currentCategoryName: string): string {
  const trimmed = currentCategoryName.trim();
  if (!trimmed) {
    return CATEGORY_NAME_FALLBACK;
  }
  const match = /^(.*)_([0-9]+)つ目$/u.exec(trimmed);
  if (!match) {
    return trimmed;
  }
  const base = match[1]?.trim();
  return base && base.length > 0 ? base : trimmed;
}

function resolveNextCategoryName(currentCategoryName: string, existingCategoryNames: string[]): string {
  const baseName = resolveCategorySeriesBaseName(currentCategoryName);
  const usedNames = new Set<string>();
  for (const name of existingCategoryNames) {
    const normalized = normalizeOptionalString(name);
    if (normalized) {
      usedNames.add(normalized);
    }
  }

  let highestIndex = usedNames.has(baseName) ? 1 : 0;
  const pattern = new RegExp(`^${escapeRegExp(baseName)}_(\\d+)つ目$`, 'u');
  for (const name of usedNames) {
    const match = pattern.exec(name);
    if (!match) {
      continue;
    }
    const parsed = Number.parseInt(match[1] ?? '', 10);
    if (!Number.isNaN(parsed) && parsed > highestIndex) {
      highestIndex = parsed;
    }
  }

  let nextIndex = Math.max(2, highestIndex + 1);
  while (nextIndex < 10000) {
    const candidate = `${baseName}_${nextIndex}つ目`;
    if (!usedNames.has(candidate)) {
      return candidate;
    }
    nextIndex += 1;
  }

  throw new Error('新しいカテゴリ名の採番に失敗しました。');
}

function requestCategoryLimitRecoveryConfirmation(push: ModalComponentProps['push']): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    let settled = false;
    const finalize = (result: boolean) => {
      if (settled) {
        return;
      }
      settled = true;
      resolve(result);
    };

    push(ConfirmDialog, {
      id: CATEGORY_LIMIT_CONFIRM_ID,
      title: CATEGORY_LIMIT_CONFIRM_TITLE,
      size: 'sm',
      payload: {
        message: CATEGORY_LIMIT_CONFIRM_MESSAGE,
        confirmLabel: 'はい',
        cancelLabel: 'いいえ',
        onConfirm: () => finalize(true),
        onCancel: () => finalize(false)
      },
      onClose: () => finalize(false)
    });
  });
}

async function fetchGuildCategories(
  guildId: string,
  push: ModalComponentProps['push']
): Promise<DiscordCategorySummary[]> {
  const params = new URLSearchParams({ guild_id: guildId });
  const response = await fetchDiscordApi(`/api/discord/categories?${params.toString()}`, {
    method: 'GET'
  });

  const payload = (await response.json().catch(() => null)) as DiscordCategoriesResponse | null;
  if (!response.ok || !payload?.ok || !Array.isArray(payload.categories)) {
    const message = payload?.error || `カテゴリ一覧の取得に失敗しました (${response.status})`;
    if (pushDiscordApiWarningByErrorCode(push, payload?.errorCode, message)) {
      throw new Error('Discordギルドの設定を確認してください。');
    }
    throw new Error(message);
  }
  return payload.categories;
}

async function createGuildCategory(
  guildId: string,
  name: string,
  push: ModalComponentProps['push']
): Promise<DiscordCategorySummary> {
  const response = await fetchDiscordApi('/api/discord/categories', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json'
    },
    body: JSON.stringify({
      guild_id: guildId,
      name
    })
  });

  const payload = (await response.json().catch(() => null)) as DiscordCategoryCreateResponse | null;
  if (!response.ok || !payload?.ok || !payload.category) {
    const message = payload?.error || 'カテゴリの作成に失敗しました。';
    if (pushDiscordApiWarningByErrorCode(push, payload?.errorCode, message)) {
      throw new Error('Discordギルドの設定を確認してください。');
    }
    throw new Error(message);
  }
  return payload.category;
}

export async function recoverDiscordCategoryLimitByCreatingNextCategory({
  push,
  discordUserId,
  guildSelection,
  currentCategoryId,
  currentCategoryName
}: RecoverDiscordCategoryLimitParams): Promise<DiscordGuildCategorySelection | null> {
  const confirmed = await requestCategoryLimitRecoveryConfirmation(push);
  if (!confirmed) {
    return null;
  }

  if (!guildSelection.guildId) {
    throw new Error('Discordギルド情報を取得できませんでした。');
  }

  const categories = await fetchGuildCategories(guildSelection.guildId, push);
  const currentName =
    normalizeOptionalString(currentCategoryName) ||
    normalizeOptionalString(categories.find((category) => category.id === currentCategoryId)?.name) ||
    normalizeOptionalString(guildSelection.privateChannelCategory?.name) ||
    CATEGORY_NAME_FALLBACK;
  const nextCategoryName = resolveNextCategoryName(currentName, categories.map((category) => category.name));
  const createdCategory = await createGuildCategory(guildSelection.guildId, nextCategoryName, push);

  const nextCategorySelection: DiscordGuildCategorySelection = {
    id: createdCategory.id,
    name: createdCategory.name,
    selectedAt: new Date().toISOString()
  };

  const latestSelection = loadDiscordGuildSelection(discordUserId);
  const baseSelection =
    latestSelection && latestSelection.guildId === guildSelection.guildId
      ? latestSelection
      : guildSelection;
  saveDiscordGuildSelection(discordUserId, {
    ...baseSelection,
    privateChannelCategory: nextCategorySelection
  });

  return nextCategorySelection;
}
