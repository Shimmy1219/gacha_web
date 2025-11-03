import { SparklesIcon } from '@heroicons/react/24/outline';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { SingleSelectDropdown, type SingleSelectOption } from '../../pages/gacha/components/select/SingleSelectDropdown';
import { ModalBody, ModalFooter, type ModalComponentProps } from '..';
import { useDomainStores } from '../../features/storage/AppPersistenceProvider';
import { useStoreValue } from '@domain/stores';
import type {
  GachaAppStateV3,
  GachaCatalogStateV3,
  GachaRarityStateV3,
  UserProfileCardV3
} from '@domain/app-persistence';
import type { GachaResultPayload } from '@domain/gacha/gachaResult';
import {
  buildGachaPools,
  calculateDrawPlan,
  executeGacha,
  inferRarityFractionDigits,
  type DrawPlan,
  type GachaPoolDefinition
} from '../../logic/gacha';

interface DrawGachaDialogResultItem {
  itemId: string;
  name: string;
  rarityId: string;
  rarityLabel: string;
  rarityColor?: string;
  count: number;
  guaranteedCount?: number;
}

interface GachaDefinition {
  id: string;
  label: string;
  pool: GachaPoolDefinition;
  items: Array<{
    itemId: string;
    name: string;
    rarityId: string;
    rarityLabel: string;
    rarityColor?: string;
  }>;
}

function formatNumber(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value) || !Number.isFinite(value)) {
    return '0';
  }
  const rounded = Math.round(value * 100) / 100;
  return new Intl.NumberFormat('ja-JP').format(rounded);
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

  const rarityFractionDigits = inferRarityFractionDigits(rarityState);
  const { poolsByGachaId } = buildGachaPools({
    catalogState,
    rarityState,
    rarityFractionDigits
  });

  const catalogByGacha = catalogState.byGacha;
  const orderFromAppState = appState?.order ?? Object.keys(catalogByGacha);
  const knownGacha = new Set<string>();

  const appendGacha = (gachaId: string) => {
    if (knownGacha.has(gachaId)) {
      return;
    }
    const pool = poolsByGachaId.get(gachaId);
    if (!pool || !pool.items.length) {
      return;
    }

    const definition: GachaDefinition = {
      id: gachaId,
      label: appState?.meta?.[gachaId]?.displayName ?? gachaId,
      pool,
      items: pool.items.map((item) => ({
        itemId: item.itemId,
        name: item.name,
        rarityId: item.rarityId,
        rarityLabel: item.rarityLabel,
        rarityColor: item.rarityColor
      }))
    };

    knownGacha.add(gachaId);
    map.set(gachaId, definition);
    options.push({ value: gachaId, label: definition.label });
  };

  orderFromAppState.forEach(appendGacha);

  Object.keys(catalogByGacha).forEach((gachaId) => {
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
    ptControls,
    userProfiles,
    pullHistory,
    uiPreferences: uiPreferencesStore
  } = useDomainStores();
  const appState = useStoreValue(appStateStore);
  const catalogState = useStoreValue(catalogStore);
  const rarityState = useStoreValue(rarityStore);
  const ptSettingsState = useStoreValue(ptControls);
  const userProfilesState = useStoreValue(userProfiles);
  const uiPreferencesState = useStoreValue(uiPreferencesStore);

  const { options: gachaOptions, map: gachaMap } = useMemo(
    () => buildGachaDefinitions(appState, catalogState, rarityState),
    [appState, catalogState, rarityState]
  );

  const lastPreferredGachaId = useMemo(
    () => uiPreferencesStore.getLastSelectedDrawGachaId() ?? undefined,
    [uiPreferencesState, uiPreferencesStore]
  );

  const [selectedGachaId, setSelectedGachaId] = useState<string | undefined>(() => {
    if (lastPreferredGachaId && gachaOptions.some((option) => option.value === lastPreferredGachaId)) {
      return lastPreferredGachaId;
    }
    return gachaOptions[0]?.value;
  });
  const applySelectedGacha = useCallback(
    (nextId: string | undefined) => {
      setSelectedGachaId((previous) => (previous === nextId ? previous : nextId));
      uiPreferencesStore.setLastSelectedDrawGachaId(nextId ?? null, { persist: 'debounced' });
    },
    [uiPreferencesStore]
  );
  const handleGachaChange = useCallback(
    (value: string) => {
      applySelectedGacha(value);
    },
    [applySelectedGacha]
  );
  const [pointsInput, setPointsInput] = useState('100');
  const [userName, setUserName] = useState('');
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const [lastPullId, setLastPullId] = useState<string | null>(null);
  const [resultItems, setResultItems] = useState<DrawGachaDialogResultItem[] | null>(null);
  const [lastExecutedAt, setLastExecutedAt] = useState<string | undefined>(undefined);
  const [lastGachaLabel, setLastGachaLabel] = useState<string | undefined>(undefined);
  const [lastPointsSpent, setLastPointsSpent] = useState<number | null>(null);
  const [lastPointsRemainder, setLastPointsRemainder] = useState<number | null>(null);
  const [lastExecutionWarnings, setLastExecutionWarnings] = useState<string[]>([]);
  const [lastPlan, setLastPlan] = useState<DrawPlan | null>(null);

  useEffect(() => {
    if (!gachaOptions.length) {
      if (selectedGachaId !== undefined || lastPreferredGachaId !== undefined) {
        applySelectedGacha(undefined);
      }
      return;
    }

    if (selectedGachaId && gachaMap.has(selectedGachaId)) {
      return;
    }

    if (lastPreferredGachaId && gachaMap.has(lastPreferredGachaId)) {
      if (selectedGachaId !== lastPreferredGachaId) {
        applySelectedGacha(lastPreferredGachaId);
      }
      return;
    }

    const fallbackId = gachaOptions[0]?.value;
    if (fallbackId && selectedGachaId !== fallbackId) {
      applySelectedGacha(fallbackId);
    }
  }, [
    applySelectedGacha,
    gachaMap,
    gachaOptions,
    lastPreferredGachaId,
    selectedGachaId
  ]);

  const selectedGacha = selectedGachaId ? gachaMap.get(selectedGachaId) : undefined;
  const selectedPtSetting = selectedGachaId ? ptSettingsState?.byGachaId?.[selectedGachaId] : undefined;

  useEffect(() => {
    setErrorMessage(null);
    setResultItems(null);
    setLastPullId(null);
    setLastPointsSpent(null);
    setLastPointsRemainder(null);
    setLastExecutionWarnings([]);
    setLastPlan(null);
  }, [selectedGachaId]);

  const parsedPoints = useMemo(() => {
    if (!pointsInput.trim()) {
      return NaN;
    }
    const value = Number(pointsInput);
    return Number.isFinite(value) ? value : NaN;
  }, [pointsInput]);

  const normalizedUserName = userName.trim();

  const userSuggestions = useMemo(() => {
    const users = userProfilesState?.users ?? {};
    const entries: UserProfileCardV3[] = Object.values(users);

    if (!entries.length) {
      return [] as UserProfileCardV3[];
    }

    const query = normalizedUserName.toLowerCase();
    const filtered = query
      ? entries.filter((profile) => profile.displayName.toLowerCase().includes(query))
      : entries;

    const sorted = [...filtered].sort((a, b) => a.displayName.localeCompare(b.displayName, 'ja'));

    return sorted.slice(0, 8);
  }, [normalizedUserName, userProfilesState]);

  const drawPlan = useMemo(() => {
    if (!selectedGacha) {
      return null;
    }

    return calculateDrawPlan({
      points: parsedPoints,
      settings: selectedPtSetting,
      totalItemTypes: selectedGacha.pool.items.length
    });
  }, [parsedPoints, selectedGacha, selectedPtSetting]);

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

      if (!drawPlan || drawPlan.errors.length > 0) {
        setErrorMessage(drawPlan?.errors?.[0] ?? 'ポイント設定を確認してください。');
        setResultItems(null);
        return;
      }

      if (!selectedGacha.items.length) {
        setErrorMessage('選択したガチャに登録されているアイテムがありません。');
        setResultItems(null);
        return;
      }

      const executionResult = executeGacha({
        gachaId: selectedGacha.id,
        pool: selectedGacha.pool,
        settings: selectedPtSetting,
        points: parsedPoints
      });

      if (executionResult.errors.length > 0) {
        setErrorMessage(executionResult.errors[0]);
        setResultItems(null);
        return;
      }

      if (!executionResult.items.length) {
        setErrorMessage('ガチャ結果を生成できませんでした。');
        setResultItems(null);
        return;
      }

      const aggregatedItems: DrawGachaDialogResultItem[] = executionResult.items.map((item) => ({
        itemId: item.itemId,
        name: item.name,
        rarityId: item.rarityId,
        rarityLabel: item.rarityLabel,
        rarityColor: item.rarityColor,
        count: item.count,
        guaranteedCount: item.guaranteedCount > 0 ? item.guaranteedCount : undefined
      }));

      const itemsForStore: GachaResultPayload['items'] = executionResult.items.map((item) => ({
        itemId: item.itemId,
        rarityId: item.rarityId,
        count: item.count
      }));

      const executedAt = new Date().toISOString();
      const userId = normalizedUserName ? userProfiles.ensureProfile(normalizedUserName) : undefined;

      const payload: GachaResultPayload = {
        gachaId: selectedGacha.id,
        userId,
        executedAt,
        pullCount: executionResult.totalPulls,
        currencyUsed: executionResult.pointsSpent,
        items: itemsForStore
      };

      const pullId = pullHistory.recordGachaResult(payload);
      if (!pullId) {
        setErrorMessage('ガチャ結果の保存に失敗しました。');
        setResultItems(null);
        return;
      }

      setResultItems(aggregatedItems);
      setLastPullId(pullId);
      setLastExecutedAt(executedAt);
      setLastGachaLabel(selectedGacha.label);
      setLastPointsSpent(executionResult.pointsSpent);
      setLastPointsRemainder(executionResult.pointsRemainder);
      setLastExecutionWarnings(executionResult.warnings);
      setLastPlan(executionResult.plan);
    } catch (error) {
      console.error('ガチャ実行中にエラーが発生しました', error);
      setErrorMessage('ガチャの実行中にエラーが発生しました。');
      setResultItems(null);
      setLastPointsSpent(null);
      setLastPointsRemainder(null);
      setLastExecutionWarnings([]);
      setLastPlan(null);
    } finally {
      setIsExecuting(false);
    }
  };

  const executedAtLabel = formatExecutedAt(lastExecutedAt);
  const totalCount = resultItems?.reduce((total, item) => total + item.count, 0) ?? 0;
  const planWarnings = drawPlan?.warnings ?? [];
  const planErrorMessage = drawPlan?.errors?.[0] ?? null;
  const guaranteeSummaries = useMemo(() => {
    if (!drawPlan || !selectedGacha) {
      return [] as Array<{
        rarityId: string;
        threshold: number;
        description: string;
        applies: boolean;
      }>;
    }

    return drawPlan.normalizedSettings.guarantees.map((guarantee) => {
      const rarity = selectedGacha.pool.rarityGroups.get(guarantee.rarityId);
      const label = rarity?.label ?? guarantee.rarityId;
      const description = guarantee.pityStep && guarantee.pityStep !== guarantee.threshold
        ? `${label}: ${guarantee.threshold}連目で保証、以後${guarantee.pityStep}連ごとに保証`
        : `${label}: ${guarantee.threshold}連ごとに保証`;
      const applies = drawPlan.randomPulls >= guarantee.threshold;
      return {
        rarityId: guarantee.rarityId,
        threshold: guarantee.threshold,
        description,
        applies
      };
    });
  }, [drawPlan, selectedGacha]);

  return (
    <>
      <ModalBody className="space-y-6">
        <div className="space-y-4">
          <div className="space-y-2">
            <label className="block text-sm font-semibold text-muted-foreground">ガチャの種類</label>
            <SingleSelectDropdown
              value={selectedGachaId}
              options={gachaOptions}
              onChange={handleGachaChange}
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
              <span className="block text-sm font-semibold text-muted-foreground">ポイント</span>
              <input
                type="number"
                min={0}
                step={1}
                value={pointsInput}
                onChange={(event) => setPointsInput(event.currentTarget.value)}
                className="w-full rounded-xl border border-border/60 bg-surface-alt px-3 py-2 text-sm text-surface-foreground focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/40"
                placeholder="100"
              />
            </label>
            <div className="space-y-2">
              <label className="space-y-2">
                <span className="block text-sm font-semibold text-muted-foreground">名前</span>
                <input
                  type="text"
                  value={userName}
                  onChange={(event) => {
                    setUserName(event.currentTarget.value);
                    setSelectedUserId(null);
                  }}
                  className="w-full rounded-xl border border-border/60 bg-surface-alt px-3 py-2 text-sm text-surface-foreground focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/40"
                  placeholder="ユーザー名（任意）"
                />
              </label>
              {normalizedUserName && userSuggestions.length > 0 ? (
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-muted-foreground">候補</p>
                  <div className="flex flex-wrap gap-2">
                    {userSuggestions.map((profile) => {
                      const isSelected = selectedUserId === profile.id;
                      return (
                        <button
                          key={profile.id}
                          type="button"
                          onClick={() => {
                            setUserName(profile.displayName);
                            setSelectedUserId(profile.id);
                          }}
                          className={`inline-flex items-center rounded-full border px-3 py-1 text-xs transition-colors focus:outline-none focus:ring-1 focus:ring-accent/40 ${
                            isSelected
                              ? 'border-accent bg-accent/10 text-accent'
                              : 'border-border/60 text-muted-foreground hover:border-accent hover:text-accent'
                          }`}
                        >
                          {profile.displayName}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}
              {normalizedUserName && userSuggestions.length === 0 ? (
                <p className="text-xs text-muted-foreground">一致する候補はありません。</p>
              ) : null}
            </div>
          </div>
          {selectedGacha && drawPlan ? (
            <div className="space-y-2 rounded-xl border border-border/60 bg-surface-alt p-3 text-xs text-muted-foreground">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  消費:
                  <span className="ml-1 font-mono text-surface-foreground">
                    {formatNumber(drawPlan.pointsUsed)} pt
                  </span>
                </span>
                <span>
                  残り:
                  <span className="ml-1 font-mono text-surface-foreground">
                    {formatNumber(drawPlan.pointsRemainder)} pt
                  </span>
                </span>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  連数:
                  <span className="ml-1 font-mono text-surface-foreground">
                    {formatNumber(drawPlan.totalPulls)} 連
                  </span>
                </span>
              </div>
              {drawPlan.completeExecutions > 0 ? (
                <div>
                  コンプリート排出:
                  <span className="ml-1 font-mono text-surface-foreground">
                    {formatNumber(drawPlan.completeExecutions)} 回
                  </span>
                </div>
              ) : null}
              {guaranteeSummaries.length ? (
                <div className="space-y-1">
                  <span>保証設定:</span>
                  <ul className="space-y-1 text-[11px] text-surface-foreground/80">
                    {guaranteeSummaries.map((summary, index) => (
                      <li
                        key={`${summary.rarityId}-${summary.threshold}-${index}`}
                        className="flex items-start justify-between gap-2 rounded-lg border border-border/40 bg-surface-alt px-2 py-1"
                      >
                        <span className="leading-snug">{summary.description}</span>
                        <span
                          className={`whitespace-nowrap text-xs font-semibold ${
                            summary.applies
                              ? 'text-emerald-600'
                              : 'text-muted-foreground'
                          }`}
                        >
                          {summary.applies ? '適用' : '適用外'}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {planWarnings.length ? (
                <ul className="space-y-1 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2 text-[11px] text-amber-700">
                  {planWarnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
        </div>
        {planErrorMessage ? (
          <div className="rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-600">
            {planErrorMessage}
          </div>
        ) : null}
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
                  <span className="flex items-center gap-2 font-mono">
                    ×{item.count}
                    {item.guaranteedCount ? (
                      <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                        保証 {item.guaranteedCount}
                      </span>
                    ) : null}
                  </span>
                </div>
              ))}
            </div>
            <div className="space-y-1 text-xs text-muted-foreground">
              <div>
                消費ポイント:
                <span className="ml-1 font-mono text-surface-foreground">
                  {formatNumber((lastPointsSpent ?? lastPlan?.pointsUsed) ?? 0)} pt
                </span>
                {lastPointsRemainder != null || lastPlan?.pointsRemainder != null ? (
                  <span className="ml-2">
                    残り:
                    <span className="ml-1 font-mono text-surface-foreground">
                      {formatNumber((lastPointsRemainder ?? lastPlan?.pointsRemainder) ?? 0)} pt
                    </span>
                  </span>
                ) : null}
              </div>
              {lastPlan && lastPlan.completeExecutions > 0 ? (
                <div>
                  抽選内訳:
                  <span className="ml-1 font-mono text-surface-foreground">
                    コンプリート {formatNumber(lastPlan.completeExecutions)} 回
                  </span>
                </div>
              ) : null}
              <div>
                {executedAtLabel ? `実行日時: ${executedAtLabel}` : null}
                {lastPullId ? `（履歴ID: ${lastPullId}）` : null}
              </div>
            </div>
            {lastExecutionWarnings.length ? (
              <ul className="space-y-1 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-700">
                {lastExecutionWarnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            ) : null}
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
          disabled={isExecuting || !gachaOptions.length || Boolean(planErrorMessage)}
        >
          <SparklesIcon className="h-5 w-5" />
          ガチャを実行
        </button>
      </ModalFooter>
    </>
  );
}
