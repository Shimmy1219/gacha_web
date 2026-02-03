export type RiaguProfitStatus = 'profit' | 'loss' | 'even' | 'unavailable';

export interface RiaguProfitEvaluation {
  status: RiaguProfitStatus;
  percent: number | null;
  isOutOfStock: boolean;
}

export interface InverseRateWeightedBreakEvenResult {
  breakEvenUnitCost: number | null;
  weightShare: number | null;
}

const MARGIN_PERCENT_SCALE = 1000;
const MARGIN_PERCENT_DIVISOR = 10;

function toFiniteNumber(value: number | null | undefined): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || Number.isNaN(value)) {
    return null;
  }
  return value;
}

function toProfitStatus(percent: number): RiaguProfitStatus {
  if (percent > 0) {
    return 'profit';
  }
  if (percent < 0) {
    return 'loss';
  }
  return 'even';
}

function calculateInverseRateWeight(rate: number, exponent: number): number | null {
  const normalizedRate = toFiniteNumber(rate);
  if (normalizedRate == null || normalizedRate <= 0) {
    return null;
  }
  const normalizedExponent = toFiniteNumber(exponent);
  const safeExponent = normalizedExponent == null || normalizedExponent <= 0 ? 1 : normalizedExponent;
  const weight = 1 / Math.pow(normalizedRate, safeExponent);
  return Number.isFinite(weight) && weight > 0 ? weight : null;
}

export function calculateRevenuePerDraw(perPullPrice: number | null | undefined, shareRate: number | null | undefined): number | null {
  const normalizedPerPullPrice = toFiniteNumber(perPullPrice);
  const normalizedShareRate = toFiniteNumber(shareRate);
  if (normalizedPerPullPrice == null || normalizedPerPullPrice <= 0) {
    return null;
  }
  if (normalizedShareRate == null || normalizedShareRate <= 0) {
    return null;
  }
  const value = normalizedPerPullPrice * normalizedShareRate;
  return Number.isFinite(value) && value > 0 ? value : null;
}

export function calculateExpectedCostPerDraw(params: {
  itemRate: number | null | undefined;
  unitCost: number | null | undefined;
  isOutOfStock?: boolean;
}): number | null {
  if (params.isOutOfStock) {
    return null;
  }
  const normalizedItemRate = toFiniteNumber(params.itemRate);
  const normalizedUnitCost = toFiniteNumber(params.unitCost);
  if (normalizedItemRate == null || normalizedUnitCost == null) {
    return null;
  }
  const value = normalizedItemRate * normalizedUnitCost;
  return Number.isFinite(value) ? value : null;
}

export function calculateProfitAmount(revenueAmount: number | null | undefined, costAmount: number | null | undefined): number | null {
  const normalizedRevenueAmount = toFiniteNumber(revenueAmount);
  const normalizedCostAmount = toFiniteNumber(costAmount);
  if (normalizedRevenueAmount == null || normalizedCostAmount == null) {
    return null;
  }
  const value = normalizedRevenueAmount - normalizedCostAmount;
  return Number.isFinite(value) ? value : null;
}

export function evaluateProfitMargin(params: {
  revenueAmount: number | null | undefined;
  costAmount: number | null | undefined;
  isOutOfStock?: boolean;
}): RiaguProfitEvaluation {
  if (params.isOutOfStock) {
    return { status: 'unavailable', percent: null, isOutOfStock: true };
  }

  const normalizedRevenueAmount = toFiniteNumber(params.revenueAmount);
  const normalizedCostAmount = toFiniteNumber(params.costAmount);
  if (normalizedRevenueAmount == null || normalizedCostAmount == null) {
    return { status: 'unavailable', percent: null, isOutOfStock: false };
  }

  const marginRatio = (normalizedRevenueAmount - normalizedCostAmount) / normalizedRevenueAmount;
  if (!Number.isFinite(marginRatio)) {
    return { status: 'unavailable', percent: null, isOutOfStock: false };
  }

  const rawPercent = Math.round(marginRatio * MARGIN_PERCENT_SCALE) / MARGIN_PERCENT_DIVISOR;
  const percent = Object.is(rawPercent, -0) ? 0 : rawPercent;
  return { status: toProfitStatus(percent), percent, isOutOfStock: false };
}

export function calculateInverseRateWeightedBreakEven(params: {
  revenuePerDraw: number | null | undefined;
  selectedItemRate: number | null | undefined;
  allRiaguItemRates: Array<number | null | undefined>;
  weightExponent?: number;
}): InverseRateWeightedBreakEvenResult {
  const normalizedRevenuePerDraw = toFiniteNumber(params.revenuePerDraw);
  const selectedRate = toFiniteNumber(params.selectedItemRate);
  if (normalizedRevenuePerDraw == null || normalizedRevenuePerDraw <= 0 || selectedRate == null || selectedRate <= 0) {
    return { breakEvenUnitCost: null, weightShare: null };
  }

  const safeRates = params.allRiaguItemRates
    .map((rate) => toFiniteNumber(rate))
    .filter((rate): rate is number => rate != null && rate > 0);
  if (safeRates.length === 0) {
    return { breakEvenUnitCost: null, weightShare: null };
  }

  const safeExponent = toFiniteNumber(params.weightExponent);
  const exponent = safeExponent == null || safeExponent <= 0 ? 1 : safeExponent;

  const selectedWeight = calculateInverseRateWeight(selectedRate, exponent);
  if (selectedWeight == null) {
    return { breakEvenUnitCost: null, weightShare: null };
  }

  const totalWeight = safeRates.reduce((sum, rate) => {
    const weight = calculateInverseRateWeight(rate, exponent);
    if (weight == null) {
      return sum;
    }
    return sum + weight;
  }, 0);
  if (!Number.isFinite(totalWeight) || totalWeight <= 0) {
    return { breakEvenUnitCost: null, weightShare: null };
  }

  const weightShare = selectedWeight / totalWeight;
  if (!Number.isFinite(weightShare) || weightShare <= 0) {
    return { breakEvenUnitCost: null, weightShare: null };
  }

  const allocatedBudget = normalizedRevenuePerDraw * weightShare;
  const breakEvenUnitCost = allocatedBudget / selectedRate;
  if (!Number.isFinite(breakEvenUnitCost)) {
    return { breakEvenUnitCost: null, weightShare: null };
  }

  return { breakEvenUnitCost, weightShare };
}
