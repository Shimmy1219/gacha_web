import type {
  AppPersistence,
  GachaAppStateV3,
  GachaCatalogItemV3,
  GachaCatalogStateV3,
  GachaLocalStorageSnapshot,
  GachaRarityEntityV3,
  GachaRarityStateV3,
  UserInventoriesStateV3,
  UserInventorySnapshotV3,
  UserProfilesStateV3
} from '@domain/app-persistence';
import {
  generateDeterministicGachaId,
  generateDeterministicInventoryId,
  generateDeterministicItemId,
  generateDeterministicRarityId,
  generateDeterministicUserId
} from '@domain/idGenerators';
import type { DomainStores } from '@domain/stores/createDomainStores';

const DEFAULT_RARITY_COLORS: Record<string, string> = {
  UR: '#f59e0b',
  SSR: '#fde68a',
  SR: '#a78bfa',
  R: '#93c5fd',
  N: '#a7f3d0',
  はずれ: '#fca5a5'
};

const FALLBACK_RARITY_COLOR = '#cbd5f5';

interface ParsedLiveBlock {
  gachaName: string;
  userName: string;
  pulls: number;
  counts: Map<string, Map<string, number>>;
}

interface GachaAggregate {
  blocks: ParsedLiveBlock[];
  rarityLabels: Set<string>;
  codesByRarity: Map<string, Set<string>>;
}

export interface ApplyLivePasteResult {
  appliedBlocks: number;
  gachaIds: string[];
  usersUpdated: number;
}

export interface LivePasteGachaCandidate {
  id: string;
  displayName: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface LivePasteGachaConflict {
  gachaName: string;
  candidates: LivePasteGachaCandidate[];
}

export class LivePasteGachaConflictError extends Error {
  readonly conflicts: LivePasteGachaConflict[];

  constructor(conflicts: LivePasteGachaConflict[]) {
    super('同名のガチャが複数見つかりました。対象のガチャを選択してください。');
    this.name = 'LivePasteGachaConflictError';
    this.conflicts = conflicts;
  }
}

export interface ApplyLivePasteOptions {
  gachaSelections?: Record<string, string>;
}

export function splitLivePasteBlocks(rawText: string): string[] {
  const normalized = rawText.replace(/\r/g, '').trim();
  if (!normalized) {
    return [];
  }
  return normalized
    .split(/#なまずつーるず[^\S\r\n]*/u)
    .map((block) => block.trim())
    .filter(Boolean);
}

export function parseLivePasteBlock(block: string): ParsedLiveBlock | null {
  const lines = block
    .replace(/\r/g, '')
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < 3) {
    return null;
  }

  const gachaName = lines[0];
  if (!gachaName) {
    return null;
  }

  const userMatch = /^(.+?)\s*([0-9０-９]+)\s*連$/u.exec(lines[1]);
  if (!userMatch) {
    return null;
  }

  const userName = userMatch[1].trim();
  if (!userName) {
    return null;
  }

  const pulls = parseInt(normalizeDigits(userMatch[2]), 10) || 0;

  const counts = new Map<string, Map<string, number>>();

  for (let index = 2; index < lines.length; index += 1) {
    const line = lines[index];
    const match = /【([^】]+)】\s*([^\s　]+)[\s　]+([0-9０-９]+)\s*個?/u.exec(line);
    if (!match) {
      continue;
    }

    const rarityLabel = match[1].trim();
    const code = match[2].trim();
    const count = parseInt(normalizeDigits(match[3]), 10) || 0;

    if (!rarityLabel || !code || count <= 0) {
      continue;
    }

    if (!counts.has(rarityLabel)) {
      counts.set(rarityLabel, new Map());
    }
    const byCode = counts.get(rarityLabel)!;
    byCode.set(code, (byCode.get(code) ?? 0) + count);
  }

  if (counts.size === 0) {
    return null;
  }

  return {
    gachaName,
    userName,
    pulls,
    counts
  } satisfies ParsedLiveBlock;
}

export function applyLivePasteText(
  rawText: string,
  context: { persistence: AppPersistence; stores: DomainStores },
  options: ApplyLivePasteOptions = {}
): ApplyLivePasteResult {
  const blocks = splitLivePasteBlocks(rawText);
  if (blocks.length === 0) {
    throw new Error('解析できるブロックが見つかりませんでした。入力形式をご確認ください。');
  }

  const parsedBlocks: ParsedLiveBlock[] = [];
  blocks.forEach((block) => {
    const parsed = parseLivePasteBlock(block);
    if (parsed) {
      parsedBlocks.push(parsed);
    }
  });

  if (parsedBlocks.length === 0) {
    throw new Error('ブロックを検出しましたが、解析に失敗しました。形式をご確認ください。');
  }

  const snapshot = context.persistence.loadSnapshot();
  const nowIso = new Date().toISOString();

  const nextAppState = prepareAppState(snapshot.appState, nowIso);
  const nextRarityState = prepareRarityState(snapshot.rarityState, nowIso);
  const nextCatalogState = prepareCatalogState(snapshot.catalogState, nowIso);
  const nextProfilesState = prepareUserProfiles(snapshot.userProfiles, nowIso);
  const nextInventoriesState = prepareUserInventories(snapshot.userInventories, nowIso);

  const aggregated = aggregateByGacha(parsedBlocks);
  const gachaIdByName = new Map<string, string>();
  const rarityIdMapByGacha = new Map<string, Map<string, string>>();
  const itemIdMapByGacha = new Map<string, Map<string, string>>();

  const gachaConflicts: LivePasteGachaConflict[] = [];

  aggregated.forEach((aggregate, gachaName) => {
    const gachaId = resolveGachaId({
      appState: nextAppState,
      displayName: gachaName,
      gachaSelections: options.gachaSelections,
      conflicts: gachaConflicts
    });

    if (!gachaId) {
      return;
    }

    gachaIdByName.set(gachaName, gachaId);

    ensureGachaMeta(nextAppState, gachaId, gachaName, nowIso);

    const rarityIdMap = ensureRarities(
      nextRarityState,
      gachaId,
      Array.from(aggregate.rarityLabels.values()),
      nowIso
    );
    rarityIdMapByGacha.set(gachaId, rarityIdMap);

    const itemIdMap = ensureCatalogItems(
      nextCatalogState,
      gachaId,
      aggregate.codesByRarity,
      rarityIdMap,
      nowIso
    );
    itemIdMapByGacha.set(gachaId, itemIdMap);
  });

  if (gachaConflicts.length > 0) {
    throw new LivePasteGachaConflictError(gachaConflicts);
  }

  let lastGachaId: string | null = null;
  const touchedUsers = new Set<string>();

  parsedBlocks.forEach((block) => {
    const gachaId = gachaIdByName.get(block.gachaName);
    if (!gachaId) {
      return;
    }
    lastGachaId = gachaId;

    const rarityIdMap = rarityIdMapByGacha.get(gachaId);
    const itemIdMap = itemIdMapByGacha.get(gachaId);
    if (!rarityIdMap || !itemIdMap) {
      return;
    }

    const userId = ensureUserProfile(nextProfilesState, block.userName, nowIso);
    touchedUsers.add(userId);

    applyInventoryDelta({
      inventoriesState: nextInventoriesState,
      userId,
      gachaId,
      rarityIdMap,
      itemIdMap,
      counts: block.counts,
      nowIso
    });
  });

  if (lastGachaId) {
    nextAppState.selectedGachaId = lastGachaId;
  }

  nextAppState.updatedAt = nowIso;
  nextRarityState.updatedAt = nowIso;
  nextCatalogState.updatedAt = nowIso;
  nextProfilesState.updatedAt = nowIso;
  nextInventoriesState.updatedAt = nowIso;
  nextInventoriesState.byItemId = rebuildInventoryIndex(nextInventoriesState.inventories);

  const nextSnapshot: GachaLocalStorageSnapshot = {
    ...snapshot,
    appState: nextAppState,
    rarityState: nextRarityState,
    catalogState: nextCatalogState,
    userProfiles: nextProfilesState,
    userInventories: nextInventoriesState
  };

  context.persistence.saveSnapshot(nextSnapshot);

  context.stores.appState.setState(nextAppState, { persist: 'none' });
  context.stores.catalog.setState(nextCatalogState, { persist: 'none' });
  context.stores.rarities.setState(nextRarityState, { persist: 'none' });
  context.stores.userInventories.setState(nextInventoriesState, { persist: 'none' });

  return {
    appliedBlocks: parsedBlocks.length,
    gachaIds: Array.from(new Set(gachaIdByName.values())),
    usersUpdated: touchedUsers.size
  };
}

function aggregateByGacha(blocks: ParsedLiveBlock[]): Map<string, GachaAggregate> {
  const aggregated = new Map<string, GachaAggregate>();

  blocks.forEach((block) => {
    const aggregate = aggregated.get(block.gachaName) ?? {
      blocks: [],
      rarityLabels: new Set<string>(),
      codesByRarity: new Map<string, Set<string>>()
    };

    aggregate.blocks.push(block);

    block.counts.forEach((byCode, rarityLabel) => {
      aggregate.rarityLabels.add(rarityLabel);
      const codes = aggregate.codesByRarity.get(rarityLabel) ?? new Set<string>();
      byCode.forEach((_count, code) => {
        codes.add(code);
      });
      aggregate.codesByRarity.set(rarityLabel, codes);
    });

    aggregated.set(block.gachaName, aggregate);
  });

  return aggregated;
}

function prepareAppState(previous: GachaAppStateV3 | undefined, nowIso: string): GachaAppStateV3 {
  if (previous) {
    return {
      ...previous,
      meta: { ...(previous.meta ?? {}) },
      order: Array.isArray(previous.order) ? [...previous.order] : [],
      selectedGachaId: previous.selectedGachaId ?? null,
      updatedAt: previous.updatedAt ?? nowIso
    };
  }

  return {
    version: 3,
    updatedAt: nowIso,
    meta: {},
    order: [],
    selectedGachaId: null
  } satisfies GachaAppStateV3;
}

function prepareRarityState(
  previous: GachaRarityStateV3 | undefined,
  nowIso: string
): GachaRarityStateV3 {
  if (previous) {
    return {
      ...previous,
      byGacha: { ...(previous.byGacha ?? {}) },
      entities: { ...(previous.entities ?? {}) },
      indexByName: { ...(previous.indexByName ?? {}) },
      updatedAt: previous.updatedAt ?? nowIso
    };
  }

  return {
    version: 3,
    updatedAt: nowIso,
    byGacha: {},
    entities: {},
    indexByName: {}
  } satisfies GachaRarityStateV3;
}

function prepareCatalogState(
  previous: GachaCatalogStateV3 | undefined,
  nowIso: string
): GachaCatalogStateV3 {
  if (previous) {
    return {
      ...previous,
      byGacha: { ...(previous.byGacha ?? {}) },
      updatedAt: previous.updatedAt ?? nowIso
    };
  }

  return {
    version: 3,
    updatedAt: nowIso,
    byGacha: {}
  } satisfies GachaCatalogStateV3;
}

function prepareUserProfiles(
  previous: UserProfilesStateV3 | undefined,
  nowIso: string
): UserProfilesStateV3 {
  if (previous) {
    return {
      ...previous,
      users: { ...(previous.users ?? {}) },
      updatedAt: previous.updatedAt ?? nowIso
    };
  }

  return {
    version: 3,
    updatedAt: nowIso,
    users: {}
  } satisfies UserProfilesStateV3;
}

function prepareUserInventories(
  previous: UserInventoriesStateV3 | undefined,
  nowIso: string
): UserInventoriesStateV3 {
  if (previous) {
    return {
      ...previous,
      inventories: { ...(previous.inventories ?? {}) },
      byItemId: { ...(previous.byItemId ?? {}) },
      updatedAt: previous.updatedAt ?? nowIso
    };
  }

  return {
    version: 3,
    updatedAt: nowIso,
    inventories: {},
    byItemId: {}
  } satisfies UserInventoriesStateV3;
}

function resolveGachaId({
  appState,
  displayName,
  gachaSelections,
  conflicts
}: {
  appState: GachaAppStateV3;
  displayName: string;
  gachaSelections: Record<string, string> | undefined;
  conflicts: LivePasteGachaConflict[];
}): string | null {
  const candidates = collectGachaCandidates(appState, displayName);

  if (candidates.length === 1) {
    return candidates[0].id;
  }

  if (candidates.length > 1) {
    const selectedId = gachaSelections?.[displayName];
    if (selectedId && candidates.some((candidate) => candidate.id === selectedId)) {
      return selectedId;
    }

    conflicts.push({ gachaName: displayName, candidates });
    return null;
  }

  const seed = displayName || `gacha-${Date.now()}`;
  return generateDeterministicGachaId(seed);
}

function collectGachaCandidates(appState: GachaAppStateV3, displayName: string): LivePasteGachaCandidate[] {
  const meta = appState.meta ?? {};
  const order = Array.isArray(appState.order) ? appState.order : [];
  const collected: LivePasteGachaCandidate[] = [];
  const seen = new Set<string>();

  const pushCandidate = (gachaId: string) => {
    if (seen.has(gachaId)) {
      return;
    }
    const entry = meta[gachaId];
    if (!entry || entry.displayName !== displayName) {
      return;
    }
    seen.add(gachaId);
    collected.push({
      id: gachaId,
      displayName: entry.displayName,
      createdAt: entry.createdAt,
      updatedAt: entry.updatedAt
    });
  };

  order.forEach(pushCandidate);
  Object.keys(meta).forEach(pushCandidate);

  return collected;
}

function ensureGachaMeta(
  appState: GachaAppStateV3,
  gachaId: string,
  displayName: string,
  nowIso: string
): void {
  const existing = appState.meta[gachaId];
  if (existing) {
    appState.meta[gachaId] = {
      ...existing,
      id: gachaId,
      displayName,
      updatedAt: nowIso
    };
  } else {
    appState.meta[gachaId] = {
      id: gachaId,
      displayName,
      createdAt: nowIso,
      updatedAt: nowIso
    };
  }

  if (!appState.order.includes(gachaId)) {
    appState.order.push(gachaId);
  }
}

function ensureRarities(
  rarityState: GachaRarityStateV3,
  gachaId: string,
  rarityLabels: string[],
  nowIso: string
): Map<string, string> {
  const rarityIdMap = new Map<string, string>();
  const existingIndex = { ...(rarityState.indexByName?.[gachaId] ?? {}) };
  const existingOrder = Array.isArray(rarityState.byGacha?.[gachaId])
    ? [...(rarityState.byGacha?.[gachaId] ?? [])]
    : [];
  const orderSet = new Set(existingOrder);

  rarityLabels.forEach((label) => {
    if (!label) {
      return;
    }
    let rarityId = existingIndex[label];
    if (!rarityId) {
      rarityId = generateDeterministicRarityId(`${gachaId}-${label}`);
      existingIndex[label] = rarityId;
      if (!orderSet.has(rarityId)) {
        existingOrder.push(rarityId);
        orderSet.add(rarityId);
      }
    }

    const entity: GachaRarityEntityV3 = {
      ...(rarityState.entities?.[rarityId] ?? {}),
      id: rarityId,
      gachaId,
      label,
      color: rarityState.entities?.[rarityId]?.color ?? DEFAULT_RARITY_COLORS[label] ?? FALLBACK_RARITY_COLOR,
      sortOrder: rarityState.entities?.[rarityId]?.sortOrder ?? existingOrder.indexOf(rarityId),
      emitRate: rarityState.entities?.[rarityId]?.emitRate,
      shortName: rarityState.entities?.[rarityId]?.shortName,
      updatedAt: nowIso
    };

    rarityState.entities[rarityId] = entity;
    rarityIdMap.set(label, rarityId);
  });

  rarityState.byGacha[gachaId] = existingOrder;
  rarityState.indexByName[gachaId] = existingIndex;

  return rarityIdMap;
}

function ensureCatalogItems(
  catalogState: GachaCatalogStateV3,
  gachaId: string,
  codesByRarity: Map<string, Set<string>>,
  rarityIdMap: Map<string, string>,
  nowIso: string
): Map<string, string> {
  const gachaCatalog = catalogState.byGacha[gachaId] ?? { order: [], items: {} };
  const nextItems: Record<string, GachaCatalogItemV3> = { ...(gachaCatalog.items ?? {}) };
  const nextOrder = Array.isArray(gachaCatalog.order) ? [...gachaCatalog.order] : [];
  const orderSet = new Set(nextOrder);
  const itemIdMap = new Map<string, string>();

  codesByRarity.forEach((codes, rarityLabel) => {
    const rarityId = rarityIdMap.get(rarityLabel) ?? generateDeterministicRarityId(`${gachaId}-${rarityLabel}`);
    codes.forEach((code) => {
      if (!code) {
        return;
      }

      const existingItemId = findItemIdByName(nextItems, code);
      const itemId = existingItemId ?? generateDeterministicItemId(`${gachaId}-${code}`);
      const previousItem = nextItems[itemId];

      const nextItem: GachaCatalogItemV3 = {
        ...previousItem,
        itemId,
        rarityId,
        name: code,
        updatedAt: nowIso,
        order: previousItem?.order
      };

      nextItems[itemId] = nextItem;
      itemIdMap.set(code, itemId);

      if (!orderSet.has(itemId)) {
        nextOrder.push(itemId);
        orderSet.add(itemId);
      }
    });
  });

  catalogState.byGacha[gachaId] = {
    order: nextOrder,
    items: nextItems
  };

  return itemIdMap;
}

function applyInventoryDelta(params: {
  inventoriesState: UserInventoriesStateV3;
  userId: string;
  gachaId: string;
  rarityIdMap: Map<string, string>;
  itemIdMap: Map<string, string>;
  counts: Map<string, Map<string, number>>;
  nowIso: string;
}): void {
  const { inventoriesState, userId, gachaId, rarityIdMap, itemIdMap, counts, nowIso } = params;

  const inventoryId = generateDeterministicInventoryId(`${userId}-${gachaId}`);
  const existingInventories = inventoriesState.inventories[userId] ?? {};
  const nextInventories = { ...existingInventories };

  for (const [existingInventoryId, snapshot] of Object.entries(nextInventories)) {
    if (snapshot?.gachaId === gachaId && existingInventoryId !== inventoryId) {
      delete nextInventories[existingInventoryId];
    }
  }

  const previousSnapshot = nextInventories[inventoryId];
  const previousCounts = previousSnapshot?.counts ?? {};
  const nextCounts: Record<string, Record<string, number>> = { ...previousCounts };

  counts.forEach((byCode, rarityLabel) => {
    const rarityId = rarityIdMap.get(rarityLabel) ?? generateDeterministicRarityId(`${gachaId}-${rarityLabel}`);
    const existingCounts = { ...(nextCounts[rarityId] ?? {}) };

    byCode.forEach((count, code) => {
      const itemId = itemIdMap.get(code) ?? generateDeterministicItemId(`${gachaId}-${code}`);
      const normalized = Math.max(0, Math.floor(count));
      if (normalized > 0) {
        existingCounts[itemId] = (existingCounts[itemId] ?? 0) + normalized;
      }
    });

    nextCounts[rarityId] = existingCounts;
  });

  const cleanedCounts = cleanCounts(nextCounts);
  const itemsByRarity = buildItemsFromCounts(cleanedCounts);
  const totalCount = calculateInventoryTotal(itemsByRarity, cleanedCounts);

  const snapshot: UserInventorySnapshotV3 = {
    ...(previousSnapshot ?? {}),
    inventoryId,
    gachaId,
    items: itemsByRarity,
    counts: cleanedCounts,
    totalCount,
    updatedAt: nowIso,
    createdAt: previousSnapshot?.createdAt ?? nowIso
  };

  nextInventories[inventoryId] = snapshot;
  inventoriesState.inventories[userId] = nextInventories;
}

function ensureUserProfile(
  profilesState: UserProfilesStateV3,
  userName: string,
  nowIso: string
): string {
  const userId = generateDeterministicUserId(userName);
  const existing = profilesState.users[userId];
  if (existing) {
    profilesState.users[userId] = {
      ...existing,
      id: userId,
      displayName: userName,
      updatedAt: nowIso
    };
  } else {
    profilesState.users[userId] = {
      id: userId,
      displayName: userName,
      updatedAt: nowIso,
      joinedAt: nowIso
    };
  }
  return userId;
}

function rebuildInventoryIndex(
  inventories: UserInventoriesStateV3['inventories']
): UserInventoriesStateV3['byItemId'] {
  const result: UserInventoriesStateV3['byItemId'] = {};

  if (!inventories) {
    return result;
  }

  for (const [userId, snapshots] of Object.entries(inventories)) {
    for (const snapshot of Object.values(snapshots ?? {})) {
      if (!snapshot) {
        continue;
      }

      const itemsByRarity = snapshot.items ?? {};
      const countsByRarity = snapshot.counts ?? {};

      const rarityIds = new Set([
        ...Object.keys(itemsByRarity),
        ...Object.keys(countsByRarity)
      ]);

      rarityIds.forEach((rarityId) => {
        const fallbackCounts = new Map<string, number>();
        const itemIds = itemsByRarity[rarityId];
        if (Array.isArray(itemIds)) {
          itemIds.forEach((itemId) => {
            fallbackCounts.set(itemId, (fallbackCounts.get(itemId) ?? 0) + 1);
          });
        }

        const explicitCounts = countsByRarity[rarityId] ?? {};
        const itemKeys = new Set([
          ...fallbackCounts.keys(),
          ...Object.keys(explicitCounts)
        ]);

        itemKeys.forEach((itemId) => {
          const fallback = fallbackCounts.get(itemId) ?? 0;
          const explicit = explicitCounts[itemId];
          const total = typeof explicit === 'number' && explicit > 0 ? explicit : fallback;

          if (total <= 0) {
            return;
          }

          if (!result[itemId]) {
            result[itemId] = [];
          }

          result[itemId].push({
            userId,
            gachaId: snapshot.gachaId,
            rarityId,
            count: total
          });
        });
      });
    }
  }

  return result;
}

function calculateInventoryTotal(
  items: Record<string, string[]> | undefined,
  counts: Record<string, Record<string, number>> | undefined
): number {
  let total = 0;

  const rarityIds = new Set([
    ...Object.keys(items ?? {}),
    ...Object.keys(counts ?? {})
  ]);

  rarityIds.forEach((rarityId) => {
    const fallbackCounts = new Map<string, number>();
    const itemIds = items?.[rarityId];
    if (Array.isArray(itemIds)) {
      itemIds.forEach((itemId) => {
        fallbackCounts.set(itemId, (fallbackCounts.get(itemId) ?? 0) + 1);
      });
    }

    const explicitCounts = counts?.[rarityId] ?? {};
    const itemKeys = new Set([
      ...fallbackCounts.keys(),
      ...Object.keys(explicitCounts)
    ]);

    itemKeys.forEach((itemId) => {
      const fallback = fallbackCounts.get(itemId) ?? 0;
      const explicit = explicitCounts[itemId];
      const value = typeof explicit === 'number' && explicit > 0 ? explicit : fallback;
      if (value > 0) {
        total += value;
      }
    });
  });

  return total;
}

function cleanCounts(
  counts: Record<string, Record<string, number>>
): Record<string, Record<string, number>> {
  const result: Record<string, Record<string, number>> = {};

  Object.entries(counts).forEach(([rarityId, entries]) => {
    const cleaned: Record<string, number> = {};
    Object.entries(entries ?? {}).forEach(([itemId, value]) => {
      const normalized = Math.max(0, Math.floor(value ?? 0));
      if (normalized > 0) {
        cleaned[itemId] = normalized;
      }
    });
    if (Object.keys(cleaned).length > 0) {
      result[rarityId] = cleaned;
    }
  });

  return result;
}

function buildItemsFromCounts(
  counts: Record<string, Record<string, number>>
): Record<string, string[]> {
  const items: Record<string, string[]> = {};

  Object.entries(counts).forEach(([rarityId, byItem]) => {
    const list: string[] = [];
    Object.entries(byItem ?? {}).forEach(([itemId, count]) => {
      const normalized = Math.max(0, Math.floor(count ?? 0));
      for (let index = 0; index < normalized; index += 1) {
        list.push(itemId);
      }
    });

    if (list.length > 0) {
      list.sort((a, b) => a.localeCompare(b, 'ja'));
      items[rarityId] = list;
    }
  });

  return items;
}

function findItemIdByName(
  items: Record<string, GachaCatalogItemV3>,
  name: string
): string | undefined {
  for (const [itemId, item] of Object.entries(items)) {
    if (item?.name === name) {
      return itemId;
    }
  }
  return undefined;
}

function normalizeDigits(value: string): string {
  return value.replace(/[０-９]/gu, (digit) => String(digit.charCodeAt(0) - 0xff10));
}

