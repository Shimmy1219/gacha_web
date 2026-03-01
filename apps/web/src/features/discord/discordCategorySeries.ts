export interface DiscordCategoryLike {
  id: string;
  name?: string | null;
}

interface DiscordCategorySeriesEntry {
  category: DiscordCategoryLike;
  index: number;
}

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

function parseCategorySeriesName(value: string): { baseName: string; index: number | null } {
  const trimmed = value.trim();
  if (!trimmed) {
    return { baseName: CATEGORY_NAME_FALLBACK, index: 1 };
  }

  const match = /^(.*)_([0-9]+)つ目$/u.exec(trimmed);
  if (!match) {
    return { baseName: trimmed, index: 1 };
  }

  const baseName = normalizeOptionalString(match[1]) ?? trimmed;
  const parsed = Number.parseInt(match[2] ?? '', 10);
  if (Number.isNaN(parsed) || parsed < 2) {
    return { baseName, index: 1 };
  }

  return { baseName, index: parsed };
}

export function normalizeDiscordCategoryIds(values: Iterable<unknown>): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    if (typeof value !== 'string') {
      continue;
    }
    const normalized = value.trim();
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    ids.push(normalized);
  }
  return ids;
}

export function resolveDiscordCategorySeriesSelection(params: {
  categories: DiscordCategoryLike[];
  selectedCategoryId: string;
  selectedCategoryName?: string | null;
}): {
  categoryIds: string[];
  entries: Array<{ id: string; name: string; index: number }>;
  baseName: string;
} {
  const selectedCategoryId = normalizeOptionalString(params.selectedCategoryId);
  if (!selectedCategoryId) {
    return {
      categoryIds: [],
      entries: [],
      baseName: CATEGORY_NAME_FALLBACK
    };
  }

  const selectedCategory = params.categories.find((category) => category.id === selectedCategoryId);
  const selectedCategoryName =
    normalizeOptionalString(params.selectedCategoryName) ?? normalizeOptionalString(selectedCategory?.name) ?? '';
  if (!selectedCategoryName) {
    return {
      categoryIds: [selectedCategoryId],
      entries: [
        {
          id: selectedCategoryId,
          name: '(名称未設定)',
          index: 1
        }
      ],
      baseName: CATEGORY_NAME_FALLBACK
    };
  }
  const parsedSelected = parseCategorySeriesName(selectedCategoryName);
  const baseName = parsedSelected.baseName;
  const suffixPattern = new RegExp(`^${escapeRegExp(baseName)}_(\\d+)つ目$`, 'u');

  const entries: DiscordCategorySeriesEntry[] = [];
  for (const category of params.categories) {
    const categoryId = normalizeOptionalString(category.id);
    const categoryName = normalizeOptionalString(category.name);
    if (!categoryId || !categoryName) {
      continue;
    }

    if (categoryName === baseName) {
      entries.push({ category, index: 1 });
      continue;
    }

    const match = suffixPattern.exec(categoryName);
    if (!match) {
      continue;
    }

    const parsedIndex = Number.parseInt(match[1] ?? '', 10);
    if (Number.isNaN(parsedIndex) || parsedIndex < 2) {
      continue;
    }
    entries.push({ category, index: parsedIndex });
  }

  entries.sort((a, b) => {
    if (a.index !== b.index) {
      return a.index - b.index;
    }
    return a.category.id.localeCompare(b.category.id);
  });

  const fallbackSelectedIndex = parsedSelected.index ?? 1;
  const normalizedEntries = entries.map((entry) => ({
    id: entry.category.id,
    name: normalizeOptionalString(entry.category.name) ?? '(名称未設定)',
    index: entry.index
  }));

  const categoryIds = normalizeDiscordCategoryIds([
    selectedCategoryId,
    ...normalizedEntries.map((entry) => entry.id)
  ]);
  if (normalizedEntries.every((entry) => entry.id !== selectedCategoryId)) {
    normalizedEntries.unshift({
      id: selectedCategoryId,
      name: selectedCategoryName || '(名称未設定)',
      index: fallbackSelectedIndex
    });
  }

  return {
    categoryIds,
    entries: normalizedEntries,
    baseName
  };
}
