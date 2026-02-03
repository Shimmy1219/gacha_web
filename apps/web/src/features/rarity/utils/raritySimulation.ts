export interface RaritySimulationInput {
  id: string;
  label: string;
  color: string;
  emitRate?: number;
}

export interface SimulatedRarityProbability extends RaritySimulationInput {
  emitRate: number;
  atLeastOneRate: number;
  exactCountRate: number;
}

interface SimulateRarityProbabilitiesParams {
  rarities: ReadonlyArray<RaritySimulationInput>;
  drawCount: number;
  targetCount: number;
}

function clampUnitRate(rate: number): number {
  if (!Number.isFinite(rate) || Number.isNaN(rate)) {
    return 0;
  }
  return Math.min(Math.max(rate, 0), 1);
}

function clampProbability(value: number): number {
  if (!Number.isFinite(value) || Number.isNaN(value)) {
    return 0;
  }
  return Math.min(Math.max(value, 0), 1);
}

function calculateAtLeastOneRate(rate: number, drawCount: number): number {
  if (drawCount <= 0 || rate <= 0) {
    return 0;
  }
  if (rate >= 1) {
    return 1;
  }
  return clampProbability(-Math.expm1(drawCount * Math.log1p(-rate)));
}

function calculateExactCountRate(rate: number, drawCount: number, targetCount: number): number {
  if (targetCount < 0 || targetCount > drawCount) {
    return 0;
  }
  if (drawCount === 0) {
    return targetCount === 0 ? 1 : 0;
  }
  if (rate <= 0) {
    return targetCount === 0 ? 1 : 0;
  }
  if (rate >= 1) {
    return targetCount === drawCount ? 1 : 0;
  }

  const failureRate = 1 - rate;
  let probability = Math.exp(drawCount * Math.log1p(-rate));

  for (let count = 1; count <= targetCount; count += 1) {
    const multiplier = ((drawCount - count + 1) / count) * (rate / failureRate);
    probability *= multiplier;
  }

  return clampProbability(probability);
}

export function simulateRarityProbabilities({
  rarities,
  drawCount,
  targetCount
}: SimulateRarityProbabilitiesParams): SimulatedRarityProbability[] {
  const normalizedDrawCount = Math.max(0, Math.floor(drawCount));
  const normalizedTargetCount = Math.max(0, Math.floor(targetCount));

  return rarities.map((rarity) => {
    const normalizedRate = clampUnitRate(rarity.emitRate ?? 0);
    return {
      ...rarity,
      emitRate: normalizedRate,
      atLeastOneRate: calculateAtLeastOneRate(normalizedRate, normalizedDrawCount),
      exactCountRate: calculateExactCountRate(normalizedRate, normalizedDrawCount, normalizedTargetCount)
    };
  });
}
