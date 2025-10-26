import { SparklesIcon } from '@heroicons/react/24/outline';
import { useEffect, useMemo, useState } from 'react';

import { SingleSelectDropdown, type SingleSelectOption } from '../../pages/gacha/components/select/SingleSelectDropdown';
import { ModalBody, ModalFooter, type ModalComponentProps } from '..';
import { useDomainStores } from '../../features/storage/AppPersistenceProvider';
import { useStoreValue } from '@domain/stores';
import type {
  GachaAppStateV3,
  GachaCatalogStateV3,
  GachaRarityStateV3
} from '@domain/app-persistence';
import type { GachaResultPayload } from '@domain/gacha/gachaResult';

interface DrawGachaDialogResultItem {
  itemId: string;
  name: string;
  rarityId: string;
  rarityLabel: string;
  rarityColor?: string;
  count: number;
}

interface GachaDefinition {
  id: string;
  label: string;
  items: Array<{
    itemId: string;
    name: string;
    rarityId: string;
    rarityLabel: string;
    rarityColor?: string;
  }>;
}

function buildGachaDefinitions(
  appState: GachaAppStateV3 | undefined,
  catalogState: GachaCatalogStateV3 | undefined,
  rarityState: GachaRarityStateV3 | undefined
): { options: Array<SingleSelectOption<string>>; map: Map<string, GachaDefinition> } {
  const options: Array<SingleSelectOption<string>> = [];
  const map = new Map<string, GachaDefinition>();

  if (!catalogState?.byGacha) {
    return { options, map };
  }

  const orderFromAppState = appState?.order ?? [];
  const knownGacha = new Set<string>();

  const appendGacha = (gachaId: string) => {
    if (knownGacha.has(gachaId)) {
      return;
    }
    const snapshot = catalogState.byGacha?.[gachaId];
    if (!snapshot) {
      return;
    }
    const itemOrder = snapshot.order ?? Object.keys(snapshot.items ?? {});
    const rarityEntities = rarityState?.entities ?? {};
    const definition: GachaDefinition = {
      id: gachaId,
      label: appState?.meta?.[gachaId]?.displayName ?? gachaId,
      items: []
    };

    itemOrder.forEach((itemId) => {
      const item = snapshot.items?.[itemId];
      if (!item) {
        return;
      }
      const rarity = rarityEntities[item.rarityId];
      definition.items.push({
        itemId: item.itemId,
        name: item.name,
        rarityId: item.rarityId,
        rarityLabel: rarity?.label ?? item.rarityId,
        rarityColor: rarity?.color ?? undefined
      });
    });

    if (definition.items.length === 0) {
      return;
    }

    knownGacha.add(gachaId);
    map.set(gachaId, definition);
    options.push({ value: gachaId, label: definition.label });
  };

  orderFromAppState.forEach(appendGacha);

  Object.keys(catalogState.byGacha).forEach((gachaId) => {
    appendGacha(gachaId);
  });

  return { options, map };
}

function formatExecutedAt(value: string | undefined): string {
  if (!value) {
    return '';
  }
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) {
    return value;
  }
  return new Intl.DateTimeFormat('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  }).format(date);
}

export function DrawGachaDialog({ close }: ModalComponentProps): JSX.Element {
  const {
    appState: appStateStore,
    catalog: catalogStore,
    rarities: rarityStore,
    userProfiles,
    pullHistory
  } = useDomainStores();
  const appState = useStoreValue(appStateStore);
  const catalogState = useStoreValue(catalogStore);
  const rarityState = useStoreValue(rarityStore);

  const { options: gachaOptions, map: gachaMap } = useMemo(
    () => buildGachaDefinitions(appState, catalogState, rarityState),
    [appState, catalogState, rarityState]
  );

  const [selectedGachaId, setSelectedGachaId] = useState<string | undefined>(() => gachaOptions[0]?.value);
  const [pullCount, setPullCount] = useState('10');
  const [userName, setUserName] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const [lastPullId, setLastPullId] = useState<string | null>(null);
  const [resultItems, setResultItems] = useState<DrawGachaDialogResultItem[] | null>(null);
  const [lastExecutedAt, setLastExecutedAt] = useState<string | undefined>(undefined);
  const [lastGachaLabel, setLastGachaLabel] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!gachaOptions.length) {
      setSelectedGachaId(undefined);
      return;
    }
    if (!selectedGachaId || !gachaMap.has(selectedGachaId)) {
      setSelectedGachaId(gachaOptions[0]?.value);
    }
  }, [gachaOptions, gachaMap, selectedGachaId]);

  const selectedGacha = selectedGachaId ? gachaMap.get(selectedGachaId) : undefined;

  const handleExecute = async () => {
    if (isExecuting) {
      return;
    }
    setIsExecuting(true);
    try {
      setErrorMessage(null);
      setLastPullId(null);

      if (!selectedGacha) {
        setErrorMessage('ガチャの種類を選択してください。');
        setResultItems(null);
        return;
      }

      const parsedCount = Number.parseInt(pullCount, 10);
      if (!Number.isFinite(parsedCount) || parsedCount <= 0) {
        setErrorMessage('回数には1以上の整数を入力してください。');
        setResultItems(null);
        return;
      }

      if (parsedCount > 500) {
        setErrorMessage('回数は500以下にしてください。');
        setResultItems(null);
        return;
      }

      if (!selectedGacha.items.length) {
        setErrorMessage('選択したガチャに登録されているアイテムがありません。');
        setResultItems(null);
        return;
      }

      const randomSelections = Array.from({ length: parsedCount }, () => {
        const index = Math.floor(Math.random() * selectedGacha.items.length);
        return selectedGacha.items[index];
      });

      const aggregated = new Map<string, DrawGachaDialogResultItem>();
      randomSelections.forEach((item) => {
        const existing = aggregated.get(item.itemId);
        if (existing) {
          existing.count += 1;
          return;
        }
        aggregated.set(item.itemId, {
          itemId: item.itemId,
          name: item.name,
          rarityId: item.rarityId,
          rarityLabel: item.rarityLabel,
          rarityColor: item.rarityColor,
          count: 1
        });
      });

      const itemsForStore: GachaResultPayload['items'] = Array.from(aggregated.values()).map((item) => ({
        itemId: item.itemId,
        rarityId: item.rarityId,
        count: item.count
      }));

      const executedAt = new Date().toISOString();
      const normalizedUserName = userName.trim();
      const userId = normalizedUserName ? userProfiles.ensureProfile(normalizedUserName) : undefined;

      const payload: GachaResultPayload = {
        gachaId: selectedGacha.id,
        userId,
        executedAt,
        pullCount: parsedCount,
        items: itemsForStore
      };

      const pullId = pullHistory.recordGachaResult(payload);
      if (!pullId) {
        setErrorMessage('ガチャ結果の保存に失敗しました。');
        setResultItems(null);
        return;
      }

      const sortedItems = Array.from(aggregated.values()).sort((a, b) => {
        if (b.count !== a.count) {
          return b.count - a.count;
        }
        return a.name.localeCompare(b.name);
      });

      setResultItems(sortedItems);
      setLastPullId(pullId);
      setLastExecutedAt(executedAt);
      setLastGachaLabel(selectedGacha.label);
    } catch (error) {
      console.error('ガチャ実行中にエラーが発生しました', error);
      setErrorMessage('ガチャの実行中にエラーが発生しました。');
      setResultItems(null);
    } finally {
      setIsExecuting(false);
    }
  };

  const executedAtLabel = formatExecutedAt(lastExecutedAt);
  const totalCount = resultItems?.reduce((total, item) => total + item.count, 0) ?? 0;

  return (
    <>
      <ModalBody className="space-y-6">
        <div className="space-y-4">
          <div className="space-y-2">
            <label className="block text-sm font-semibold text-muted-foreground">ガチャの種類</label>
            <SingleSelectDropdown
              value={selectedGachaId}
              options={gachaOptions}
              onChange={setSelectedGachaId}
              placeholder="ガチャを選択"
              fallbackToFirstOption={false}
            />
          </div>
          {gachaOptions.length === 0 ? (
            <p className="text-sm leading-relaxed text-muted-foreground">
              ガチャがまだ登録されていません。先にガチャを登録してから実行してください。
            </p>
          ) : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-2">
              <span className="block text-sm font-semibold text-muted-foreground">回数</span>
              <input
                type="number"
                min={1}
                max={500}
                value={pullCount}
                onChange={(event) => setPullCount(event.currentTarget.value)}
                className="w-full rounded-xl border border-border/60 bg-surface-alt px-3 py-2 text-sm text-surface-foreground focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/40"
                placeholder="10"
              />
            </label>
            <label className="space-y-2">
              <span className="block text-sm font-semibold text-muted-foreground">名前</span>
              <input
                type="text"
                value={userName}
                onChange={(event) => setUserName(event.currentTarget.value)}
                className="w-full rounded-xl border border-border/60 bg-surface-alt px-3 py-2 text-sm text-surface-foreground focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/40"
                placeholder="ユーザー名（任意）"
              />
            </label>
          </div>
        </div>
        {errorMessage ? (
          <div className="rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-600">
            {errorMessage}
          </div>
        ) : null}
        {resultItems ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>
                {lastGachaLabel ? `「${lastGachaLabel}」` : '選択したガチャ'} の結果
              </span>
              <span className="font-mono text-xs">合計 {totalCount} 個</span>
            </div>
            <div className="space-y-2 rounded-2xl border border-border/60 bg-surface-alt p-4">
              {resultItems.map((item) => (
                <div key={item.itemId} className="flex items-center gap-3 text-sm text-surface-foreground">
                  <span
                    className="inline-flex min-w-[3rem] items-center justify-center rounded-full px-2 py-0.5 text-xs font-semibold"
                    style={item.rarityColor ? { backgroundColor: `${item.rarityColor}1a`, color: item.rarityColor } : undefined}
                  >
                    {item.rarityLabel}
                  </span>
                  <span className="flex-1 font-medium">{item.name}</span>
                  <span className="font-mono">×{item.count}</span>
                </div>
              ))}
            </div>
            <div className="text-xs text-muted-foreground">
              {executedAtLabel ? `実行日時: ${executedAtLabel}` : null}
              {lastPullId ? `（履歴ID: ${lastPullId}）` : null}
            </div>
          </div>
        ) : null}
        {!resultItems && !errorMessage ? (
          <p className="text-sm leading-relaxed text-muted-foreground">
            ガチャを実行すると、このモーダル内に結果が表示され、インベントリ履歴にも保存されます。
          </p>
        ) : null}
      </ModalBody>
      <ModalFooter>
        <button type="button" className="btn btn-muted" onClick={close}>
          閉じる
        </button>
        <button
          type="button"
          className="btn btn-primary"
          onClick={handleExecute}
          disabled={isExecuting || !gachaOptions.length}
        >
          <SparklesIcon className="h-5 w-5" />
          ガチャを実行
        </button>
      </ModalFooter>
    </>
  );
}
