import type { DigitalItemTypeKey } from '../digital-items/digitalItemTypes';

export interface GachaAppStateV3 {
  version: number;
  updatedAt: string;
  meta: Record<
    string,
    {
      id: string;
      displayName: string;
      createdAt?: string;
      updatedAt?: string;
      isArchived?: boolean;
      thumbnailAssetId?: string | null;
    }
  >;
  order: string[];
  selectedGachaId: string | null;
}

export interface GachaCatalogItemV3 {
  itemId: string;
  rarityId: string;
  name: string;
  order?: number;
  pickupTarget?: boolean;
  completeTarget?: boolean;
  originalPrize?: boolean;
  imageAssetId?: string;
  thumbnailAssetId?: string | null;
  riagu?: boolean;
  updatedAt?: string;
}

export interface GachaCatalogGachaSnapshotV3 {
  order: string[];
  items: Record<string, GachaCatalogItemV3>;
}

export interface GachaCatalogStateV3 {
  version: number;
  updatedAt: string;
  byGacha: Record<string, GachaCatalogGachaSnapshotV3>;
}

export interface GachaCatalogItemAssetV4 {
  assetId: string;
  thumbnailAssetId?: string | null;
  digitalItemType?: DigitalItemTypeKey;
}

export interface GachaCatalogItemV4 {
  itemId: string;
  rarityId: string;
  name: string;
  order?: number;
  pickupTarget?: boolean;
  completeTarget?: boolean;
  originalPrize?: boolean;
  assets?: GachaCatalogItemAssetV4[];
  riagu?: boolean;
  stockCount?: number;
  updatedAt?: string;
}

export interface GachaCatalogGachaSnapshotV4 {
  order: string[];
  items: Record<string, GachaCatalogItemV4>;
}

export interface GachaCatalogStateV4 {
  version: number;
  updatedAt: string;
  byGacha: Record<string, GachaCatalogGachaSnapshotV4>;
}

export interface GachaRarityEntityV3 {
  id: string;
  gachaId: string;
  label: string;
  color?: string;
  emitRate?: number;
  sortOrder?: number;
  updatedAt?: string;
}

export interface GachaRarityStateV3 {
  version: number;
  updatedAt: string;
  byGacha: Record<string, string[]>;
  entities: Record<string, GachaRarityEntityV3>;
  indexByName?: Record<string, Record<string, string>>;
}

export interface UserProfileCardV3 {
  id: string;
  displayName: string;
  joinedAt?: string;
  updatedAt?: string;
  discordUserId?: string;
  discordUserName?: string;
  discordDisplayName?: string;
  discordAvatarAssetId?: string | null;
  discordAvatarUrl?: string | null;
  discordLinkedAt?: string;
  discordLastShareChannelId?: string;
  discordLastShareChannelName?: string | null;
  discordLastShareChannelParentId?: string | null;
  discordLastShareUrl?: string;
  discordLastShareLabel?: string | null;
  discordLastShareTitle?: string | null;
  discordLastShareComment?: string | null;
  discordLastShareAt?: string;
}

export interface UserProfilesStateV3 {
  version: number;
  updatedAt: string;
  users: Record<string, UserProfileCardV3>;
}

export interface UserInventorySnapshotV3 {
  inventoryId: string;
  gachaId: string;
  createdAt?: string;
  updatedAt?: string;
  totalCount?: number;
  items: Record<string, string[]>;
  counts: Record<string, Record<string, number>>;
  originalPrizeAssets?: Record<string, OriginalPrizeAssetV1[]>;
}

export interface UserInventoriesStateV3 {
  version: number;
  updatedAt: string;
  inventories: Record<string, Record<string, UserInventorySnapshotV3>>;
  byItemId: Record<string, Array<{ userId: string; gachaId: string; rarityId: string; count: number }>>;
}

export interface OriginalPrizeAssetV1 {
  assetId: string;
  thumbnailAssetId?: string | null;
}

export interface OriginalPrizeAssignmentV1 {
  index: number;
  assetId: string;
  thumbnailAssetId?: string | null;
}

export interface HitCountsStateV3 {
  version: number;
  updatedAt: string;
  byItemId: Record<string, number>;
}

export interface RiaguCardModelV3 {
  id: string;
  itemId: string;
  gachaId: string;
  unitCost?: number;
  typeLabel?: string;
  orderHint?: number;
  updatedAt?: string;
}

export interface RiaguStateV3 {
  version: number;
  updatedAt: string;
  riaguCards: Record<string, RiaguCardModelV3>;
  indexByItemId: Record<string, string>;
}

export interface PtBundleV3 {
  id: string;
  price: number;
  pulls: number;
}

export type PtGuaranteeTargetType = 'rarity' | 'item';

export interface PtGuaranteeTargetRarityV3 {
  type: 'rarity';
}

export interface PtGuaranteeTargetItemV3 {
  type: 'item';
  itemId: string;
}

export type PtGuaranteeTargetV3 = PtGuaranteeTargetRarityV3 | PtGuaranteeTargetItemV3;

export interface PtGuaranteeV3 {
  id: string;
  rarityId: string;
  threshold: number;
  quantity: number;
  target: PtGuaranteeTargetV3;
}

export interface PtSettingV3 {
  perPull?: {
    price: number;
    pulls: number;
  };
  complete?: {
    price: number;
  };
  bundles?: PtBundleV3[];
  guarantees?: PtGuaranteeV3[];
  updatedAt?: string;
}

export interface PtSettingsStateV3 {
  version: number;
  updatedAt: string;
  byGachaId: Record<string, PtSettingV3>;
}

export interface UiPreferencesStateV3 {
  version: number;
  updatedAt: string;
  appearance?: Record<string, unknown>;
  dashboard?: {
    desktop?: string;
    mobile?: string;
  };
  toolbar?: Record<string, unknown>;
  users?: Record<string, unknown>;
  gacha?: {
    ownerShareRate?: number;
    drawDialog?: {
      lastSelectedGachaId?: string;
      quickSendNewOnly?: boolean;
      [key: string]: unknown;
    };
    stock?: {
      includeOutOfStockInComplete?: boolean;
      allowOutOfStockGuaranteeItem?: boolean;
      [key: string]: unknown;
    };
    guarantee?: {
      applyLowerThresholdGuarantees?: boolean;
      [key: string]: unknown;
    };
    share?: {
      excludeRiaguImages?: boolean;
      [key: string]: unknown;
    };
    [key: string]: unknown;
  };
  riagu?: Record<string, unknown>;
  lastSeenRelease?: string | null;
  debug?: {
    discordAuthLogs?: boolean;
    [key: string]: unknown;
  };
}

export interface SaveOptionsSnapshotV3 {
  version: number;
  key: string;
  shareUrl: string;
  downloadUrl?: string;
  expiresAt?: string;
  pathname?: string;
  savedAt?: string;
}

export interface ReceiveHistoryStateV3 {
  version: number;
  completedKeys: string[];
  lastCompletedAt?: string;
}

export interface ReceivePrefsStateV3 {
  version: number;
  intro: {
    skipIntro: boolean;
    lastConfirmedAt?: string;
  };
  ownerName?: string | null;
  iconAssetIds?: string[];
}

export type PullHistoryEntrySourceV1 = 'insiteResult' | 'manual' | 'realtime';

export type PullHistoryEntryStatus = 'new' | 'ziped' | 'uploaded' | 'discord_shared';

export interface PullHistoryEntryV1 {
  id: string;
  gachaId: string;
  userId?: string;
  executedAt: string;
  pullCount: number;
  currencyUsed?: number;
  itemCounts: Record<string, number>;
  rarityCounts?: Record<string, number>;
  source: PullHistoryEntrySourceV1;
  status?: PullHistoryEntryStatus;
  hasOriginalPrizeMissing?: boolean;
  newItems?: string[];
  originalPrizeAssignments?: Record<string, OriginalPrizeAssignmentV1[]>;
}

export interface PullHistoryStateV1 {
  version: 1;
  updatedAt: string;
  order: string[];
  pulls: Record<string, PullHistoryEntryV1 | undefined>;
}

export interface GachaLocalStorageSnapshot {
  appState?: GachaAppStateV3;
  catalogState?: GachaCatalogStateV4;
  rarityState?: GachaRarityStateV3;
  userProfiles?: UserProfilesStateV3;
  userInventories?: UserInventoriesStateV3;
  hitCounts?: HitCountsStateV3;
  riaguState?: RiaguStateV3;
  ptSettings?: PtSettingsStateV3;
  uiPreferences?: UiPreferencesStateV3;
  saveOptions?: Record<string, SaveOptionsSnapshotV3>;
  receiveHistory?: ReceiveHistoryStateV3;
  receivePrefs?: ReceivePrefsStateV3;
  pullHistory?: PullHistoryStateV1;
}
