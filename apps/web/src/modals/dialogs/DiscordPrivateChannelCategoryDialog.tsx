import { useEffect, useMemo, useState } from 'react';
import {
  ArrowPathIcon,
  CheckCircleIcon,
  PlusIcon
} from '@heroicons/react/24/outline';
import { useQuery } from '@tanstack/react-query';

import {
  loadDiscordGuildSelection,
  saveDiscordGuildSelection,
  type DiscordGuildCategorySelection
} from '../../features/discord/discordGuildSelectionStorage';
import { ModalBody, ModalFooter, type ModalComponentProps } from '..';

interface DiscordCategorySummary {
  id: string;
  name: string;
  position: number;
}

interface DiscordCategoriesResponse {
  ok: boolean;
  categories?: DiscordCategorySummary[];
  error?: string;
}

interface DiscordCategoryCreateResponse {
  ok: boolean;
  category?: DiscordCategorySummary;
  error?: string;
}

interface DiscordPrivateChannelCategoryDialogPayload {
  guildId: string;
  discordUserId: string;
  initialCategory?: DiscordGuildCategorySelection | null;
  onCategorySelected?: (category: DiscordGuildCategorySelection) => void;
}

function useDiscordGuildCategories(guildId: string | null | undefined) {
  return useQuery({
    queryKey: ['discord', 'categories', guildId],
    queryFn: async () => {
      if (!guildId) {
        return [] as DiscordCategorySummary[];
      }
      const params = new URLSearchParams({ guild_id: guildId });
      const response = await fetch(`/api/discord/categories?${params.toString()}`, {
        headers: {
          Accept: 'application/json'
        },
        credentials: 'include'
      });
      const payload = (await response.json().catch(() => null)) as DiscordCategoriesResponse | null;
      if (!response.ok) {
        const message = payload?.error?.trim();
        throw new Error(
          message && message.length > 0
            ? `カテゴリ情報の取得に失敗しました: ${message}`
            : `カテゴリ情報の取得に失敗しました (${response.status})`
        );
      }
      if (!payload?.ok || !Array.isArray(payload.categories)) {
        throw new Error(payload?.error || 'カテゴリ情報の取得に失敗しました');
      }
      return payload.categories;
    },
    enabled: Boolean(guildId),
    staleTime: 60 * 1000,
    gcTime: 5 * 60 * 1000,
    keepPreviousData: true
  });
}

export function DiscordPrivateChannelCategoryDialog({
  payload,
  close
}: ModalComponentProps<DiscordPrivateChannelCategoryDialogPayload>): JSX.Element {
  const guildId = payload?.guildId ?? null;
  const discordUserId = payload?.discordUserId ?? '';
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(
    payload?.initialCategory?.id ?? null
  );
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  const categoriesQuery = useDiscordGuildCategories(guildId);
  const categories = useMemo(() => categoriesQuery.data ?? [], [categoriesQuery.data]);

  useEffect(() => {
    if (!payload?.initialCategory?.id) {
      return;
    }
    setSelectedCategoryId(payload.initialCategory.id);
  }, [payload?.initialCategory?.id]);

  const handleCreateCategory = async () => {
    if (!guildId) {
      setCreateError('Discordギルド情報を取得できませんでした。');
      return;
    }
    const trimmed = newCategoryName.trim();
    if (!trimmed) {
      setCreateError('カテゴリ名を入力してください。');
      return;
    }
    setCreateError(null);
    setIsCreating(true);
    try {
      const response = await fetch('/api/discord/categories', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({ guild_id: guildId, name: trimmed })
      });
      const payload = (await response.json().catch(() => null)) as DiscordCategoryCreateResponse | null;
      if (!response.ok || !payload?.ok || !payload.category) {
        const message = payload?.error || 'カテゴリの作成に失敗しました。';
        throw new Error(message);
      }
      setNewCategoryName('');
      setSelectedCategoryId(payload.category.id);
      await categoriesQuery.refetch();
      setCreateError(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'カテゴリの作成に失敗しました。';
      setCreateError(message);
    } finally {
      setIsCreating(false);
    }
  };

  const handleSubmit = () => {
    setSubmitError(null);
    if (!guildId) {
      setSubmitError('Discordギルド情報を取得できませんでした。');
      return;
    }
    if (!discordUserId) {
      setSubmitError('Discordアカウント情報を取得できませんでした。');
      return;
    }
    if (!selectedCategoryId) {
      setSubmitError('カテゴリを選択してください。');
      return;
    }
    const category = categories.find((item) => item.id === selectedCategoryId);
    if (!category) {
      setSubmitError('選択されたカテゴリが見つかりませんでした。最新の情報を再取得してください。');
      return;
    }
    const selection = loadDiscordGuildSelection(discordUserId);
    if (!selection || selection.guildId !== guildId) {
      setSubmitError('Discordギルドの選択情報を再取得してください。');
      return;
    }
    setIsSubmitting(true);
    try {
      const categorySelection: DiscordGuildCategorySelection = {
        id: category.id,
        name: category.name,
        selectedAt: new Date().toISOString()
      };
      saveDiscordGuildSelection(discordUserId, {
        ...selection,
        privateChannelCategory: categorySelection
      });
      payload?.onCategorySelected?.(categorySelection);
      close();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <ModalBody className="space-y-6">
        <section className="space-y-2 rounded-2xl border border-border/70 bg-surface/20 p-4 text-sm leading-relaxed text-muted-foreground">
          <h2 className="text-base font-semibold text-surface-foreground">お渡しチャンネルのカテゴリを選択</h2>
          <p>
            選択したカテゴリの配下に1:1のお渡しチャンネルを自動作成します。カテゴリはこの端末に保存され、次回以降の共有に利用されます。
          </p>
        </section>

        <section className="space-y-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <h3 className="text-sm font-semibold text-surface-foreground">カテゴリ一覧</h3>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              {categoriesQuery.isFetching ? (
                <span className="inline-flex items-center gap-1" aria-live="polite">
                  <ArrowPathIcon className="h-4 w-4 animate-spin" aria-hidden="true" />
                  更新中…
                </span>
              ) : null}
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-panel px-3 py-1.5 font-medium text-surface-foreground transition hover:bg-surface/60"
                onClick={() => {
                  void categoriesQuery.refetch();
                }}
                disabled={categoriesQuery.isFetching}
                aria-busy={categoriesQuery.isFetching}
              >
                <ArrowPathIcon className="h-4 w-4" aria-hidden="true" />
                再取得
              </button>
            </div>
          </div>

          {categoriesQuery.isLoading ? (
            <div className="space-y-2">
              <CategoryPlaceholder />
              <CategoryPlaceholder />
            </div>
          ) : null}

          {!categoriesQuery.isLoading && categoriesQuery.isError ? (
            <div className="rounded-2xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
              {categoriesQuery.error instanceof Error
                ? categoriesQuery.error.message
                : 'カテゴリ情報の取得に失敗しました。数秒後に再取得をお試しください。'}
            </div>
          ) : null}

          {!categoriesQuery.isLoading && !categoriesQuery.isError && categories.length === 0 ? (
            <div className="rounded-2xl border border-border/60 bg-surface/30 px-4 py-3 text-sm text-muted-foreground">
              カテゴリが見つかりませんでした。新しいカテゴリを作成するか、Discord側で作成した後に再取得してください。
            </div>
          ) : null}

          {!categoriesQuery.isLoading && !categoriesQuery.isError && categories.length > 0 ? (
            <ul className="space-y-2">
              {categories.map((category) => {
                const isSelected = category.id === selectedCategoryId;
                return (
                  <li key={category.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedCategoryId(category.id);
                        setSubmitError(null);
                      }}
                      className="flex w-full items-center justify-between gap-4 rounded-2xl border border-border/70 bg-surface/40 p-4 text-left transition hover:border-accent/50 hover:bg-surface/60"
                      aria-pressed={isSelected}
                    >
                      <div className="flex flex-col">
                        <span className="text-sm font-semibold text-surface-foreground">{category.name || '(名称未設定)'}</span>
                        <span className="text-xs text-muted-foreground">ID: {category.id}</span>
                      </div>
                      {isSelected ? (
                        <CheckCircleIcon className="h-6 w-6 text-accent" aria-hidden="true" />
                      ) : (
                        <span className="h-6 w-6 rounded-full border border-border/60" aria-hidden="true" />
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </section>

        <section className="space-y-3 rounded-2xl border border-border/70 bg-surface/20 p-4">
          <h3 className="text-sm font-semibold text-surface-foreground">カテゴリを新規作成</h3>
          <div className="flex flex-col gap-2 md:flex-row md:items-center">
            <div className="flex-1">
              <input
                type="text"
                className="w-full rounded-full border border-border/70 bg-surface/30 px-4 py-2 text-sm text-surface-foreground placeholder:text-muted-foreground focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/40"
                placeholder="新しいカテゴリ名"
                value={newCategoryName}
                onChange={(event) => setNewCategoryName(event.target.value)}
                disabled={isCreating}
              />
            </div>
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-full border border-accent/40 bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-60"
              onClick={() => {
                void handleCreateCategory();
              }}
              disabled={isCreating}
              aria-busy={isCreating}
            >
              {isCreating ? (
                <ArrowPathIcon className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <PlusIcon className="h-4 w-4" aria-hidden="true" />
              )}
              作成する
            </button>
          </div>
          {createError ? (
            <div className="rounded-2xl border border-danger/40 bg-danger/10 px-4 py-2 text-xs text-danger">{createError}</div>
          ) : null}
        </section>

        {submitError ? (
          <div className="rounded-2xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">{submitError}</div>
        ) : null}
      </ModalBody>

      <ModalFooter>
        <button type="button" className="btn btn-muted" onClick={close} disabled={isSubmitting}>
          キャンセル
        </button>
        <button
          type="button"
          className="btn btn-primary"
          onClick={handleSubmit}
          disabled={isSubmitting || categoriesQuery.isLoading}
          aria-busy={isSubmitting}
        >
          <span className="flex items-center gap-2">
            {isSubmitting ? <ArrowPathIcon className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
            <span>このカテゴリを使用</span>
          </span>
        </button>
      </ModalFooter>
    </>
  );
}

function CategoryPlaceholder(): JSX.Element {
  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl border border-border/60 bg-surface/30 p-4">
      <div className="h-3 w-1/3 rounded-full bg-surface/60" />
      <div className="h-3 w-10 rounded-full bg-surface/50" />
    </div>
  );
}
