import type {
  GachaCatalogStateV4,
  GachaCatalogGachaSnapshotV4,
  GachaRarityStateV3,
  GachaRarityEntityV3
} from '@domain/app-persistence';
import { generateDeterministicUserId } from '@domain/idGenerators';

export interface HistoryItemMetadata {
  name: string;
  rarityId?: string;
  rarityLabel?: string;
  rarityColor?: string | null;
  raritySortOrder?: number | null;
}

export const DEFAULT_HISTORY_USER_ID = generateDeterministicUserId('default-user');

export function normalizeHistoryUserId(value: string | undefined): string {
  const trimmed = value?.trim() ?? '';
  return trimmed.length > 0 ? trimmed : DEFAULT_HISTORY_USER_ID;
}

function getCatalogSnapshot(
  catalogState: GachaCatalogStateV4 | undefined,
  gachaId: string
): GachaCatalogGachaSnapshotV4 | undefined {
  return catalogState?.byGacha?.[gachaId];
}

function getRarityEntity(
  rarityState: GachaRarityStateV3 | undefined,
  rarityId: string | undefined
): GachaRarityEntityV3 | undefined {
  if (!rarityId) {
    return undefined;
  }
  return rarityState?.entities?.[rarityId];
}

export function buildItemMetadataMap(
  catalogState: GachaCatalogStateV4 | undefined,
  rarityState: GachaRarityStateV3 | undefined,
  gachaId: string
): Map<string, HistoryItemMetadata> {
  const snapshot = getCatalogSnapshot(catalogState, gachaId);
  if (!snapshot?.items) {
    return new Map();
  }

  const metadata = new Map<string, HistoryItemMetadata>();

  Object.values(snapshot.items).forEach((item) => {
    if (!item?.itemId) {
      return;
    }
    const rarityId = item.rarityId ?? undefined;
    const rarityEntity = getRarityEntity(rarityState, rarityId);
    metadata.set(item.itemId, {
      name: item.name ?? item.itemId,
      rarityId,
      rarityLabel: rarityEntity?.label ?? rarityId,
      rarityColor: rarityEntity?.color ?? null,
      raritySortOrder: rarityEntity?.sortOrder ?? null
    });
  });

  return metadata;
}
