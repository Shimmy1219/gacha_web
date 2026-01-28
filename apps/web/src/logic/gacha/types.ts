import type { PtSettingV3 } from '@domain/app-persistence';

export interface GachaItemDefinition {
  itemId: string;
  name: string;
  rarityId: string;
  rarityLabel: string;
  rarityColor?: string;
  rarityEmitRate?: number;
  itemRate?: number;
  itemRateDisplay?: string;
  pickupTarget: boolean;
  drawWeight: number;
  stockCount?: number;
  remainingStock?: number;
}

export interface GachaRarityGroup {
  rarityId: string;
  label: string;
  color?: string;
  emitRate?: number;
  itemCount: number;
  totalWeight: number;
  items: GachaItemDefinition[];
}

export interface GachaPoolDefinition {
  gachaId: string;
  items: GachaItemDefinition[];
  rarityGroups: Map<string, GachaRarityGroup>;
}

export interface RarityRateRedistribution {
  targetRarityId: string;
  sourceRarityIds: string[];
  totalMissingRate: number;
  targetStrategy: 'auto-adjust' | 'next-highest';
}

export interface NormalizedPerPullSetting {
  price: number;
  pulls: number;
  unitPrice: number;
}

export interface NormalizedCompleteSetting {
  price: number;
}

export interface NormalizedBundleSetting {
  id: string;
  price: number;
  pulls: number;
  efficiency: number;
}

export type GuaranteeTargetType = 'rarity' | 'item';

export interface NormalizedGuaranteeSetting {
  id: string;
  rarityId: string;
  threshold: number;
  quantity: number;
  targetType: GuaranteeTargetType;
  itemId?: string;
}

export interface NormalizedPtSetting {
  perPull?: NormalizedPerPullSetting;
  complete?: NormalizedCompleteSetting;
  bundles: NormalizedBundleSetting[];
  guarantees: NormalizedGuaranteeSetting[];
}

export interface NormalizePtSettingResult {
  normalized: NormalizedPtSetting;
  warnings: string[];
}

export interface BundleApplication {
  bundleId: string;
  bundlePrice: number;
  bundlePulls: number;
  times: number;
  totalPrice: number;
  totalPulls: number;
}

export interface PerPullPurchaseBreakdown {
  price: number;
  pulls: number;
  times: number;
  totalPrice: number;
  totalPulls: number;
}

export interface DrawPlan {
  completeExecutions: number;
  completePulls: number;
  randomPulls: number;
  totalPulls: number;
  pointsUsed: number;
  pointsRemainder: number;
  bundleApplications: BundleApplication[];
  perPullPurchases: PerPullPurchaseBreakdown | null;
  errors: string[];
  warnings: string[];
  normalizedSettings: NormalizedPtSetting;
}

export interface CalculateDrawPlanArgs {
  points: number;
  settings: PtSettingV3 | undefined;
  totalItemTypes: number;
  completeExecutionsOverride?: number;
}

export interface ExecuteGachaArgs {
  gachaId: string;
  pool: GachaPoolDefinition;
  settings: PtSettingV3 | undefined;
  points: number;
  completeExecutionsOverride?: number;
  rng?: () => number;
  includeOutOfStockInComplete?: boolean;
  allowOutOfStockGuaranteeItem?: boolean;
  applyLowerThresholdGuarantees?: boolean;
}

export interface ExecutedPullItem {
  itemId: string;
  rarityId: string;
  name: string;
  rarityLabel: string;
  rarityColor?: string;
  count: number;
  guaranteedCount: number;
}

export interface ExecuteGachaResult {
  plan: DrawPlan;
  items: ExecutedPullItem[];
  pointsSpent: number;
  pointsRemainder: number;
  totalPulls: number;
  completeExecutions: number;
  warnings: string[];
  errors: string[];
}

export interface BuildGachaPoolsArgs {
  catalogState: import('@domain/app-persistence').GachaCatalogStateV4 | undefined;
  rarityState: import('@domain/app-persistence').GachaRarityStateV3 | undefined;
  rarityFractionDigits?: Map<string, number>;
  inventoryCountsByItemId?: ItemInventoryCountMap;
  includeOutOfStockItems?: boolean;
}

export interface BuildGachaPoolsResult {
  poolsByGachaId: Map<string, GachaPoolDefinition>;
  itemsById: Map<string, GachaItemDefinition>;
  rateRedistributionsByGachaId: Map<string, RarityRateRedistribution>;
}

export type ItemInventoryCountMap = Map<string, number> | Record<string, number> | undefined;

export type GachaPtSettingsLookup = Record<string, PtSettingV3 | undefined>;

export interface GuaranteeIntervalState {
  remainingUntilTrigger: number;
  interval: number;
}

export interface ExecuteGachaDrawInstance {
  itemId: string;
  rarityId: string;
  wasGuaranteed: boolean;
}
