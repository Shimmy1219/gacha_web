import { calculateDrawPlan } from './pointCalculator';
import type {
  DrawPlan,
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

function buildWeights(pool: GachaPoolDefinition): { items: GachaItemDefinition[]; weights: number[]; total: number } {
  const items = pool.items;
  const weights = items.map((item) => {
    if (item.itemRate != null && Number.isFinite(item.itemRate) && item.itemRate > 0) {
      return item.itemRate;
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

function pickRandomItem(
  data: ReturnType<typeof buildWeights>,
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
  rng: () => number
): ExecuteGachaDrawInstance[] {
  if (count <= 0) {
    return [];
  }

  const weights = buildWeights(pool);
  const draws: ExecuteGachaDrawInstance[] = [];

  for (let index = 0; index < count; index += 1) {
    const item = pickRandomItem(weights, rng);
    if (!item) {
      break;
    }
    draws.push({ itemId: item.itemId, rarityId: item.rarityId, wasGuaranteed: false });
  }

  return draws;
}

function buildGuaranteedDraws(
  plan: DrawPlan,
  pool: GachaPoolDefinition,
  guarantees: NormalizedGuaranteeSetting[],
  itemMap: Map<string, GachaItemDefinition>,
  rng: () => number
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
    if (!group || group.items.length === 0) {
      warnings.push(`保証設定「${guarantee.id ?? guarantee.rarityId}」に対応するアイテムが存在しません。`);
      return;
    }

    const allocation = Math.min(Math.max(0, Math.floor(guarantee.quantity)), remainingRandomPulls);
    if (allocation <= 0) {
      return;
    }

    if (allocation < guarantee.quantity) {
      warnings.push(`保証設定「${guarantee.id ?? guarantee.rarityId}」に割り当て可能な抽選回数が不足しています。`);
    }

    const selectRandomFromGroup = (): GachaItemDefinition => {
      const roll = Math.max(0, Math.min(0.9999999999, rng()));
      const index = Math.min(group.items.length - 1, Math.floor(roll * group.items.length));
      return group.items[index];
    };

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
        } else {
          selected = candidate;
        }
      }

      if (!selected) {
        selected = selectRandomFromGroup();
      }

      draws.push({ itemId: selected.itemId, rarityId: selected.rarityId, wasGuaranteed: true });
    }

    remainingRandomPulls -= allocation;
  });

  return { draws, warnings, remainingRandomPulls };
}

export function executeGacha({
  gachaId: _gachaId,
  pool,
  settings,
  points,
  rng = Math.random
}: ExecuteGachaArgs): ExecuteGachaResult {
  const plan = calculateDrawPlan({
    points,
    settings,
    totalItemTypes: pool.items.length
  });

  const warnings = [...plan.warnings];
  const errors = [...plan.errors];

  if (errors.length > 0 || plan.totalPulls <= 0) {
    return {
      plan,
      items: [],
      pointsSpent: 0,
      pointsRemainder: plan.pointsRemainder,
      totalPulls: 0,
      completeExecutions: 0,
      warnings,
      errors
    };
  }

  const itemMap = buildItemMap(pool);
  const draws: ExecuteGachaDrawInstance[] = [];

  if (plan.completeExecutions > 0) {
    const completeMode = plan.normalizedSettings.complete?.mode ?? 'repeat';
    const guaranteedExecutions =
      completeMode === 'frontload' ? Math.min(1, plan.completeExecutions) : plan.completeExecutions;
    for (let execution = 0; execution < guaranteedExecutions; execution += 1) {
      pool.items.forEach((item) => {
        draws.push({ itemId: item.itemId, rarityId: item.rarityId, wasGuaranteed: false });
      });
    }
  }

  const {
    draws: guaranteeDraws,
    warnings: guaranteeWarnings,
    remainingRandomPulls
  } = buildGuaranteedDraws(plan, pool, plan.normalizedSettings.guarantees, itemMap, rng);

  if (guaranteeDraws.length > 0) {
    draws.push(...guaranteeDraws);
  }
  if (guaranteeWarnings.length > 0) {
    warnings.push(...guaranteeWarnings);
  }

  if (remainingRandomPulls > 0) {
    const randomDraws = performRandomDraws(pool, remainingRandomPulls, rng);
    draws.push(...randomDraws);
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

  return {
    plan,
    items,
    pointsSpent: plan.pointsUsed,
    pointsRemainder: plan.pointsRemainder,
    totalPulls: plan.totalPulls,
    completeExecutions: plan.completeExecutions,
    warnings,
    errors
  };
}
