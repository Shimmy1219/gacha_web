import { useCallback, useEffect, useMemo, useState } from 'react';
import { clsx } from 'clsx';

import { ItemPreview } from '../../components/ItemPreviewThumbnail';
import { getRarityTextPresentation } from '../../features/rarity/utils/rarityColorPresentation';
import { ReceiveBulkSaveButton, ReceiveSaveButton } from './components/ReceiveSaveButtons';
import { saveReceiveItem, saveReceiveItems } from './receiveSave';
import { extractReceiveMediaItems } from './receiveZip';
import {
  isHistoryStorageAvailable,
  loadHistoryFile,
  loadHistoryMetadata
} from './historyStorage';
import type { ReceiveMediaItem, ReceiveMediaKind } from './types';

interface ReceiveInventoryItem {
  key: string;
  gachaName: string;
  itemName: string;
  rarity: string | null;
  rarityColor: string | null;
  isRiagu: boolean;
  obtainedCount: number;
  kind: ReceiveMediaKind;
  previewUrl: string | null;
  sourceItems: ReceiveMediaItem[];
}

interface ReceiveGachaGroup {
  gachaName: string;
  items: ReceiveInventoryItem[];
  totalCount: number;
  sourceItems: ReceiveMediaItem[];
}

type PreviewKind = 'image' | 'video' | 'audio' | 'unknown';

function resolvePreviewKind(kind: ReceiveMediaKind): PreviewKind {
  if (kind === 'image') {
    return 'image';
  }
  if (kind === 'video') {
    return 'video';
  }
  if (kind === 'audio') {
    return 'audio';
  }
  return 'unknown';
}

function ReceiveInventoryItemCard({
  item,
  onSave,
  isSaving
}: {
  item: ReceiveInventoryItem;
  onSave: () => void;
  isSaving: boolean;
}): JSX.Element {
  const rarityPresentation = useMemo(
    () => getRarityTextPresentation(item.rarityColor ?? undefined),
    [item.rarityColor]
  );
  const previewKind = resolvePreviewKind(item.kind);

  return (
    <div className="rounded-2xl border border-border/60 bg-panel-muted/70 p-4">
      <div className="flex items-start gap-3">
        <ItemPreview
          previewUrl={item.previewUrl ?? null}
          alt={item.itemName}
          kindHint={previewKind}
          imageFit="contain"
          className="h-16 w-16 flex-shrink-0 bg-surface-deep"
          iconClassName="h-6 w-6"
          emptyLabel="noImage"
        />
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 text-sm font-semibold text-surface-foreground">{item.itemName}</p>
          {item.rarity ? (
            <span
              className={clsx('mt-1 block text-[11px] font-semibold', rarityPresentation.className)}
              style={rarityPresentation.style}
            >
              {item.rarity}
            </span>
          ) : null}
          <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
            <span className="chip">x{item.obtainedCount}</span>
            {item.isRiagu ? (
              <span className="chip border-amber-500/40 bg-amber-500/10 text-amber-600">リアルグッズ</span>
            ) : null}
          </div>
          <div className="mt-3 flex justify-end">
            <ReceiveSaveButton
              onClick={onSave}
              disabled={isSaving}
              className="h-8 px-3 text-xs"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export function ReceiveListPage(): JSX.Element {
  const [groups, setGroups] = useState<ReceiveGachaGroup[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savingGroupKey, setSavingGroupKey] = useState<string | null>(null);
  const [savingItemKey, setSavingItemKey] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const objectUrls: string[] = [];

    const load = async () => {
      if (!isHistoryStorageAvailable()) {
        setError('ブラウザのローカルストレージ・IndexedDBが利用できないため、所持一覧を表示できません。');
        setStatus('error');
        return;
      }

      const historyEntries = loadHistoryMetadata();
      if (historyEntries.length === 0) {
        setGroups([]);
        setStatus('ready');
        return;
      }

      try {
        const gachaMap = new Map<
          string,
          { itemMap: Map<string, ReceiveInventoryItem>; sourceItems: ReceiveMediaItem[] }
        >();

        for (const entry of historyEntries) {
          const blob = await loadHistoryFile(entry.id);
          if (!blob) {
            continue;
          }

          const items = await extractReceiveMediaItems(blob);
          for (const item of items) {
            const gachaName = item.metadata?.gachaName?.trim() || '不明なガチャ';
            const itemName = (item.metadata?.itemName ?? item.filename).trim() || '名称未設定';
            const itemKey = item.metadata?.id ?? `${gachaName}:${itemName}`;

            const existingGroup =
              gachaMap.get(gachaName) ?? { itemMap: new Map<string, ReceiveInventoryItem>(), sourceItems: [] };
            const itemMap = existingGroup.itemMap;
            const existing = itemMap.get(itemKey);
            const obtained = typeof item.metadata?.obtainedCount === 'number' && Number.isFinite(item.metadata.obtainedCount)
              ? Math.max(0, item.metadata.obtainedCount)
              : 1;

            if (existing) {
              existing.obtainedCount += obtained;
              if (!existing.previewUrl && item.kind === 'image') {
                const url = URL.createObjectURL(item.blob);
                objectUrls.push(url);
                existing.previewUrl = url;
              }
              existing.sourceItems.push(item);
            } else {
              const previewUrl = item.kind === 'image' ? URL.createObjectURL(item.blob) : null;
              if (previewUrl) {
                objectUrls.push(previewUrl);
              }

              itemMap.set(itemKey, {
                key: itemKey,
                gachaName,
                itemName,
                rarity: item.metadata?.rarity ?? null,
                rarityColor: item.metadata?.rarityColor ?? null,
                isRiagu: Boolean(item.metadata?.isRiagu),
                obtainedCount: obtained,
                kind: item.kind,
                previewUrl,
                sourceItems: [item]
              });
            }

            existingGroup.sourceItems.push(item);
            if (!gachaMap.has(gachaName)) {
              gachaMap.set(gachaName, existingGroup);
            }
          }
        }

        const nextGroups = Array.from(gachaMap.entries()).map(([gachaName, { itemMap, sourceItems }]) => {
          const items = Array.from(itemMap.values()).sort((a, b) => a.itemName.localeCompare(b.itemName));
          const totalCount = items.reduce((sum, item) => sum + item.obtainedCount, 0);
          return { gachaName, items, totalCount, sourceItems };
        });

        nextGroups.sort((a, b) => a.gachaName.localeCompare(b.gachaName));

        if (active) {
          setGroups(nextGroups);
          setStatus('ready');
        }
      } catch (loadError) {
        console.error('Failed to load receive list', loadError);
        if (active) {
          setError('所持一覧の読み込みに失敗しました。ブラウザの設定をご確認ください。');
          setStatus('error');
        }
      }
    };

    void load();

    return () => {
      active = false;
      objectUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);

  const isEmpty = status === 'ready' && groups.length === 0;
  const totalItems = useMemo(() => groups.reduce((sum, group) => sum + group.items.length, 0), [groups]);
  const totalCount = useMemo(() => groups.reduce((sum, group) => sum + group.totalCount, 0), [groups]);
  const hasSaving = Boolean(savingGroupKey || savingItemKey);

  const handleSaveItem = useCallback(async (item: ReceiveInventoryItem) => {
    const target = item.sourceItems[0];
    if (!target) {
      return;
    }
    if (typeof document === 'undefined') {
      setSaveError('保存機能はブラウザ環境でのみ利用できます。');
      return;
    }
    setSaveError(null);
    setSavingItemKey(item.key);
    try {
      await saveReceiveItem(target);
    } catch (saveError) {
      console.error('Failed to save receive inventory item', saveError);
      setSaveError('保存中にエラーが発生しました。もう一度お試しください。');
    } finally {
      setSavingItemKey(null);
    }
  }, []);

  const handleSaveGroup = useCallback(async (group: ReceiveGachaGroup) => {
    if (group.sourceItems.length === 0) {
      return;
    }
    if (typeof document === 'undefined') {
      setSaveError('まとめて保存機能はブラウザ環境でのみ利用できます。');
      return;
    }
    setSaveError(null);
    setSavingGroupKey(group.gachaName);
    try {
      await saveReceiveItems(group.sourceItems);
    } catch (saveError) {
      console.error('Failed to save receive inventory group', saveError);
      setSaveError('まとめて保存中にエラーが発生しました。個別保存をお試しください。');
    } finally {
      setSavingGroupKey(null);
    }
  }, []);

  return (
    <div className="receive-list-page min-h-screen text-surface-foreground">
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 lg:px-8">
        <header className="rounded-3xl border border-border/60 bg-panel/85 p-6 shadow-lg shadow-black/10 backdrop-blur">
          <span className="badge">所持一覧</span>
          <h1 className="mt-3 text-3xl font-bold">所持アイテム一覧</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            IndexedDB に保存されている景品をガチャ単位でまとめて表示します。
          </p>
          {status === 'ready' && groups.length > 0 ? (
            <p className="mt-3 text-xs text-muted-foreground">
              合計 {totalItems} 種類 / {totalCount} 個
            </p>
          ) : null}
        </header>

        {status === 'loading' ? (
          <div className="rounded-2xl border border-border/60 bg-surface/40 px-4 py-3 text-sm text-muted-foreground">
            所持一覧を読み込んでいます…
          </div>
        ) : null}

        {status === 'error' && error ? (
          <div className="rounded-2xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-500">
            {error}
          </div>
        ) : null}

        {saveError ? (
          <div className="rounded-2xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-500">
            {saveError}
          </div>
        ) : null}

        {isEmpty ? (
          <div className="rounded-2xl border border-dashed border-border/60 bg-surface/40 p-6 text-sm text-muted-foreground">
            まだ所持アイテムがありません。/receive で受け取ると一覧に表示されます。
          </div>
        ) : null}

        {groups.length > 0 ? (
          <section className="flex flex-col gap-6">
            {groups.map((group) => (
              <div
                key={group.gachaName}
                className="rounded-3xl border border-border/60 bg-panel/85 p-6 shadow-lg shadow-black/10"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold text-surface-foreground">{group.gachaName}</h2>
                    <p className="text-xs text-muted-foreground">
                      {group.items.length} 種類 / 合計 {group.totalCount} 個
                    </p>
                  </div>
                  <ReceiveBulkSaveButton
                    onClick={() => handleSaveGroup(group)}
                    isLoading={savingGroupKey === group.gachaName}
                    disabled={hasSaving}
                    className="h-9 px-4 text-xs"
                  />
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {group.items.map((item) => (
                    <ReceiveInventoryItemCard
                      key={item.key}
                      item={item}
                      onSave={() => handleSaveItem(item)}
                      isSaving={savingItemKey === item.key || Boolean(savingGroupKey)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </section>
        ) : null}
      </main>
    </div>
  );
}
