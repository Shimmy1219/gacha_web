import { calculateDrawPlan, normalizePtSetting } from './pointCalculator';
import type {
  DrawPlan,
  ExecuteGachaByPullsArgs,
  ExecuteGachaArgs,
  ExecuteGachaDrawInstance,
  ExecuteGachaResult,
  GachaItemDefinition,
  GachaPoolDefinition,
  NormalizedGuaranteeSetting
} from './types';

function buildItemMap(pool: GachaPoolDefinition): Map<string, GachaItemDefinition> {
  const map = new Map<string, GachaItemDefinition>();
  pool.items.forEach((item) => {
    map.set(item.itemId, item);
  });
  return map;
}

function buildWeightedDistribution(
  items: GachaItemDefinition[]
): { items: GachaItemDefinition[]; weights: number[]; total: number } {
  const weights = items.map((item) => {
    if (item.itemRate != null && Number.isFinite(item.itemRate) && item.itemRate > 0) {
      return item.itemRate;
    }
    if (item.drawWeight != null && Number.isFinite(item.drawWeight) && item.drawWeight > 0) {
      return item.drawWeight;
    }
    return 0;
  });

  let total = weights.reduce((sum, weight) => sum + weight, 0);

  if (total <= 0) {
    const uniformWeight = 1 / Math.max(1, items.length);
    for (let index = 0; index < items.length; index += 1) {
      weights[index] = uniformWeight;
    }
    total = weights.reduce((sum, weight) => sum + weight, 0);
  }

  return { items, weights, total };
}

function buildRemainingStockMap(items: GachaItemDefinition[]): Map<string, number> {
  const map = new Map<string, number>();
  items.forEach((item) => {
    const remaining = item.remainingStock;
    if (typeof remaining === 'number' && Number.isFinite(remaining)) {
      map.set(item.itemId, Math.max(0, Math.floor(remaining)));
    }
  });
  return map;
}

function isItemAvailable(item: GachaItemDefinition, remainingStockById: Map<string, number>): boolean {
  const remaining = remainingStockById.get(item.itemId);
  return remaining == null || remaining > 0;
}

function decrementRemainingStock(item: GachaItemDefinition, remainingStockById: Map<string, number>): void {
  const remaining = remainingStockById.get(item.itemId);
  if (remaining == null) {
    return;
  }
  remainingStockById.set(item.itemId, Math.max(0, remaining - 1));
}

function pickRandomItem(
  data: { items: GachaItemDefinition[]; weights: number[]; total: number },
  rng: () => number
): GachaItemDefinition | undefined {
  if (!data.items.length || data.total <= 0) {
    return undefined;
  }

  const roll = Math.max(0, Math.min(0.9999999999, rng())) * data.total;
  let cumulative = 0;

  for (let index = 0; index < data.items.length; index += 1) {
    cumulative += data.weights[index];
    if (roll < cumulative) {
      return data.items[index];
    }
  }

  return data.items[data.items.length - 1];
}

function performRandomDraws(
  pool: GachaPoolDefinition,
  count: number,
  rng: () => number,
  remainingStockById: Map<string, number>
): ExecuteGachaDrawInstance[] {
  if (count <= 0) {
    return [];
  }

  const draws: ExecuteGachaDrawInstance[] = [];

  for (let index = 0; index < count; index += 1) {
    const availableItems = pool.items.filter((item) => isItemAvailable(item, remainingStockById));
    if (availableItems.length === 0) {
      break;
    }
    const weights = buildWeightedDistribution(availableItems);
    const item = pickRandomItem(weights, rng);
    if (!item) {
      break;
    }
    decrementRemainingStock(item, remainingStockById);
    draws.push({ itemId: item.itemId, rarityId: item.rarityId, wasGuaranteed: false });
  }

  return draws;
}

function buildGuaranteedDraws(
  plan: DrawPlan,
  pool: GachaPoolDefinition,
  guarantees: NormalizedGuaranteeSetting[],
  itemMap: Map<string, GachaItemDefinition>,
  rng: () => number,
  remainingStockById: Map<string, number>,
  allowOutOfStockGuaranteeItem: boolean
): { draws: ExecuteGachaDrawInstance[]; warnings: string[]; remainingRandomPulls: number } {
  if (!guarantees.length || plan.totalPulls <= 0) {
    return { draws: [], warnings: [], remainingRandomPulls: plan.randomPulls };
  }

  let remainingRandomPulls = Math.max(0, plan.randomPulls);
  const draws: ExecuteGachaDrawInstance[] = [];
  const warnings: string[] = [];

  guarantees.forEach((guarantee) => {
    if (plan.totalPulls < guarantee.threshold || remainingRandomPulls <= 0) {
      return;
    }

    const group = pool.rarityGroups.get(guarantee.rarityId);

    const allocation = Math.min(Math.max(0, Math.floor(guarantee.quantity)), remainingRandomPulls);
    if (allocation <= 0) {
      return;
    }

    if (allocation < guarantee.quantity) {
      warnings.push(`保証設定「${guarantee.id ?? guarantee.rarityId}」に割り当て可能な抽選回数が不足しています。`);
    }

    const selectRandomFromGroup = (): { selected?: GachaItemDefinition; reason?: 'missing' | 'empty' } => {
      const baseCandidates = group
        ? group.items
        : pool.items.filter((item) => item.rarityId === guarantee.rarityId);
      const inStockCandidates = baseCandidates.filter((item) => isItemAvailable(item, remainingStockById));
      if (inStockCandidates.length > 0) {
        const distribution = buildWeightedDistribution(inStockCandidates);
        return { selected: pickRandomItem(distribution, rng) ?? inStockCandidates[inStockCandidates.length - 1] };
      }

      const hasAnyRarityItems = pool.items.some((item) => item.rarityId === guarantee.rarityId);
      if (!hasAnyRarityItems) {
        return { reason: 'missing' };
      }

      if (!allowOutOfStockGuaranteeItem) {
        return { reason: 'empty' };
      }

      const outOfStockCandidates = pool.items
        .filter((item) => item.rarityId === guarantee.rarityId)
        .filter((item) => !isItemAvailable(item, remainingStockById))
        .filter((item) => typeof item.stockCount === 'number' && Number.isFinite(item.stockCount));

      if (outOfStockCandidates.length === 0) {
        return { reason: 'empty' };
      }

      const distribution = buildWeightedDistribution(outOfStockCandidates);
      return { selected: pickRandomItem(distribution, rng) ?? outOfStockCandidates[outOfStockCandidates.length - 1] };
    };

    let allocated = 0;
    for (let index = 0; index < allocation; index += 1) {
      let selected: GachaItemDefinition | undefined;

      if (guarantee.targetType === 'item' && guarantee.itemId) {
        const candidate = itemMap.get(guarantee.itemId);
        if (!candidate) {
          warnings.push(`保証設定「${guarantee.id ?? guarantee.rarityId}」の対象アイテムが見つかりません。`);
        } else if (candidate.rarityId !== guarantee.rarityId) {
          warnings.push(
            `保証設定「${guarantee.id ?? guarantee.rarityId}」の対象アイテムは指定したレアリティと一致しません。`
          );
        } else if (!isItemAvailable(candidate, remainingStockById)) {
          const canOverrideStock =
            allowOutOfStockGuaranteeItem && typeof candidate.stockCount === 'number' && Number.isFinite(candidate.stockCount);
          if (canOverrideStock) {
            selected = candidate;
          } else {
            warnings.push(`保証設定「${guarantee.id ?? guarantee.rarityId}」の対象アイテムは在庫切れです。`);
          }
        } else {
          selected = candidate;
        }
      }

      if (!selected) {
        const { selected: raritySelected, reason } = selectRandomFromGroup();
        if (!raritySelected) {
          warnings.push(
            reason === 'missing'
              ? `保証設定「${guarantee.id ?? guarantee.rarityId}」に対応するアイテムが存在しません。`
              : `保証設定「${guarantee.id ?? guarantee.rarityId}」に割り当て可能な在庫がありません。`
          );
          break;
        }
        selected = raritySelected;
      }

      decrementRemainingStock(selected, remainingStockById);
      draws.push({ itemId: selected.itemId, rarityId: selected.rarityId, wasGuaranteed: true });
      allocated += 1;
    }

    remainingRandomPulls -= allocated;
  });

  return { draws, warnings, remainingRandomPulls };
}

function executeGachaWithPlan({
  pool,
  plan,
  includeOutOfStockInComplete = false,
  allowOutOfStockGuaranteeItem = false,
  applyLowerThresholdGuarantees = true,
  rng = Math.random
}: {
  pool: GachaPoolDefinition;
  plan: DrawPlan;
  includeOutOfStockInComplete?: boolean;
  allowOutOfStockGuaranteeItem?: boolean;
  applyLowerThresholdGuarantees?: boolean;
  rng?: () => number;
}): ExecuteGachaResult {
  const warnings = [...plan.warnings];
  const errors = [...plan.errors];

  if (errors.length > 0 || plan.totalPulls <= 0) {
    return {
      plan,
      items: [],
      pointsSpent: 0,
      pointsRemainder: plan.pointsRemainder,
      totalPulls: 0,
      completeExecutions: plan.completeExecutions,
      warnings,
      errors
    };
  }

  const itemMap = buildItemMap(pool);
  const remainingStockById = buildRemainingStockMap(pool.items);
  const draws: ExecuteGachaDrawInstance[] = [];

  if (plan.completeExecutions > 0) {
    for (let execution = 0; execution < plan.completeExecutions; execution += 1) {
      pool.items.forEach((item) => {
        if (!includeOutOfStockInComplete && !isItemAvailable(item, remainingStockById)) {
          return;
        }
        decrementRemainingStock(item, remainingStockById);
        draws.push({ itemId: item.itemId, rarityId: item.rarityId, wasGuaranteed: false });
      });
    }
  }

  const guarantees = plan.normalizedSettings.guarantees;
  let guaranteesToApply = guarantees;
  if (!applyLowerThresholdGuarantees) {
    const applicable = guarantees.filter((guarantee) => plan.totalPulls >= guarantee.threshold);
    if (!applicable.length) {
      guaranteesToApply = [];
    } else {
      const maxThreshold = Math.max(...applicable.map((guarantee) => guarantee.threshold));
      guaranteesToApply = guarantees.filter((guarantee) => guarantee.threshold === maxThreshold);
    }
  }

  const {
    draws: guaranteeDraws,
    warnings: guaranteeWarnings,
    remainingRandomPulls
  } = buildGuaranteedDraws(
    plan,
    pool,
    guaranteesToApply,
    itemMap,
    rng,
    remainingStockById,
    allowOutOfStockGuaranteeItem
  );

  if (guaranteeDraws.length > 0) {
    draws.push(...guaranteeDraws);
  }
  if (guaranteeWarnings.length > 0) {
    warnings.push(...guaranteeWarnings);
  }

  if (remainingRandomPulls > 0) {
    const randomDraws = performRandomDraws(pool, remainingRandomPulls, rng, remainingStockById);
    draws.push(...randomDraws);
  }

  if (draws.length < plan.totalPulls) {
    warnings.push('在庫不足のため、一部の抽選が実行できませんでした。');
  }

  const aggregated = new Map<string, ExecuteGachaResult['items'][number]>();

  draws.forEach((entry) => {
    const item = itemMap.get(entry.itemId);
    if (!item) {
      return;
    }
    const existing = aggregated.get(entry.itemId);
    if (existing) {
      existing.count += 1;
      if (entry.wasGuaranteed) {
        existing.guaranteedCount += 1;
      }
    } else {
      aggregated.set(entry.itemId, {
        itemId: item.itemId,
        rarityId: item.rarityId,
        name: item.name,
        rarityLabel: item.rarityLabel,
        rarityColor: item.rarityColor,
        count: 1,
        guaranteedCount: entry.wasGuaranteed ? 1 : 0
      });
    }
  });

  const items = Array.from(aggregated.values()).sort((a, b) => {
    if (b.count !== a.count) {
      return b.count - a.count;
    }
    return a.name.localeCompare(b.name);
  });

  const actualTotalPulls = draws.length;

  return {
    plan,
    items,
    pointsSpent: plan.pointsUsed,
    pointsRemainder: plan.pointsRemainder,
    totalPulls: actualTotalPulls,
    completeExecutions: plan.completeExecutions,
    warnings,
    errors
  };
}

export function executeGacha({
  gachaId: _gachaId,
  pool,
  settings,
  points,
  completeExecutionsOverride,
  includeOutOfStockInComplete = false,
  allowOutOfStockGuaranteeItem = false,
  applyLowerThresholdGuarantees = true,
  rng = Math.random
}: ExecuteGachaArgs): ExecuteGachaResult {
  const plan = calculateDrawPlan({
    points,
    settings,
    totalItemTypes: pool.items.length,
    completeExecutionsOverride
  });

  return executeGachaWithPlan({
    pool,
    plan,
    includeOutOfStockInComplete,
    allowOutOfStockGuaranteeItem,
    applyLowerThresholdGuarantees,
    rng
  });
}

export function executeGachaByPulls({
  gachaId: _gachaId,
  pool,
  settings,
  pulls,
  includeOutOfStockInComplete = false,
  allowOutOfStockGuaranteeItem = false,
  applyLowerThresholdGuarantees = true,
  rng = Math.random
}: ExecuteGachaByPullsArgs): ExecuteGachaResult {
  const { normalized, warnings } = normalizePtSetting(settings);
  const errors: string[] = [];
  const sanitizedPulls = Number.isFinite(pulls) ? Math.floor(pulls) : NaN;

  if (!Number.isFinite(pulls) || Number.isNaN(pulls)) {
    errors.push('連数の入力値が無効です。');
  } else if (sanitizedPulls <= 0) {
    errors.push('1連以上を入力してください。');
  }

  const plan: DrawPlan = {
    completeExecutions: 0,
    completePulls: 0,
    randomPulls: Number.isFinite(sanitizedPulls) ? Math.max(0, sanitizedPulls) : 0,
    totalPulls: Number.isFinite(sanitizedPulls) ? Math.max(0, sanitizedPulls) : 0,
    pointsUsed: 0,
    pointsRemainder: 0,
    bundleApplications: [],
    perPullPurchases: null,
    errors,
    warnings: [...warnings],
    normalizedSettings: normalized
  };

  return executeGachaWithPlan({
    pool,
    plan,
    includeOutOfStockInComplete,
    allowOutOfStockGuaranteeItem,
    applyLowerThresholdGuarantees,
    rng
  });
}
