import { useEffect, useMemo, useState } from 'react';
import { clsx } from 'clsx';
import { ChevronDownIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';

import type {
  GachaAppStateV3,
  GachaCatalogStateV4,
  PullHistoryEntryStatus,
  PullHistoryEntryV1,
  PullHistoryStateV1,
  GachaRarityStateV3,
  UserInventoriesStateV3,
  UserInventorySnapshotV3
} from '@domain/app-persistence';
import { getPullHistoryStatusLabel } from '@domain/pullHistoryStatusLabels';

import { useGachaLocalStorage } from '../../features/storage/useGachaLocalStorage';
import type { SaveTargetSelection, SaveTargetSelectionMode } from '../../features/save/types';
import { ModalBody, ModalFooter, type ModalComponentProps } from '..';
import { SaveOptionsDialog } from './SaveOptionsDialog';
import { getRarityTextPresentation } from '../../features/rarity/utils/rarityColorPresentation';
import { WarningDialog } from './WarningDialog';
import { useModal } from '../ModalProvider';

interface SaveTargetDialogPayload {
  userId: string;
  userName: string;
  defaultSelection?: {
    mode?: SaveTargetSelectionMode;
    gachaIds?: string[];
  };
}

interface GachaSelectionEntry {
  gachaId: string;
  gachaName: string;
  itemTypeCount: number;
}

interface HistorySelectionEntry {
  id: string;
  gachaId: string;
  gachaName: string;
  executedAt: string;
  pullCount: number;
  status?: PullHistoryEntryStatus;
  hasOriginalPrizeMissing?: boolean;
  itemTypeCount: number;
  items: HistorySelectionItem[];
  rarityGroups: HistorySelectionRarityGroup[];
  newItems: string[];
}

interface HistorySelectionItem {
  itemId: string;
  itemName: string;
  count: number;
  rarityId?: string;
  rarityLabel?: string;
  rarityColor?: string;
  isOriginalPrize?: boolean;
  hasOriginalPrizeMissing?: boolean;
}

interface HistorySelectionRarityGroup {
  rarityId?: string;
  rarityLabel: string;
  rarityColor?: string;
  items: HistorySelectionItem[];
  totalCount: number;
}

const DATE_TIME_FORMATTER = new Intl.DateTimeFormat('ja-JP', {
  dateStyle: 'medium',
  timeStyle: 'short'
});

function formatExecutedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '日時不明';
  }
  return DATE_TIME_FORMATTER.format(date);
}

/**
 * ダイアログ呼び出し側から渡された既定ガチャID配列を正規化する。
 * 空文字や重複を排除して、初期チェック状態を安定させるために使用する。
 *
 * @param gachaIds 呼び出し元が指定した既定ガチャID配列
 * @returns 正規化済みガチャID配列
 */
function normalizeDefaultGachaIds(gachaIds?: string[]): string[] {
  if (!Array.isArray(gachaIds) || gachaIds.length === 0) {
    return [];
  }
  return Array.from(
    new Set(
      gachaIds
        .map((gachaId) => (typeof gachaId === 'string' ? gachaId.trim() : ''))
        .filter((gachaId) => gachaId.length > 0)
    )
  );
}

type AppMetaMap = GachaAppStateV3['meta'] | undefined;

function getGachaDisplayName(gachaId: string, appMeta: AppMetaMap): string {
  if (!gachaId) {
    return '未設定のガチャ';
  }
  return appMeta?.[gachaId]?.displayName ?? gachaId;
}

function formatMissingOriginalPrizeMessage(items: HistorySelectionItem[], gachaName: string): string {
  const missingNames = Array.from(
    new Set(
      items
        .filter((item) => item.hasOriginalPrizeMissing)
        .map((item) => item.itemName || item.itemId)
        .filter((name): name is string => Boolean(name))
    )
  );
  const itemCount = missingNames.length;
  if (itemCount === 0) {
    return 'オリジナル景品のファイルが割り当てられていません。ユーザーごとの「オリジナル景品設定」からファイルを割り当ててください。';
  }
  const previewNames = missingNames.slice(0, 3).map((name) => `「${name}」`).join('、');
  const suffix = itemCount > 3 ? `など${itemCount}件` : '';
  const previewLabel = previewNames ? `対象: ${previewNames}${suffix}。` : '';
  return `「${gachaName}」のオリジナル景品のうち${itemCount}件にファイルが割り当てられていません。${previewLabel}ユーザーごとの「オリジナル景品設定」からファイルを割り当ててください。`;
}

function collectSnapshotItemIds(snapshot: UserInventorySnapshotV3 | undefined): Set<string> {
  const itemIds = new Set<string>();
  if (!snapshot) {
    return itemIds;
  }

  Object.values(snapshot.items ?? {}).forEach((ids) => {
    if (!Array.isArray(ids)) {
      return;
    }
    ids.forEach((itemId) => {
      if (itemId) {
        itemIds.add(itemId);
      }
    });
  });

  Object.values(snapshot.counts ?? {}).forEach((record) => {
    Object.keys(record ?? {}).forEach((itemId) => {
      if (itemId) {
        itemIds.add(itemId);
      }
    });
  });

  return itemIds;
}

function buildGachaEntries(
  inventories: UserInventoriesStateV3 | undefined,
  userId: string,
  appMeta: AppMetaMap
): GachaSelectionEntry[] {
  const snapshots = inventories?.inventories?.[userId];
  if (!snapshots) {
    return [];
  }

  const map = new Map<string, { entry: GachaSelectionEntry; itemIds: Set<string> }>();
  Object.values(snapshots).forEach((snapshot) => {
    if (!snapshot?.gachaId) {
      return;
    }
    const gachaId = snapshot.gachaId;
    const gachaName = getGachaDisplayName(gachaId, appMeta);
    const snapshotItemIds = collectSnapshotItemIds(snapshot);
    const existing = map.get(gachaId);
    if (existing) {
      snapshotItemIds.forEach((itemId) => existing.itemIds.add(itemId));
      existing.entry.itemTypeCount = existing.itemIds.size;
      return;
    }
    map.set(gachaId, {
      entry: { gachaId, gachaName, itemTypeCount: snapshotItemIds.size },
      itemIds: snapshotItemIds
    });
  });

  return Array.from(map.values())
    .map(({ entry, itemIds }) => ({ ...entry, itemTypeCount: itemIds.size }))
    .sort((a, b) => a.gachaName.localeCompare(b.gachaName, 'ja'));
}

function buildHistoryEntries(
  history: PullHistoryStateV1 | undefined,
  userId: string,
  appMeta: AppMetaMap,
  catalogState: GachaCatalogStateV4 | undefined,
  rarityState: GachaRarityStateV3 | undefined
): HistorySelectionEntry[] {
  if (!history?.order || !history.pulls) {
    return [];
  }

  const result: HistorySelectionEntry[] = [];
  const rarityEntities = rarityState?.entities ?? {};
  history.order.forEach((entryId) => {
    const entry: PullHistoryEntryV1 | undefined = history.pulls?.[entryId];
    if (!entry || entry.userId !== userId) {
      return;
    }

    const catalogSnapshot = entry.gachaId ? catalogState?.byGacha?.[entry.gachaId] : undefined;
    const assignedCounts = new Map<string, number>();
    Object.entries(entry.originalPrizeAssignments ?? {}).forEach(([itemId, assignments]) => {
      if (!itemId || !Array.isArray(assignments)) {
        return;
      }
      const indices = new Set<number>();
      assignments.forEach((assignment) => {
        if (!assignment?.assetId) {
          return;
        }
        const index = Math.trunc(assignment.index);
        if (index < 0) {
          return;
        }
        indices.add(index);
      });
      if (indices.size > 0) {
        assignedCounts.set(itemId, indices.size);
      }
    });
    const rarityOrderIndex = new Map<string, number>();
    if (entry.gachaId) {
      rarityState?.byGacha?.[entry.gachaId]?.forEach((rarityId, index) => {
        rarityOrderIndex.set(rarityId, index);
      });
    }
    const orderIndex = new Map<string, number>();
    catalogSnapshot?.order?.forEach((itemId, index) => {
      orderIndex.set(itemId, index);
    });

    const normalizedItems = Object.entries(entry.itemCounts ?? {}).reduce<Array<{ itemId: string; count: number }>>(
      (acc, [itemId, value]) => {
        const normalized = Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
        if (itemId && normalized > 0) {
          acc.push({ itemId, count: normalized });
        }
        return acc;
      },
      []
    );
    const normalizedItemIds = new Set(normalizedItems.map((item) => item.itemId));
    const normalizedNewItems = Array.from(new Set(entry.newItems ?? [])).filter((itemId) =>
      normalizedItemIds.has(itemId)
    );

    const items: HistorySelectionItem[] = normalizedItems
      .map(({ itemId, count }) => {
        const catalogItem = catalogSnapshot?.items?.[itemId];
        const rarityId = catalogItem?.rarityId;
        const rarity = rarityId ? rarityEntities[rarityId] : undefined;
        const isOriginalPrize = catalogItem?.originalPrize === true;
        const assignedCount = isOriginalPrize ? assignedCounts.get(itemId) ?? 0 : 0;
        return {
          itemId,
          itemName: catalogItem?.name ?? itemId,
          count,
          rarityId,
          rarityLabel: rarity?.label ?? '未分類',
          rarityColor: rarity?.color,
          isOriginalPrize,
          hasOriginalPrizeMissing: isOriginalPrize && count > assignedCount
        };
      })
      .sort((a, b) => {
        const orderA = orderIndex.get(a.itemId) ?? Number.MAX_SAFE_INTEGER;
        const orderB = orderIndex.get(b.itemId) ?? Number.MAX_SAFE_INTEGER;
        if (orderA !== orderB) {
          return orderA - orderB;
        }
        if (a.itemName !== b.itemName) {
          return a.itemName.localeCompare(b.itemName, 'ja');
        }
        return b.count - a.count;
      });

    const rarityGroups = Array.from(
      items.reduce((acc, item) => {
        const rarityKey = item.rarityId ?? `__unassigned:${item.rarityLabel ?? '未分類'}`;
        const label = item.rarityLabel ?? '未分類';
        const existing = acc.get(rarityKey);
        if (existing) {
          existing.items.push(item);
          existing.totalCount += item.count;
          return acc;
        }
        acc.set(rarityKey, {
          rarityId: item.rarityId,
          rarityLabel: label,
          rarityColor: item.rarityColor,
          items: [item],
          totalCount: item.count
        });
        return acc;
      }, new Map<string, HistorySelectionRarityGroup>()).values()
    ).sort((a, b) => {
      const orderA = a.rarityId !== undefined ? rarityOrderIndex.get(a.rarityId) ?? Number.MAX_SAFE_INTEGER : Number.MAX_SAFE_INTEGER;
      const orderB = b.rarityId !== undefined ? rarityOrderIndex.get(b.rarityId) ?? Number.MAX_SAFE_INTEGER : Number.MAX_SAFE_INTEGER;
      if (orderA !== orderB) {
        return orderA - orderB;
      }
      return a.rarityLabel.localeCompare(b.rarityLabel, 'ja');
    });

    const normalizedStatus = entry.status ?? 'new';
    const missingByItems = items.length > 0 ? items.some((item) => item.hasOriginalPrizeMissing) : false;
    const hasOriginalPrizeMissing =
      normalizedStatus !== 'new' &&
      (missingByItems || (items.length === 0 && entry.hasOriginalPrizeMissing === true));

    result.push({
      id: entry.id,
      gachaId: entry.gachaId,
      gachaName: getGachaDisplayName(entry.gachaId, appMeta),
      executedAt: entry.executedAt,
      pullCount: entry.pullCount,
      status: entry.status,
      hasOriginalPrizeMissing,
      itemTypeCount: normalizedItems.length,
      items,
      rarityGroups,
      newItems: normalizedNewItems
    });
  });

  return result.sort((a, b) => {
    const aTime = new Date(a.executedAt).getTime();
    const bTime = new Date(b.executedAt).getTime();
    if (Number.isNaN(aTime) || Number.isNaN(bTime)) {
      return 0;
    }
    return bTime - aTime;
  });
}

export function SaveTargetDialog({ payload, replace, close }: ModalComponentProps<SaveTargetDialogPayload>): JSX.Element {
  const { push } = useModal();
  const { status, data, error } = useGachaLocalStorage();
  const defaultMode = payload.defaultSelection?.mode ?? 'all';
  const defaultGachaIds = useMemo(
    () => normalizeDefaultGachaIds(payload.defaultSelection?.gachaIds),
    [payload.defaultSelection?.gachaIds]
  );
  const [mode, setMode] = useState<SaveTargetSelectionMode>(defaultMode);
  const [selectedGachaIds, setSelectedGachaIds] = useState<string[]>(defaultGachaIds);
  const [gachaSelectionInitialized, setGachaSelectionInitialized] = useState(defaultGachaIds.length > 0);
  const [selectedHistoryIds, setSelectedHistoryIds] = useState<string[]>([]);
  const [historySelectionInitialized, setHistorySelectionInitialized] = useState(false);
  const [expandedHistoryIds, setExpandedHistoryIds] = useState<string[]>([]);
  const [newItemsOnlyHistoryIds, setNewItemsOnlyHistoryIds] = useState<string[]>([]);
  const [missingOnlyHistoryIds, setMissingOnlyHistoryIds] = useState<string[]>([]);
  const [validationError, setValidationError] = useState<string | null>(null);

  const appMeta = data?.appState?.meta;
  const catalogState = data?.catalogState;
  const rarityState = data?.rarityState;

  const gachaEntries = useMemo(
    () => buildGachaEntries(data?.userInventories, payload.userId, appMeta),
    [appMeta, data?.userInventories, payload.userId]
  );

  const historyEntries = useMemo(
    () => buildHistoryEntries(data?.pullHistory, payload.userId, appMeta, catalogState, rarityState),
    [appMeta, catalogState, data?.pullHistory, payload.userId, rarityState]
  );
  const historyMissingEntryIds = useMemo(() => {
    return new Set(historyEntries.filter((entry) => entry.hasOriginalPrizeMissing).map((entry) => entry.id));
  }, [historyEntries]);

  useEffect(() => {
    setValidationError(null);
  }, [mode, selectedGachaIds, selectedHistoryIds]);

  useEffect(() => {
    if (
      mode === 'gacha' &&
      gachaEntries.length > 0 &&
      selectedGachaIds.length === 0 &&
      !gachaSelectionInitialized
    ) {
      setGachaSelectionInitialized(true);
      setSelectedGachaIds(gachaEntries.map((entry) => entry.gachaId));
    }
  }, [mode, gachaEntries, gachaSelectionInitialized, selectedGachaIds.length]);

  useEffect(() => {
    if (
      mode === 'history' &&
      historyEntries.length > 0 &&
      selectedHistoryIds.length === 0 &&
      !historySelectionInitialized
    ) {
      const defaultHistoryIds = historyEntries
        .filter((entry) => (entry.status ?? 'new') === 'new')
        .map((entry) => entry.id);

      setHistorySelectionInitialized(true);
      if (defaultHistoryIds.length > 0) {
        setSelectedHistoryIds(defaultHistoryIds);
      }
    }
  }, [mode, historyEntries, historySelectionInitialized, selectedHistoryIds.length]);

  useEffect(() => {
    setSelectedGachaIds((previous) => {
      if (gachaEntries.length === 0) {
        if (status !== 'ready') {
          // 初期ロード中は呼び出し元の既定選択を維持し、全選択へのフォールバック誤作動を防ぐ。
          return previous;
        }
        if (previous.length > 0) {
          setGachaSelectionInitialized(false);
        }
        return [];
      }
      if (previous.length === 0) {
        return previous;
      }
      const validIds = previous.filter((id) => gachaEntries.some((entry) => entry.gachaId === id));
      if (validIds.length === previous.length) {
        return previous;
      }
      if (validIds.length === 0) {
        setGachaSelectionInitialized(false);
      }
      return validIds;
    });
  }, [gachaEntries, status]);

  useEffect(() => {
    setSelectedHistoryIds((previous) => {
      if (previous.length === 0) {
        return previous;
      }
      const validIds = previous.filter((id) => historyEntries.some((entry) => entry.id === id));
      if (validIds.length === previous.length) {
        return previous;
      }
      if (validIds.length === 0) {
        setHistorySelectionInitialized(false);
      }
      return validIds;
    });
  }, [historyEntries]);

  useEffect(() => {
    setNewItemsOnlyHistoryIds((previous) => {
      if (previous.length === 0) {
        return previous;
      }
      const selectedSet = new Set(selectedHistoryIds);
      const validIds = previous.filter((id) => selectedSet.has(id));
      if (validIds.length === previous.length) {
        return previous;
      }
      return validIds;
    });
  }, [selectedHistoryIds, historyEntries]);

  useEffect(() => {
    setMissingOnlyHistoryIds((previous) => {
      if (previous.length === 0) {
        return previous;
      }
      const selectedSet = new Set(selectedHistoryIds);
      const validIds = previous.filter((id) => selectedSet.has(id) && historyMissingEntryIds.has(id));
      if (validIds.length === previous.length) {
        return previous;
      }
      return validIds;
    });
  }, [historyMissingEntryIds, selectedHistoryIds]);

  useEffect(() => {
    setExpandedHistoryIds((previous) =>
      previous.filter((id) => historyEntries.some((entry) => entry.id === id))
    );
  }, [historyEntries]);

  const isSelectionValid = useMemo(() => {
    if (mode === 'gacha') {
      return selectedGachaIds.length > 0;
    }
    if (mode === 'history') {
      return selectedHistoryIds.length > 0;
    }
    return true;
  }, [mode, selectedGachaIds.length, selectedHistoryIds.length]);

  const toggleGacha = (gachaId: string) => {
    setGachaSelectionInitialized(true);
    setSelectedGachaIds((previous) => {
      if (previous.includes(gachaId)) {
        return previous.filter((id) => id !== gachaId);
      }
      return [...previous, gachaId];
    });
  };

  const toggleHistory = (entryId: string) => {
    setHistorySelectionInitialized(true);
    setSelectedHistoryIds((previous) => {
      if (previous.includes(entryId)) {
        return previous.filter((id) => id !== entryId);
      }
      return [...previous, entryId];
    });
  };

  const toggleHistoryNewOnly = (entryId: string) => {
    setHistorySelectionInitialized(true);
    setSelectedHistoryIds((previous) => {
      if (previous.includes(entryId)) {
        return previous;
      }
      return [...previous, entryId];
    });
    if (!newItemsOnlyHistoryIds.includes(entryId)) {
      setMissingOnlyHistoryIds((previous) => previous.filter((id) => id !== entryId));
    }
    setNewItemsOnlyHistoryIds((previous) => {
      if (previous.includes(entryId)) {
        return previous.filter((id) => id !== entryId);
      }
      return [...previous, entryId];
    });
  };

  const toggleHistoryMissingOnly = (entryId: string) => {
    setHistorySelectionInitialized(true);
    setSelectedHistoryIds((previous) => {
      if (previous.includes(entryId)) {
        return previous;
      }
      return [...previous, entryId];
    });
    if (!missingOnlyHistoryIds.includes(entryId)) {
      setNewItemsOnlyHistoryIds((previous) => previous.filter((id) => id !== entryId));
    }
    setMissingOnlyHistoryIds((previous) => {
      if (previous.includes(entryId)) {
        return previous.filter((id) => id !== entryId);
      }
      return [...previous, entryId];
    });
  };

  const toggleHistoryExpanded = (entryId: string) => {
    setExpandedHistoryIds((previous) => {
      if (previous.includes(entryId)) {
        return previous.filter((id) => id !== entryId);
      }
      return [...previous, entryId];
    });
  };

  const handleProceed = () => {
    if (status !== 'ready' || !data) {
      setValidationError('ローカルデータの読み込み中です。しばらくお待ちください。');
      return;
    }

    let selection: SaveTargetSelection;
    if (mode === 'gacha') {
      if (selectedGachaIds.length === 0) {
        setValidationError('保存するガチャを選択してください');
        return;
      }
      selection = { mode: 'gacha', gachaIds: [...new Set(selectedGachaIds)] };
    } else if (mode === 'history') {
      if (selectedHistoryIds.length === 0) {
        setValidationError('保存する履歴を選択してください');
        return;
      }
      const uniqueHistoryIds = [...new Set(selectedHistoryIds)];
      const uniqueNewOnlyIds = Array.from(new Set(newItemsOnlyHistoryIds)).filter((id) =>
        uniqueHistoryIds.includes(id)
      );
      const uniqueMissingOnlyIds = Array.from(new Set(missingOnlyHistoryIds)).filter(
        (id) => uniqueHistoryIds.includes(id) && historyMissingEntryIds.has(id)
      );
      selection = {
        mode: 'history',
        pullIds: uniqueHistoryIds,
        ...(uniqueNewOnlyIds.length > 0 ? { newItemsOnlyPullIds: uniqueNewOnlyIds } : {}),
        ...(uniqueMissingOnlyIds.length > 0 ? { missingOnlyPullIds: uniqueMissingOnlyIds } : {})
      };
    } else {
      selection = { mode: 'all' };
    }

    replace(SaveOptionsDialog, {
      id: `save-options-${payload.userId}`,
      title: '保存オプション',
      description: 'ZIP保存・アップロード・共有リンクの各オプションを選択できます。',
      size: 'lg',
      payload: {
        userId: payload.userId,
        userName: payload.userName,
        snapshot: data,
        selection
      }
    });
  };

  const allGachaSelected = gachaEntries.length > 0 && selectedGachaIds.length === gachaEntries.length;
  const allHistorySelected = historyEntries.length > 0 && selectedHistoryIds.length === historyEntries.length;

  return (
    <>
      <ModalBody className="space-y-6">
        <div className="rounded-2xl border border-border/60 bg-surface/30 p-4 text-sm">
          <p className="font-semibold text-surface-foreground">保存対象ユーザー: {payload.userName}</p>
          <p className="mt-1 text-xs text-muted-foreground">保存したい範囲を選んで「次へ」を押してください。</p>
        </div>

        <div className="space-y-3">
          <SaveModeOption
            mode="all"
            currentMode={mode}
            title="今までに獲得したガチャの景品全てを保存"
            description="ユーザーが保持している全てのガチャ景品をまとめてZIPにします。"
            onSelect={setMode}
            disabled={status === 'loading'}
          />
          <SaveModeOption
            mode="gacha"
            currentMode={mode}
            title="ガチャ毎に選択して保存"
            description="対象のガチャを選び、そのガチャで獲得した景品のみを保存します。"
            onSelect={setMode}
            disabled={status === 'loading' || gachaEntries.length === 0}
            badge={gachaEntries.length === 0 ? '対象ガチャなし' : undefined}
          />
          <SaveModeOption
            mode="history"
            currentMode={mode}
            title="特定の履歴を選択して保存"
            description="抽選履歴から保存したい回だけを選び、該当する景品をZIPにまとめます。"
            onSelect={setMode}
            disabled={status === 'loading' || historyEntries.length === 0}
            badge={historyEntries.length === 0 ? '履歴なし' : undefined}
          />
        </div>

        {status === 'loading' ? (
          <div className="rounded-2xl border border-border/50 bg-surface/30 px-4 py-3 text-sm text-muted-foreground">
            ローカルストレージからデータを読み込み中です…
          </div>
        ) : null}
        {error ? (
          <div className="rounded-2xl border border-rose-500/60 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
            データの読み込みに失敗しました: {error}
          </div>
        ) : null}

        {mode === 'gacha' ? (
          <div className="space-y-4 rounded-2xl border border-border/60 bg-surface/30 p-4">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-surface-foreground">保存するガチャを選択</h3>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => {
                  setGachaSelectionInitialized(true);
                  setSelectedGachaIds(
                    allGachaSelected ? [] : gachaEntries.map((entry) => entry.gachaId)
                  );
                }}
                disabled={gachaEntries.length === 0}
              >
                {allGachaSelected ? 'すべて解除' : 'すべて選択'}
              </button>
            </div>
            {gachaEntries.length === 0 ? (
              <p className="text-sm text-muted-foreground">保存できるガチャがありません。</p>
            ) : (
              <div className="grid gap-2">
                {gachaEntries.map((entry) => (
                  <label
                    key={entry.gachaId}
                    className={clsx(
                      'flex cursor-pointer items-center justify-between gap-3 rounded-xl border px-3 py-2 text-sm transition',
                      selectedGachaIds.includes(entry.gachaId)
                        ? 'border-accent bg-accent/10 text-surface-foreground'
                        : 'border-border/60 bg-surface/40 text-muted-foreground hover:border-border/80 hover:bg-surface/50'
                    )}
                  >
                    <div className="flex flex-col">
                      <span className="font-semibold text-surface-foreground/90">{entry.gachaName}</span>
                      <span className="text-[11px] text-muted-foreground">{entry.itemTypeCount}種類の景品</span>
                    </div>
                    <input
                      type="checkbox"
                      className="h-4 w-4"
                      checked={selectedGachaIds.includes(entry.gachaId)}
                      onChange={() => toggleGacha(entry.gachaId)}
                    />
                  </label>
                ))}
              </div>
            )}
          </div>
        ) : null}

        {mode === 'history' ? (
          <div className="space-y-4 rounded-2xl border border-border/60 bg-surface/30 p-4">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-surface-foreground">保存する履歴を選択</h3>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => {
                  setHistorySelectionInitialized(true);
                  setSelectedHistoryIds(
                    allHistorySelected ? [] : historyEntries.map((entry) => entry.id)
                  );
                }}
                disabled={historyEntries.length === 0}
              >
                {allHistorySelected ? 'すべて解除' : 'すべて選択'}
              </button>
            </div>
            {historyEntries.length === 0 ? (
              <p className="text-sm text-muted-foreground">保存できる履歴がありません。</p>
            ) : (
              <div className="grid max-h-72 gap-2 overflow-y-auto pr-1">
                {historyEntries.map((entry) => {
                  const entryHasOriginalPrizeMissing = historyMissingEntryIds.has(entry.id);
                  const statusLabel = getPullHistoryStatusLabel(entry.status, {
                    hasOriginalPrizeMissing: entryHasOriginalPrizeMissing
                  });
                  const newItemsOnlyActive = newItemsOnlyHistoryIds.includes(entry.id);
                  const missingOnlyActive = missingOnlyHistoryIds.includes(entry.id);
                  const newItemsSet = new Set(entry.newItems);
                  const missingWarningMessage = entryHasOriginalPrizeMissing
                    ? formatMissingOriginalPrizeMessage(entry.items, entry.gachaName)
                    : '';
                  return (
                    <div
                      key={entry.id}
                      className={clsx(
                        'overflow-hidden rounded-xl border text-sm transition',
                        selectedHistoryIds.includes(entry.id)
                          ? 'border-accent bg-accent/10'
                          : 'border-border/60 bg-surface/40 hover:border-border/80 hover:bg-surface/50'
                      )}
                    >
                      <button
                        type="button"
                        className="flex w-full items-start justify-between gap-3 px-3 py-2 text-left"
                        onClick={() => toggleHistoryExpanded(entry.id)}
                        aria-expanded={expandedHistoryIds.includes(entry.id)}
                        aria-controls={`history-entry-${entry.id}`}
                      >
                        <div className="flex flex-1 flex-col">
                          <span className="font-semibold text-surface-foreground/90">{entry.gachaName}</span>
                          <span className="text-[11px] text-muted-foreground">
                            {formatExecutedAt(entry.executedAt)} ・ {entry.pullCount}連
                            {statusLabel ? ` ・ ${statusLabel}` : ''}
                          </span>
                        </div>
                        <ChevronDownIcon
                          className={clsx(
                            'h-4 w-4 shrink-0 text-muted-foreground transition-transform',
                            expandedHistoryIds.includes(entry.id) ? 'rotate-180' : 'rotate-0'
                          )}
                        />
                      </button>
                      <div className="flex items-start justify-between gap-3 border-t border-border/60 bg-surface/30 px-3 py-2 text-xs">
                        <div className="flex flex-col gap-1">
                          <label className="flex cursor-pointer items-center gap-2 text-surface-foreground/80">
                            <input
                              type="checkbox"
                              className="h-4 w-4"
                              checked={selectedHistoryIds.includes(entry.id)}
                              onChange={() => toggleHistory(entry.id)}
                            />
                            <span>この履歴を保存</span>
                          </label>
                          <label className="flex cursor-pointer items-center gap-2 text-surface-foreground/70">
                            <input
                              type="checkbox"
                              className="h-4 w-4"
                              checked={newItemsOnlyHistoryIds.includes(entry.id)}
                              onChange={() => toggleHistoryNewOnly(entry.id)}
                            />
                            <span>ユーザーが新規に取得したものだけを保存</span>
                          </label>
                          {entryHasOriginalPrizeMissing ? (
                            <div className="flex items-center gap-2 text-surface-foreground/70">
                              <label className="flex cursor-pointer items-center gap-2">
                                <input
                                  type="checkbox"
                                  className="h-4 w-4"
                                  checked={missingOnlyActive}
                                  onChange={() => toggleHistoryMissingOnly(entry.id)}
                                />
                                <span>未送信分のみ保存</span>
                              </label>
                              <button
                                type="button"
                                className="inline-flex h-6 w-6 items-center justify-center rounded-full text-amber-500 transition hover:bg-amber-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/60"
                                onClick={() => {
                                  push(WarningDialog, {
                                    id: `original-prize-warning-${entry.id}`,
                                    title: 'オリジナル景品の警告',
                                    size: 'sm',
                                    payload: {
                                      message: missingWarningMessage,
                                      confirmLabel: '閉じる'
                                    }
                                  });
                                }}
                                aria-label="オリジナル景品の警告を表示"
                                title="オリジナル景品の警告を表示"
                              >
                                <ExclamationTriangleIcon className="h-3 w-3" aria-hidden="true" />
                              </button>
                            </div>
                          ) : null}
                        </div>
                        <span className="text-[11px] text-muted-foreground">{entry.itemTypeCount}種類の景品</span>
                      </div>
                      <div
                        id={`history-entry-${entry.id}`}
                        className={clsx(
                          'border-t border-border/60 bg-surface/40 px-3 text-xs text-muted-foreground transition-all duration-200 ease-in-out',
                          expandedHistoryIds.includes(entry.id)
                            ? 'max-h-96 overflow-y-auto py-3 opacity-100'
                            : 'max-h-0 overflow-hidden py-0 opacity-0'
                        )}
                      >
                        {entry.rarityGroups.length > 0 ? (
                          <div className="space-y-3 text-xs">
                            {entry.rarityGroups.map((group) => {
                              const { className, style } = getRarityTextPresentation(group.rarityColor);
                              const groupKey = group.rarityId ?? `unassigned-${group.rarityLabel}`;
                              return (
                                <div
                                  key={`${entry.id}-${groupKey}`}
                                  className="grid gap-2 sm:grid-cols-[minmax(4rem,auto),1fr] sm:items-start"
                                >
                                  <div className="flex items-center gap-2">
                                    <span className={clsx('text-xs font-semibold', className)} style={style}>
                                      {group.rarityLabel}
                                    </span>
                                    <span className="text-[10px] text-muted-foreground">{group.totalCount}件</span>
                                  </div>
                                  <div className="flex flex-wrap items-start gap-2">
                                    {group.items.map((item) => (
                                      <span
                                        key={`${entry.id}-${groupKey}-${item.itemId}`}
                                        className={clsx(
                                          'inline-flex min-w-0 items-center gap-1 rounded-full border border-border/60 bg-surface/70 px-2 py-0.5 text-[11px]',
                                          newItemsOnlyActive && !newItemsSet.has(item.itemId) && !item.isOriginalPrize
                                            ? 'text-muted-foreground opacity-40'
                                            : 'text-surface-foreground/90'
                                        )}
                                      >
                                        <span className="max-w-[10rem] truncate">{item.itemName}</span>
                                        {item.count > 1 ? (
                                          <span className="text-[10px] text-muted-foreground">×{item.count}</span>
                                        ) : null}
                                        {item.hasOriginalPrizeMissing ? (
                                          <ExclamationTriangleIcon
                                            className="h-3 w-3 text-amber-500"
                                            aria-label="未送信"
                                          />
                                        ) : null}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <p className="text-[11px] text-muted-foreground">景品情報が見つかりませんでした。</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : null}

        {validationError ? (
          <div className="rounded-2xl border border-rose-500/70 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
            {validationError}
          </div>
        ) : null}
      </ModalBody>
      <ModalFooter>
        <button type="button" className="btn btn-muted" onClick={close}>
          キャンセル
        </button>
        <button
          type="button"
          className="btn btn-primary"
          onClick={handleProceed}
          disabled={!isSelectionValid || status === 'loading'}
        >
          次へ
        </button>
      </ModalFooter>
    </>
  );
}

interface SaveModeOptionProps {
  mode: SaveTargetSelectionMode;
  currentMode: SaveTargetSelectionMode;
  title: string;
  description: string;
  onSelect: (mode: SaveTargetSelectionMode) => void;
  disabled?: boolean;
  badge?: string;
}

function SaveModeOption({ mode, currentMode, title, description, onSelect, disabled, badge }: SaveModeOptionProps): JSX.Element {
  const selected = mode === currentMode;
  return (
    <label
      className={clsx(
        'flex cursor-pointer items-start gap-3 rounded-2xl border px-4 py-3 transition',
        selected
          ? 'border-accent bg-accent/10 text-surface-foreground'
          : 'border-border/60 bg-surface/30 text-muted-foreground hover:border-border/80 hover:bg-surface/40',
        disabled && 'cursor-not-allowed opacity-50 hover:border-border/60 hover:bg-surface/30'
      )}
    >
      <input
        type="radio"
        name="save-target-mode"
        value={mode}
        className="mt-1 h-4 w-4"
        checked={selected}
        onChange={() => {
          if (!disabled) {
            onSelect(mode);
          }
        }}
        disabled={disabled}
      />
      <div className="flex flex-1 flex-col gap-1">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-surface-foreground">{title}</span>
          {badge ? (
            <span className="rounded-full bg-border px-2 py-0.5 text-[11px] text-muted-foreground">{badge}</span>
          ) : null}
        </div>
        <span className="text-xs text-muted-foreground">{description}</span>
      </div>
    </label>
  );
}
