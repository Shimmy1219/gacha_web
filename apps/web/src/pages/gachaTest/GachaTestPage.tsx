import { useCallback, useMemo, useState } from 'react';
import { ChevronDownIcon } from '@heroicons/react/24/outline';
import { SingleSelectDropdown, type SingleSelectOption } from '../gacha/components/select/SingleSelectDropdown';
import { useDomainStores } from '../../features/storage/AppPersistenceProvider';
import { useStoreValue } from '@domain/stores';
import type { PtSettingV3 } from '@domain/app-persistence';
import {
  buildGachaPools,
  calculateDrawPlan,
  executeGacha,
  formatItemRateWithPrecision,
  inferRarityFractionDigits,
  normalizePtSetting,
  type DrawPlan,
  type GachaItemDefinition,
  type GachaPoolDefinition
} from '../../logic/gacha';

interface GachaDefinition {
  id: string;
  label: string;
  pool: GachaPoolDefinition;
  items: GachaItemDefinition[];
}

interface GachaDefinitionsResult {
  options: Array<SingleSelectOption<string>>;
  map: Map<string, GachaDefinition>;
  rarityDigits: Map<string, number>;
}

function useGachaDefinitions(): GachaDefinitionsResult {
  const { appState: appStateStore, catalog: catalogStore, rarities: rarityStore } = useDomainStores();
  const appState = useStoreValue(appStateStore);
  const catalogState = useStoreValue(catalogStore);
  const rarityState = useStoreValue(rarityStore);

  return useMemo(() => {
    const options: Array<SingleSelectOption<string>> = [];
    const map = new Map<string, GachaDefinition>();
    const rarityDigits = inferRarityFractionDigits(rarityState);

    if (!catalogState?.byGacha) {
      return { options, map, rarityDigits };
    }

    const { poolsByGachaId } = buildGachaPools({
      catalogState,
      rarityState,
      rarityFractionDigits: rarityDigits
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
        items: pool.items.map((item) => ({ ...item }))
      };

      knownGacha.add(gachaId);
      map.set(gachaId, definition);
      options.push({ value: gachaId, label: definition.label });
    };

    orderFromAppState.forEach(appendGacha);
    Object.keys(catalogByGacha).forEach(appendGacha);

    return { options, map, rarityDigits };
  }, [appState, catalogState, rarityState]);
}

interface SimulationItemResult {
  itemId: string;
  name: string;
  rarityId: string;
  rarityLabel: string;
  rarityColor?: string;
  pickupTarget: boolean;
  configuredRate?: number;
  configuredRateDisplay?: string;
  count: number;
  guaranteedCount: number;
  observedRate: number;
  observedRateDisplay: string;
  runSuccessCount: number;
  acquisitionRate: number;
  acquisitionRateDisplay: string;
}

interface SimulationRarityResult {
  rarityId: string;
  label: string;
  color?: string;
  configuredRate?: number;
  observedRate: number;
  observedRateDisplay: string;
  count: number;
  runSuccessCount: number;
  acquisitionRate: number;
  acquisitionRateDisplay: string;
}

interface SimulationResult {
  totalRuns: number;
  desiredPulls: number;
  plan: DrawPlan;
  planPoints: number;
  totalPointsSpent: number;
  totalPulls: number;
  items: SimulationItemResult[];
  rarities: SimulationRarityResult[];
  warnings: string[];
}

interface SimulationError {
  error: string;
  warnings: string[];
}

interface SimulationRequest {
  gacha: GachaDefinition;
  ptSetting: PtSettingV3 | undefined;
  pullsPerRun: number;
  runCount: number;
  rarityDigits: Map<string, number>;
}

function formatObservedRate(rate: number, rarityDigits: Map<string, number>, rarityId: string): string {
  const formatted = formatItemRateWithPrecision(rate, rarityDigits.get(rarityId));
  if (formatted) {
    return `${formatted}%`;
  }
  return `${(rate * 100).toFixed(2)}%`;
}

function resolvePlanForPulls({
  pulls,
  gacha,
  ptSetting
}: {
  pulls: number;
  gacha: GachaDefinition;
  ptSetting: PtSettingV3 | undefined;
}): { plan: DrawPlan; points: number } | SimulationError {
  const { normalized } = normalizePtSetting(ptSetting);
  const priceCandidates: number[] = [];
  const unitPriceCandidates: number[] = [];

  if (normalized.perPull) {
    priceCandidates.push(normalized.perPull.price);
    unitPriceCandidates.push(normalized.perPull.price / normalized.perPull.pulls);
  }
  normalized.bundles.forEach((bundle) => {
    priceCandidates.push(bundle.price);
    unitPriceCandidates.push(bundle.price / bundle.pulls);
  });
  if (normalized.complete) {
    priceCandidates.push(normalized.complete.price);
    if (gacha.pool.items.length > 0) {
      unitPriceCandidates.push(normalized.complete.price / gacha.pool.items.length);
    }
  }

  const minStep = priceCandidates.length > 0 ? Math.min(...priceCandidates) : 1;
  const unitPrice = unitPriceCandidates.length > 0 ? Math.min(...unitPriceCandidates) : 1;

  let points = Math.max(minStep, Math.ceil(pulls * unitPrice));
  let plan = calculateDrawPlan({ points, settings: ptSetting, totalItemTypes: gacha.pool.items.length });

  let safety = 0;
  while (plan.totalPulls < pulls && safety < 1000) {
    points += minStep;
    plan = calculateDrawPlan({ points, settings: ptSetting, totalItemTypes: gacha.pool.items.length });
    safety += 1;
  }

  if (plan.errors.length > 0 || plan.totalPulls <= 0) {
    const message = plan.errors[0] ?? 'ポイント設定を確認してください。';
    return { error: message, warnings: plan.warnings };
  }

  return { plan, points };
}

function simulateGacha({
  gacha,
  ptSetting,
  pullsPerRun,
  runCount,
  rarityDigits
}: SimulationRequest): SimulationResult | SimulationError {
  const normalizedPulls = Math.max(1, Math.floor(pullsPerRun));
  const normalizedRuns = Math.max(1, Math.floor(runCount));
  const planResolution = resolvePlanForPulls({ pulls: normalizedPulls, gacha, ptSetting });

  if ('error' in planResolution) {
    return planResolution;
  }

  const { plan, points } = planResolution;
  const warnings = new Set(plan.warnings);

  const itemMap = new Map<string, SimulationItemResult>();
  const itemRunSuccessCounts = new Map<string, number>();
  gacha.items.forEach((item) => {
    itemMap.set(item.itemId, {
      itemId: item.itemId,
      name: item.name,
      rarityId: item.rarityId,
      rarityLabel: item.rarityLabel,
      rarityColor: item.rarityColor,
      pickupTarget: item.pickupTarget,
      configuredRate: item.itemRate,
      configuredRateDisplay: item.itemRateDisplay,
      count: 0,
      guaranteedCount: 0,
      observedRate: 0,
      observedRateDisplay: '0%',
      runSuccessCount: 0,
      acquisitionRate: 0,
      acquisitionRateDisplay: '0%'
    });
    itemRunSuccessCounts.set(item.itemId, 0);
  });

  const rarityMap = new Map<string, SimulationRarityResult>();
  const rarityRunSuccessCounts = new Map<string, number>();
  gacha.pool.rarityGroups.forEach((group) => {
    rarityMap.set(group.rarityId, {
      rarityId: group.rarityId,
      label: group.label,
      color: group.color,
      configuredRate: group.emitRate,
      observedRate: 0,
      observedRateDisplay: '0%',
      count: 0,
      runSuccessCount: 0,
      acquisitionRate: 0,
      acquisitionRateDisplay: '0%'
    });
    rarityRunSuccessCounts.set(group.rarityId, 0);
  });

  let totalPointsSpent = 0;
  let totalPulls = 0;

  for (let index = 0; index < normalizedRuns; index += 1) {
    const result = executeGacha({
      gachaId: gacha.id,
      pool: gacha.pool,
      settings: ptSetting,
      points
    });

    if (result.errors.length > 0) {
      const message = result.errors[0] ?? 'ガチャの実行に失敗しました。';
      result.warnings.forEach((warning) => warnings.add(warning));
      return { error: message, warnings: Array.from(warnings) };
    }

    result.warnings.forEach((warning) => warnings.add(warning));
    totalPointsSpent += result.pointsSpent;
    totalPulls += result.totalPulls;

    const successfulItems = new Set<string>();
    const successfulRarities = new Set<string>();
    result.items.forEach((item) => {
      const entry = itemMap.get(item.itemId);
      if (!entry) {
        return;
      }
      entry.count += item.count;
      entry.guaranteedCount += item.guaranteedCount;
      if (item.count > 0) {
        successfulItems.add(item.itemId);
        successfulRarities.add(entry.rarityId);
      }
    });

    successfulItems.forEach((itemId) => {
      const previous = itemRunSuccessCounts.get(itemId) ?? 0;
      itemRunSuccessCounts.set(itemId, previous + 1);
    });

    successfulRarities.forEach((rarityId) => {
      const previous = rarityRunSuccessCounts.get(rarityId) ?? 0;
      rarityRunSuccessCounts.set(rarityId, previous + 1);
    });
  }

  if (totalPulls <= 0) {
    return { error: 'ガチャ結果が生成されませんでした。', warnings: Array.from(warnings) };
  }

  const items = Array.from(itemMap.values()).map((entry) => {
    const observedRate = entry.count / totalPulls;
    const runSuccessCount = itemRunSuccessCounts.get(entry.itemId) ?? 0;
    const acquisitionRate = normalizedRuns > 0 ? runSuccessCount / normalizedRuns : 0;
    return {
      ...entry,
      observedRate,
      observedRateDisplay: formatObservedRate(observedRate, rarityDigits, entry.rarityId),
      runSuccessCount,
      acquisitionRate,
      acquisitionRateDisplay: formatObservedRate(acquisitionRate, rarityDigits, entry.rarityId)
    };
  });

  items.sort((a, b) => {
    if (b.count !== a.count) {
      return b.count - a.count;
    }
    return a.name.localeCompare(b.name, 'ja');
  });

  rarityMap.forEach((rarity) => {
    const totalForRarity = items
      .filter((item) => item.rarityId === rarity.rarityId)
      .reduce((sum, item) => sum + item.count, 0);
    const rate = totalForRarity / totalPulls;
    rarity.count = totalForRarity;
    rarity.observedRate = rate;
    rarity.observedRateDisplay = formatObservedRate(rate, rarityDigits, rarity.rarityId);
    const runSuccessCount = rarityRunSuccessCounts.get(rarity.rarityId) ?? 0;
    const acquisitionRate = normalizedRuns > 0 ? runSuccessCount / normalizedRuns : 0;
    rarity.runSuccessCount = runSuccessCount;
    rarity.acquisitionRate = acquisitionRate;
    rarity.acquisitionRateDisplay = formatObservedRate(acquisitionRate, rarityDigits, rarity.rarityId);
  });

  const rarities = Array.from(rarityMap.values()).sort((a, b) => b.count - a.count);

  return {
    totalRuns: normalizedRuns,
    desiredPulls: normalizedPulls,
    plan,
    planPoints: points,
    totalPointsSpent,
    totalPulls,
    items,
    rarities,
    warnings: Array.from(warnings)
  };
}

interface GachaTestSectionProps {
  title: string;
  defaultPulls: number;
  defaultRuns: number;
  gacha: GachaDefinition | undefined;
  ptSetting: PtSettingV3 | undefined;
  rarityDigits: Map<string, number>;
}

function GachaTestSection({
  title,
  defaultPulls,
  defaultRuns,
  gacha,
  ptSetting,
  rarityDigits
}: GachaTestSectionProps): JSX.Element {
  const [pullsPerRun, setPullsPerRun] = useState(defaultPulls);
  const [runCount, setRunCount] = useState(defaultRuns);
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [isExpanded, setIsExpanded] = useState(true);

  const handleSimulate = useCallback(() => {
    if (!gacha) {
      setError('ガチャが選択されていません。');
      setResult(null);
      setWarnings([]);
      return;
    }

    setIsRunning(true);
    setError(null);
    setResult(null);
    setWarnings([]);

    try {
      const simulation = simulateGacha({
        gacha,
        ptSetting,
        pullsPerRun,
        runCount,
        rarityDigits
      });

      if ('error' in simulation) {
        setError(simulation.error);
        setWarnings(simulation.warnings);
        setResult(null);
      } else {
        setResult(simulation);
        setWarnings(simulation.warnings);
      }
    } catch (caught) {
      console.error('Failed to simulate gacha test', caught);
      setError('シミュレーションの実行中にエラーが発生しました。');
      setResult(null);
      setWarnings([]);
    } finally {
      setIsRunning(false);
    }
  }, [gacha, ptSetting, pullsPerRun, runCount, rarityDigits]);

  const toggleExpanded = useCallback(() => {
    setIsExpanded((previous) => !previous);
  }, []);

  return (
    <section className="rounded-2xl border border-border/60 bg-panel/85 p-6 shadow-lg shadow-black/10 backdrop-blur">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="flex flex-1 items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold text-surface-foreground">{title}</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                指定した回数でガチャをシミュレーションし、実際の排出率や1試行あたりの獲得率を確認できます。
              </p>
            </div>
            <button
              type="button"
              onClick={toggleExpanded}
              className="flex h-10 w-10 items-center justify-center rounded-full border border-border/60 bg-panel-muted/70 text-muted-foreground transition hover:text-surface-foreground"
              aria-expanded={isExpanded}
              aria-label={isExpanded ? `${title}を閉じる` : `${title}を開く`}
            >
              <ChevronDownIcon className={`h-5 w-5 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
            </button>
          </div>
          {isExpanded ? (
            <div className="flex flex-wrap gap-3">
              <label className="flex flex-col text-sm text-muted-foreground">
                1回あたりのガチャ回数
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={pullsPerRun}
                  onChange={(event) => {
                    const next = Number(event.target.value);
                    setPullsPerRun(Number.isFinite(next) ? Math.max(1, Math.floor(next)) : 1);
                  }}
                  className="mt-1 w-32 rounded border border-border/60 bg-panel-muted/70 px-3 py-2 text-right text-base text-surface-foreground focus:border-accent focus:outline-none"
                />
              </label>
              <label className="flex flex-col text-sm text-muted-foreground">
                試行回数
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={runCount}
                  onChange={(event) => {
                    const next = Number(event.target.value);
                    setRunCount(Number.isFinite(next) ? Math.max(1, Math.floor(next)) : 1);
                  }}
                  className="mt-1 w-32 rounded border border-border/60 bg-panel-muted/70 px-3 py-2 text-right text-base text-surface-foreground focus:border-accent focus:outline-none"
                />
              </label>
              <button
                type="button"
                onClick={handleSimulate}
                disabled={isRunning || !gacha}
                className="self-end rounded bg-accent px-6 py-2 text-sm font-semibold text-accent-foreground shadow-md transition hover:bg-accent/90 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
              >
                {isRunning ? '計算中...' : 'シミュレーション実行'}
              </button>
            </div>
          ) : null}
        </div>

        {isExpanded && error ? (
          <div className="mt-2 rounded border border-red-500/50 bg-red-500/10 p-4 text-sm text-red-200">
            <p className="font-semibold">{error}</p>
            {warnings.length > 0 ? (
              <ul className="mt-2 list-disc space-y-1 pl-5">
                {warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}

        {isExpanded && result ? (
          <div className="mt-4 space-y-6">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-xl border border-border/60 bg-panel-muted/70 p-4">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">合計試行回数</p>
                <p className="mt-1 text-2xl font-semibold text-surface-foreground">{result.totalRuns.toLocaleString()}</p>
              </div>
              <div className="rounded-xl border border-border/60 bg-panel-muted/70 p-4">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">1回あたりの想定連数</p>
                <p className="mt-1 text-2xl font-semibold text-surface-foreground">{result.desiredPulls.toLocaleString()}連</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  実際の排出数: {result.plan.totalPulls.toLocaleString()}連 / 消費ポイント {result.planPoints.toLocaleString()}pt
                </p>
              </div>
              <div className="rounded-xl border border-border/60 bg-panel-muted/70 p-4">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">総ガチャ回数</p>
                <p className="mt-1 text-2xl font-semibold text-surface-foreground">{result.totalPulls.toLocaleString()}連</p>
              </div>
              <div className="rounded-xl border border-border/60 bg-panel-muted/70 p-4">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">総消費ポイント</p>
                <p className="mt-1 text-2xl font-semibold text-surface-foreground">{result.totalPointsSpent.toLocaleString()}pt</p>
              </div>
            </div>

          {result.warnings.length > 0 ? (
            <div className="rounded border border-yellow-500/60 bg-yellow-500/10 p-4 text-sm text-yellow-100">
              <p className="font-semibold">注意事項</p>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                {result.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            </div>
          ) : null}

          <div>
            <h3 className="text-lg font-semibold text-surface-foreground">レアリティ別集計</h3>
            <div className="mt-3 overflow-x-auto">
              <table className="min-w-full divide-y divide-border/60">
                <thead className="bg-panel-muted/70">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">レアリティ</th>
                    <th className="px-4 py-2 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">排出数</th>
                    <th className="px-4 py-2 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">想定排出率</th>
                    <th className="px-4 py-2 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">実測排出率</th>
                    <th className="px-4 py-2 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">獲得率（1試行あたり）</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {result.rarities.map((rarity) => (
                    <tr key={rarity.rarityId}>
                      <td className="px-4 py-2 text-sm text-surface-foreground">
                        <span className="inline-flex items-center gap-2">
                          <span
                            className="inline-block h-3 w-3 rounded-full"
                            style={{ backgroundColor: rarity.color ?? '#94a3b8' }}
                          />
                          {rarity.label}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-right text-sm text-surface-foreground/90">{rarity.count.toLocaleString()}</td>
                      <td className="px-4 py-2 text-right text-sm text-muted-foreground">
                        {rarity.configuredRate != null
                          ? `${formatItemRateWithPrecision(rarity.configuredRate, rarityDigits.get(rarity.rarityId))}%`
                          : '―'}
                      </td>
                      <td className="px-4 py-2 text-right text-sm text-surface-foreground">{rarity.observedRateDisplay}</td>
                      <td className="px-4 py-2 text-right text-sm text-surface-foreground">
                        <div className="flex flex-col items-end">
                          <span>{rarity.acquisitionRateDisplay}</span>
                          <span className="text-xs text-muted-foreground">
                            {rarity.runSuccessCount.toLocaleString()} / {result.totalRuns.toLocaleString()}試行
                          </span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div>
            <h3 className="text-lg font-semibold text-surface-foreground">アイテム別排出率</h3>
            <div className="mt-3 overflow-x-auto">
              <table className="min-w-full divide-y divide-border/60">
                <thead className="bg-panel-muted/70">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">アイテム</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">レアリティ</th>
                    <th className="px-4 py-2 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">排出数</th>
                    <th className="px-4 py-2 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">保証</th>
                    <th className="px-4 py-2 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">想定排出率</th>
                    <th className="px-4 py-2 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">実測排出率</th>
                    <th className="px-4 py-2 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">獲得率（1試行あたり）</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {result.items.map((item) => (
                    <tr key={item.itemId}>
                      <td className="px-4 py-2 text-sm text-surface-foreground">
                        <div className="flex flex-col">
                          <span>{item.name}</span>
                          {item.pickupTarget ? (
                            <span className="mt-1 inline-flex w-fit items-center rounded border border-amber-400/40 bg-amber-400/15 px-2 py-0.5 text-xs font-semibold text-amber-200">
                              ピックアップ
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-4 py-2 text-sm text-muted-foreground">
                        <span className="inline-flex items-center gap-2">
                          <span
                            className="inline-block h-3 w-3 rounded-full"
                            style={{ backgroundColor: item.rarityColor ?? '#94a3b8' }}
                          />
                          {item.rarityLabel}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-right text-sm text-surface-foreground/90">{item.count.toLocaleString()}</td>
                      <td className="px-4 py-2 text-right text-sm text-surface-foreground/90">{item.guaranteedCount.toLocaleString()}</td>
                      <td className="px-4 py-2 text-right text-sm text-muted-foreground">
                        {item.configuredRateDisplay ??
                          (item.configuredRate != null
                            ? `${formatItemRateWithPrecision(item.configuredRate, rarityDigits.get(item.rarityId))}%`
                            : '―')}
                      </td>
                      <td className="px-4 py-2 text-right text-sm text-surface-foreground">{item.observedRateDisplay}</td>
                      <td className="px-4 py-2 text-right text-sm text-surface-foreground">
                        <div className="flex flex-col items-end">
                          <span>{item.acquisitionRateDisplay}</span>
                          <span className="text-xs text-muted-foreground">
                            {item.runSuccessCount.toLocaleString()} / {result.totalRuns.toLocaleString()}試行
                          </span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}

const DEFAULT_SECTIONS = [
  { id: 'pulls-10', title: '10連', pulls: 10, runs: 1 },
  { id: 'pulls-100', title: '100連', pulls: 100, runs: 1 },
  { id: 'pulls-1000', title: '1000連', pulls: 1000, runs: 1 }
] as const;

export function GachaTestPage(): JSX.Element {
  const { ptControls: ptControlsStore } = useDomainStores();
  const ptSettingsState = useStoreValue(ptControlsStore);
  const { options, map, rarityDigits } = useGachaDefinitions();

  const [selectedGachaId, setSelectedGachaId] = useState<string | undefined>(() => options[0]?.value);
  const selectedGacha = selectedGachaId ? map.get(selectedGachaId) : undefined;
  const selectedPtSetting = selectedGachaId ? ptSettingsState?.byGachaId?.[selectedGachaId] : undefined;

  const handleSelectGacha = useCallback(
    (nextId: string | undefined) => {
      setSelectedGachaId(nextId);
    },
    []
  );

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-8 text-surface-foreground">
      <header className="rounded-2xl border border-border/60 bg-panel/85 p-6 shadow-lg shadow-black/10 backdrop-blur">
        <h1 className="text-2xl font-bold text-surface-foreground">ガチャテスト</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          現在登録されているガチャ設定を使って大量抽選のシミュレーションを行い、排出率のバランスを確認できます。
        </p>
        <div className="mt-4 max-w-md">
          <SingleSelectDropdown
            options={options}
            value={selectedGachaId}
            onChange={handleSelectGacha}
            placeholder="ガチャを選択してください"
            classNames={{ root: 'z-30' }}
          />
        </div>
      </header>

      {selectedGacha ? (
        <div className="flex flex-col gap-8">
          {DEFAULT_SECTIONS.map((section) => (
            <GachaTestSection
              key={section.id}
              title={section.title}
              defaultPulls={section.pulls}
              defaultRuns={section.runs}
              gacha={selectedGacha}
              ptSetting={selectedPtSetting}
              rarityDigits={rarityDigits}
            />
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-border/60 bg-panel/85 p-6 text-center text-sm text-muted-foreground">
          ガチャを選択するとシミュレーション設定が表示されます。
        </div>
      )}
    </div>
  );
}
