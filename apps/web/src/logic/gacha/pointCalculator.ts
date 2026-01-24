import type { PtSettingV3 } from '@domain/app-persistence';

type LegacyPtSetting = PtSettingV3 & { complate?: PtSettingV3['complete'] };

import type {
  BundleApplication,
  CalculateDrawPlanArgs,
  DrawPlan,
  NormalizePtSettingResult,
  NormalizedBundleSetting,
  NormalizedPtSetting,
  PerPullPurchaseBreakdown
} from './types';

function toPositiveNumber(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed) || Number.isNaN(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
}

function toPositiveInteger(value: unknown): number | null {
  const positive = toPositiveNumber(value);
  if (positive == null) {
    return null;
  }
  return Math.floor(positive);
}

export function normalizePtSetting(setting: PtSettingV3 | undefined): NormalizePtSettingResult {
  const normalized: NormalizedPtSetting = {
    bundles: [],
    guarantees: []
  };
  const warnings: string[] = [];

  if (!setting) {
    return { normalized, warnings };
  }

  if (setting.perPull) {
    const price = toPositiveNumber(setting.perPull.price);
    const pulls = toPositiveNumber(setting.perPull.pulls ?? 1);

    if (!price || !pulls) {
      warnings.push('単発購入の価格または回数が無効なため、設定を無視しました。');
    } else {
      normalized.perPull = {
        price,
        pulls,
        unitPrice: price / pulls
      };
    }
  }

  const completeSetting = (setting as LegacyPtSetting)?.complete ?? (setting as LegacyPtSetting)?.complate;

  if (completeSetting) {
    const price = toPositiveNumber(completeSetting.price);
    if (!price) {
      warnings.push('コンプリート価格が無効なため、設定を無視しました。');
    } else {
      normalized.complete = { price };
    }
  }

  if (Array.isArray(setting.bundles)) {
    setting.bundles.forEach((bundle) => {
      const price = toPositiveNumber(bundle?.price);
      const pulls = toPositiveNumber(bundle?.pulls);
      if (!price || !pulls) {
        warnings.push(`バンドル「${bundle?.id ?? 'unknown'}」の価格または回数が無効なため、除外しました。`);
        return;
      }
      normalized.bundles.push({
        id: bundle.id,
        price,
        pulls,
        efficiency: pulls / price
      });
    });
  }

  if (Array.isArray(setting.guarantees)) {
    setting.guarantees.forEach((guarantee) => {
      const rarityId = typeof guarantee?.rarityId === 'string' ? guarantee.rarityId.trim() : '';
      const threshold = toPositiveInteger(guarantee?.threshold);
      if (!rarityId || threshold == null) {
        warnings.push(`保証設定「${guarantee?.id ?? 'unknown'}」が不完全のため、除外しました。`);
        return;
      }

      const hasQuantityField = guarantee?.quantity != null;
      const quantityValue = toPositiveInteger(guarantee?.quantity);
      const quantity = quantityValue ?? 1;
      if (hasQuantityField && quantityValue == null) {
        warnings.push(`保証設定「${guarantee?.id ?? 'unknown'}」の個数が無効なため、1個として扱います。`);
      }

      const rawTargetType = guarantee?.target?.type;
      const targetType = rawTargetType === 'item' ? 'item' : 'rarity';
      const itemId =
        targetType === 'item' && typeof guarantee?.target?.itemId === 'string'
          ? guarantee.target.itemId.trim()
          : undefined;

      if (targetType === 'item' && (!itemId || itemId.length === 0)) {
        warnings.push(
          `保証設定「${guarantee?.id ?? 'unknown'}」の対象アイテムが未指定のため、除外しました。`
        );
        return;
      }

      normalized.guarantees.push({
        id: guarantee.id,
        rarityId,
        threshold,
        quantity,
        targetType,
        ...(itemId ? { itemId } : {})
      });
    });
  }

  normalized.bundles.sort((a, b) => {
    const efficiencyDiff = b.efficiency - a.efficiency;
    if (Math.abs(efficiencyDiff) > Number.EPSILON) {
      return efficiencyDiff;
    }
    return a.price - b.price;
  });

  normalized.guarantees.sort((a, b) => a.threshold - b.threshold);

  return { normalized, warnings };
}

function applyBundles(
  bundles: NormalizedBundleSetting[],
  points: number,
  baseEfficiency: number | null
): { applications: BundleApplication[]; pointsUsed: number; pullsGained: number; pointsRemaining: number } {
  if (!bundles.length || points <= 0) {
    return { applications: [], pointsUsed: 0, pullsGained: 0, pointsRemaining: points };
  }

  let pointsRemaining = points;
  let totalUsed = 0;
  let totalPulls = 0;
  const applications: BundleApplication[] = [];

  bundles.forEach((bundle) => {
    if (baseEfficiency !== null && bundle.efficiency + Number.EPSILON < baseEfficiency) {
      return;
    }

    const possibleCount = Math.floor(pointsRemaining / bundle.price);
    if (possibleCount <= 0) {
      return;
    }

    const priceUsed = bundle.price * possibleCount;
    const pullsGained = bundle.pulls * possibleCount;

    pointsRemaining -= priceUsed;
    totalUsed += priceUsed;
    totalPulls += pullsGained;

    applications.push({
      bundleId: bundle.id,
      bundlePrice: bundle.price,
      bundlePulls: bundle.pulls,
      times: possibleCount,
      totalPrice: priceUsed,
      totalPulls: pullsGained
    });
  });

  return { applications, pointsUsed: totalUsed, pullsGained: totalPulls, pointsRemaining };
}

function purchasePerPull(
  perPull: NormalizedPtSetting['perPull'],
  points: number
): { purchase: PerPullPurchaseBreakdown | null; pointsUsed: number; pullsGained: number; pointsRemaining: number } {
  if (!perPull || points <= 0) {
    return { purchase: null, pointsUsed: 0, pullsGained: 0, pointsRemaining: points };
  }

  const possibleCount = Math.floor(points / perPull.price);
  if (possibleCount <= 0) {
    return { purchase: null, pointsUsed: 0, pullsGained: 0, pointsRemaining: points };
  }

  const priceUsed = perPull.price * possibleCount;
  const pullsGained = perPull.pulls * possibleCount;
  const pointsRemaining = points - priceUsed;

  return {
    purchase: {
      price: perPull.price,
      pulls: perPull.pulls,
      times: possibleCount,
      totalPrice: priceUsed,
      totalPulls: pullsGained
    },
    pointsUsed: priceUsed,
    pullsGained,
    pointsRemaining
  };
}

function createEmptyPlan(normalized: NormalizedPtSetting, warnings: string[]): DrawPlan {
  return {
    completeExecutions: 0,
    completePulls: 0,
    randomPulls: 0,
    totalPulls: 0,
    pointsUsed: 0,
    pointsRemainder: 0,
    bundleApplications: [],
    perPullPurchases: null,
    errors: [],
    warnings: [...warnings],
    normalizedSettings: normalized
  };
}

export function calculateDrawPlan({
  points,
  settings,
  totalItemTypes,
  completeExecutionsOverride
}: CalculateDrawPlanArgs): DrawPlan {
  const { normalized, warnings: normalizeWarnings } = normalizePtSetting(settings);
  const warnings = [...normalizeWarnings];
  const errors: string[] = [];

  if (!Number.isFinite(points) || Number.isNaN(points)) {
    errors.push('ポイントの入力値が無効です。');
    return {
      ...createEmptyPlan(normalized, warnings),
      errors
    };
  }

  const sanitizedPoints = Math.max(0, points);
  if (sanitizedPoints <= 0) {
    errors.push('1pt以上を入力してください。');
    return {
      ...createEmptyPlan(normalized, warnings),
      errors,
      pointsRemainder: sanitizedPoints
    };
  }

  let pointsRemaining = sanitizedPoints;
  let pointsUsed = 0;
  let completeExecutions = 0;
  let completePulls = 0;
  const baseEfficiency = normalized.perPull
    ? normalized.perPull.pulls / normalized.perPull.price
    : null;

  if (normalized.complete) {
    const maxExecutions = Math.floor(pointsRemaining / normalized.complete.price);
    if (maxExecutions > 0) {
      const normalizedOverride =
        Number.isFinite(completeExecutionsOverride) && completeExecutionsOverride != null
          ? Math.max(0, Math.floor(completeExecutionsOverride))
          : null;
      completeExecutions =
        normalizedOverride != null ? Math.min(maxExecutions, normalizedOverride) : maxExecutions;
      if (totalItemTypes > 0) {
        completePulls = totalItemTypes * completeExecutions;
      } else {
        warnings.push('アイテムが未登録のため、コンプリート購入は結果に反映されません。');
      }
      if (completeExecutions > 0) {
        const usedForComplete = normalized.complete.price * completeExecutions;
        pointsRemaining -= usedForComplete;
        pointsUsed += usedForComplete;
      }
    }
  }

  const { applications, pointsUsed: bundlePoints, pullsGained: bundlePulls, pointsRemaining: afterBundles } =
    applyBundles(normalized.bundles, pointsRemaining, baseEfficiency);
  pointsRemaining = afterBundles;
  pointsUsed += bundlePoints;

  let perPullPurchases: PerPullPurchaseBreakdown | null = null;
  let perPullPoints = 0;
  let perPullPulls = 0;

  const perPullResult = purchasePerPull(normalized.perPull, pointsRemaining);
  if (perPullResult.purchase) {
    perPullPurchases = perPullResult.purchase;
    perPullPoints = perPullResult.pointsUsed;
    perPullPulls = perPullResult.pullsGained;
    pointsRemaining = perPullResult.pointsRemaining;
    pointsUsed += perPullPoints;
  }

  const randomPulls = bundlePulls + perPullPulls;
  const totalPulls = completePulls + randomPulls;

  if (totalPulls <= 0) {
    if (completeExecutions > 0 && totalItemTypes === 0) {
      errors.push('コンプリート価格に到達していますが、アイテムが存在しません。');
    } else if (!normalized.perPull && !applications.length && !completeExecutions) {
      errors.push('購入設定が不足しているため、ポイントを消費できません。');
    } else {
      errors.push('入力ポイントではガチャを実行できません。');
    }
  }

  if (pointsRemaining > 0 && !normalized.perPull && !applications.length) {
    warnings.push('残りポイントがありますが、利用可能な購入設定がありません。');
  }

  return {
    completeExecutions,
    completePulls,
    randomPulls,
    totalPulls,
    pointsUsed,
    pointsRemainder: pointsRemaining,
    bundleApplications: applications,
    perPullPurchases,
    errors,
    warnings,
    normalizedSettings: normalized
  };
}
