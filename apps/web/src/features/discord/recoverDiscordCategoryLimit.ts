import { ConfirmDialog, type ModalComponentProps } from '../../modals';
import { pushDiscordApiWarningByErrorCode } from '../../modals/dialogs/_lib/discordApiErrorHandling';
import {
  loadDiscordGuildSelection,
  saveDiscordGuildSelection,
  type DiscordGuildCategorySelection,
  type DiscordGuildSelection
} from './discordGuildSelectionStorage';
import { resolveDiscordCategorySeriesSelection } from './discordCategorySeries';
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
  exhaustedCategoryIds?: Iterable<string>;
  confirmationRequired?: boolean;
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

function resolveCategorySeriesIndex(currentCategoryName: string): number {
  const trimmed = currentCategoryName.trim();
  if (!trimmed) {
    return 1;
  }
  const match = /^(.*)_([0-9]+)つ目$/u.exec(trimmed);
  if (!match) {
    return 1;
  }
  const parsed = Number.parseInt(match[2] ?? '', 10);
  if (Number.isNaN(parsed) || parsed < 1) {
    return 1;
  }
  return parsed;
}

function resolveNextCategoryName(baseName: string, existingCategoryNames: string[]): string {
  const usedNames = new Set<string>();
  for (const name of existingCategoryNames) {
    const normalized = normalizeOptionalString(name);
    if (normalized) {
      usedNames.add(normalized);
    }
  }

  let nextIndex = 2;
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

function resolveCategorySeriesCandidates(params: {
  categories: DiscordCategorySummary[];
  baseName: string;
  currentCategoryId: string;
  currentIndex: number;
  exhaustedCategoryIds: Set<string>;
}): DiscordCategorySummary[] {
  const { categories, baseName, currentCategoryId, currentIndex, exhaustedCategoryIds } = params;
  const pattern = new RegExp(`^${escapeRegExp(baseName)}_(\\d+)つ目$`, 'u');

  const seriesEntries: Array<{ category: DiscordCategorySummary; index: number }> = [];
  for (const category of categories) {
    const categoryName = normalizeOptionalString(category.name);
    if (!categoryName) {
      continue;
    }
    if (category.id === currentCategoryId) {
      continue;
    }
    if (exhaustedCategoryIds.has(category.id)) {
      continue;
    }

    if (categoryName === baseName) {
      seriesEntries.push({ category, index: 1 });
      continue;
    }

    const match = pattern.exec(categoryName);
    if (!match) {
      continue;
    }
    const parsedIndex = Number.parseInt(match[1] ?? '', 10);
    if (Number.isNaN(parsedIndex) || parsedIndex < 2) {
      continue;
    }
    seriesEntries.push({ category, index: parsedIndex });
  }

  seriesEntries.sort((a, b) => {
    const aForward = a.index > currentIndex ? 0 : 1;
    const bForward = b.index > currentIndex ? 0 : 1;
    if (aForward !== bForward) {
      return aForward - bForward;
    }
    if (a.index !== b.index) {
      return a.index - b.index;
    }
    return a.category.id.localeCompare(b.category.id);
  });

  return seriesEntries.map((entry) => entry.category);
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
  currentCategoryName,
  exhaustedCategoryIds,
  confirmationRequired = true
}: RecoverDiscordCategoryLimitParams): Promise<DiscordGuildCategorySelection | null> {
  if (confirmationRequired) {
    const confirmed = await requestCategoryLimitRecoveryConfirmation(push);
    if (!confirmed) {
      return null;
    }
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
  const baseName = resolveCategorySeriesBaseName(currentName);
  const currentIndex = resolveCategorySeriesIndex(currentName);
  const exhaustedSet = new Set<string>();
  if (exhaustedCategoryIds) {
    for (const categoryId of exhaustedCategoryIds) {
      const normalized = normalizeOptionalString(categoryId);
      if (normalized) {
        exhaustedSet.add(normalized);
      }
    }
  }
  exhaustedSet.add(currentCategoryId);

  const seriesCandidates = resolveCategorySeriesCandidates({
    categories,
    baseName,
    currentCategoryId,
    currentIndex,
    exhaustedCategoryIds: exhaustedSet
  });

  const selectedCategory = seriesCandidates[0]
    ? seriesCandidates[0]
    : await createGuildCategory(
        guildSelection.guildId,
        resolveNextCategoryName(baseName, categories.map((category) => category.name)),
        push
      );
  const categorySource = categories.some((category) => category.id === selectedCategory.id)
    ? categories
    : [...categories, selectedCategory];
  const resolvedSeries = resolveDiscordCategorySeriesSelection({
    categories: categorySource,
    selectedCategoryId: selectedCategory.id,
    selectedCategoryName: selectedCategory.name
  });

  const nextCategorySelection: DiscordGuildCategorySelection = {
    id: selectedCategory.id,
    name: selectedCategory.name,
    selectedAt: new Date().toISOString(),
    categoryIds: resolvedSeries.categoryIds
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
