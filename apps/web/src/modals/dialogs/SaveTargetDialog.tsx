import { useEffect, useMemo, useState } from 'react';
import { clsx } from 'clsx';

import type {
  GachaAppStateV3,
  PullHistoryEntryV1,
  PullHistoryStateV1,
  UserInventoriesStateV3,
  UserInventorySnapshotV3
} from '@domain/app-persistence';

import { useGachaLocalStorage } from '../../features/storage/useGachaLocalStorage';
import type { SaveTargetSelection, SaveTargetSelectionMode } from '../../features/save/types';
import { ModalBody, ModalFooter, type ModalComponentProps } from '..';
import { SaveOptionsDialog } from './SaveOptionsDialog';

interface SaveTargetDialogPayload {
  userId: string;
  userName: string;
}

interface GachaSelectionEntry {
  gachaId: string;
  gachaName: string;
  itemCount: number;
}

interface HistorySelectionEntry {
  id: string;
  gachaId: string;
  gachaName: string;
  executedAt: string;
  pullCount: number;
  itemCount: number;
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

type AppMetaMap = GachaAppStateV3['meta'] | undefined;

function getGachaDisplayName(gachaId: string, appMeta: AppMetaMap): string {
  if (!gachaId) {
    return '未設定のガチャ';
  }
  return appMeta?.[gachaId]?.displayName ?? gachaId;
}

function countSnapshotItems(snapshot: UserInventorySnapshotV3 | undefined): number {
  if (!snapshot) {
    return 0;
  }
  const counts = snapshot.counts ?? {};
  const totalFromCounts = Object.values(counts).reduce((total, record) => {
    if (!record) {
      return total;
    }
    return (
      total +
      Object.values(record).reduce((sum, value) => {
        const normalized = Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
        return sum + (normalized > 0 ? normalized : 0);
      }, 0)
    );
  }, 0);

  if (totalFromCounts > 0) {
    return totalFromCounts;
  }

  return Object.values(snapshot.items ?? {}).reduce((total, itemIds) => {
    if (!Array.isArray(itemIds)) {
      return total;
    }
    return total + itemIds.length;
  }, 0);
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

  const map = new Map<string, GachaSelectionEntry>();
  Object.values(snapshots).forEach((snapshot) => {
    if (!snapshot?.gachaId) {
      return;
    }
    const gachaId = snapshot.gachaId;
    const itemCount = countSnapshotItems(snapshot);
    const gachaName = getGachaDisplayName(gachaId, appMeta);
    const existing = map.get(gachaId);
    if (existing) {
      existing.itemCount += itemCount;
      return;
    }
    map.set(gachaId, { gachaId, gachaName, itemCount });
  });

  return Array.from(map.values()).sort((a, b) => a.gachaName.localeCompare(b.gachaName, 'ja'));
}

function buildHistoryEntries(
  history: PullHistoryStateV1 | undefined,
  userId: string,
  appMeta: AppMetaMap
): HistorySelectionEntry[] {
  if (!history?.order || !history.pulls) {
    return [];
  }

  const result: HistorySelectionEntry[] = [];
  history.order.forEach((entryId) => {
    const entry: PullHistoryEntryV1 | undefined = history.pulls?.[entryId];
    if (!entry || entry.userId !== userId) {
      return;
    }

    const itemCount = Object.values(entry.itemCounts ?? {}).reduce((total, value) => {
      const normalized = Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
      return total + (normalized > 0 ? normalized : 0);
    }, 0);

    result.push({
      id: entry.id,
      gachaId: entry.gachaId,
      gachaName: getGachaDisplayName(entry.gachaId, appMeta),
      executedAt: entry.executedAt,
      pullCount: entry.pullCount,
      itemCount
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
  const { status, data, error } = useGachaLocalStorage();
  const [mode, setMode] = useState<SaveTargetSelectionMode>('all');
  const [selectedGachaIds, setSelectedGachaIds] = useState<string[]>([]);
  const [selectedHistoryIds, setSelectedHistoryIds] = useState<string[]>([]);
  const [validationError, setValidationError] = useState<string | null>(null);

  const appMeta = data?.appState?.meta;

  const gachaEntries = useMemo(
    () => buildGachaEntries(data?.userInventories, payload.userId, appMeta),
    [appMeta, data?.userInventories, payload.userId]
  );

  const historyEntries = useMemo(
    () => buildHistoryEntries(data?.pullHistory, payload.userId, appMeta),
    [appMeta, data?.pullHistory, payload.userId]
  );

  useEffect(() => {
    setValidationError(null);
  }, [mode, selectedGachaIds, selectedHistoryIds]);

  useEffect(() => {
    if (mode === 'gacha' && selectedGachaIds.length === 0 && gachaEntries.length > 0) {
      setSelectedGachaIds(gachaEntries.map((entry) => entry.gachaId));
    }
  }, [mode, gachaEntries, selectedGachaIds.length]);

  useEffect(() => {
    if (mode === 'history' && selectedHistoryIds.length === 0 && historyEntries.length > 0) {
      setSelectedHistoryIds(historyEntries.map((entry) => entry.id));
    }
  }, [mode, historyEntries, selectedHistoryIds.length]);

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
    setSelectedGachaIds((previous) => {
      if (previous.includes(gachaId)) {
        return previous.filter((id) => id !== gachaId);
      }
      return [...previous, gachaId];
    });
  };

  const toggleHistory = (entryId: string) => {
    setSelectedHistoryIds((previous) => {
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
      selection = { mode: 'history', pullIds: [...new Set(selectedHistoryIds)] };
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
            title="その人が今までに獲得したガチャの景品全てを保存"
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
                onClick={() => setSelectedGachaIds(allGachaSelected ? [] : gachaEntries.map((entry) => entry.gachaId))}
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
                      <span className="text-[11px] text-muted-foreground">{entry.itemCount}件の景品</span>
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
                onClick={() => setSelectedHistoryIds(allHistorySelected ? [] : historyEntries.map((entry) => entry.id))}
                disabled={historyEntries.length === 0}
              >
                {allHistorySelected ? 'すべて解除' : 'すべて選択'}
              </button>
            </div>
            {historyEntries.length === 0 ? (
              <p className="text-sm text-muted-foreground">保存できる履歴がありません。</p>
            ) : (
              <div className="grid max-h-72 gap-2 overflow-y-auto pr-1">
                {historyEntries.map((entry) => (
                  <label
                    key={entry.id}
                    className={clsx(
                      'flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-2 text-sm transition',
                      selectedHistoryIds.includes(entry.id)
                        ? 'border-accent bg-accent/10 text-surface-foreground'
                        : 'border-border/60 bg-surface/40 text-muted-foreground hover:border-border/80 hover:bg-surface/50'
                    )}
                  >
                    <input
                      type="checkbox"
                      className="mt-1 h-4 w-4"
                      checked={selectedHistoryIds.includes(entry.id)}
                      onChange={() => toggleHistory(entry.id)}
                    />
                    <div className="flex flex-col">
                      <span className="font-semibold text-surface-foreground/90">{entry.gachaName}</span>
                      <span className="text-[11px] text-muted-foreground">
                        {formatExecutedAt(entry.executedAt)} ・ {entry.pullCount}連 / {entry.itemCount}件
                      </span>
                    </div>
                  </label>
                ))}
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
