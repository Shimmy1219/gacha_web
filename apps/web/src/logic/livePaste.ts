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
  generateDeterministicInventoryId,
  generateDeterministicUserId
} from '@domain/idGenerators';
import type { DomainStores } from '@domain/stores/createDomainStores';

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

type LivePasteMalformedReason =
  | 'missing-gacha-name'
  | 'missing-user-line'
  | 'missing-user-name'
  | 'missing-user-pulls'
  | 'missing-results'
  | 'missing-rarity-label'
  | 'missing-item-name'
  | 'missing-item-count';

export type LivePasteCatalogIssue =
  | { type: 'missing-gacha'; gachaName: string }
  | { type: 'missing-rarity-index'; gachaName: string }
  | { type: 'missing-rarity'; gachaName: string; rarityLabel: string }
  | { type: 'missing-item'; gachaName: string; rarityLabel: string; itemName: string }
  | { type: 'rarity-mismatch'; gachaName: string; rarityLabel: string; itemName: string }
  | { type: 'malformed-block'; reason: LivePasteMalformedReason; gachaName?: string; line?: string };

export class LivePasteCatalogMismatchError extends Error {
  readonly issue: LivePasteCatalogIssue;

  constructor(issue: LivePasteCatalogIssue) {
    super(
      '貼り付けた結果と登録済みカタログの内容が一致しません。外部ガチャサイトで最新のTXTを保存して「ガチャ登録」から読み込ませてください。'
    );
    this.name = 'LivePasteCatalogMismatchError';
    this.issue = issue;
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

function raiseMalformedBlockError(
  reason: LivePasteMalformedReason,
  context: { gachaName?: string; line?: string } = {}
): never {
  throw new LivePasteCatalogMismatchError({
    type: 'malformed-block',
    reason,
    gachaName: context.gachaName,
    line: context.line
  });
}

export function parseLivePasteBlock(block: string): ParsedLiveBlock {
  const lines = block
    .replace(/\r/g, '')
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    raiseMalformedBlockError('missing-gacha-name');
  }

  const gachaName = lines[0];
  if (!gachaName) {
    raiseMalformedBlockError('missing-gacha-name');
  }

  if (lines.length < 2) {
    raiseMalformedBlockError('missing-user-line', { gachaName });
  }

  const userLine = lines[1];
  if (!userLine) {
    raiseMalformedBlockError('missing-user-line', { gachaName });
  }

  const pullsMatch = /([0-9０-９]+)\s*連$/u.exec(userLine);
  if (!pullsMatch) {
    raiseMalformedBlockError('missing-user-pulls', { gachaName });
  }

  const pulls = parseInt(normalizeDigits(pullsMatch[1]), 10) || 0;
  const userName = userLine.slice(0, pullsMatch.index).trim();
  if (!userName) {
    raiseMalformedBlockError('missing-user-name', { gachaName });
  }

  const counts = new Map<string, Map<string, number>>();

  for (let index = 2; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line) {
      continue;
    }

    const rarityMatch = /^【([^】]*)】\s*(.*)$/u.exec(line);
    if (!rarityMatch) {
      continue;
    }

    const rarityLabel = rarityMatch[1].trim();
    if (!rarityLabel) {
      raiseMalformedBlockError('missing-rarity-label', { gachaName, line });
    }

    const remainder = rarityMatch[2].trim();
    if (!remainder) {
      raiseMalformedBlockError('missing-item-name', { gachaName, line });
    }

    const countMatch = /([0-9０-９]+)\s*個?$/u.exec(remainder);
    if (!countMatch) {
      raiseMalformedBlockError('missing-item-count', { gachaName, line });
    }

    const count = parseInt(normalizeDigits(countMatch[1]), 10) || 0;
    if (count <= 0) {
      raiseMalformedBlockError('missing-item-count', { gachaName, line });
    }

    const code = remainder.slice(0, countMatch.index).trim();
    if (!code) {
      raiseMalformedBlockError('missing-item-name', { gachaName, line });
    }

    if (!counts.has(rarityLabel)) {
      counts.set(rarityLabel, new Map());
    }
    const byCode = counts.get(rarityLabel)!;
    byCode.set(code, (byCode.get(code) ?? 0) + count);
  }

  if (counts.size === 0) {
    raiseMalformedBlockError('missing-results', { gachaName });
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

  const parsedBlocks = blocks.map((block) => parseLivePasteBlock(block));

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
      gachaName,
      Array.from(aggregate.rarityLabels.values()),
      nowIso
    );
    rarityIdMapByGacha.set(gachaId, rarityIdMap);

    const itemIdMap = ensureCatalogItems(
      nextCatalogState,
      gachaId,
      gachaName,
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
      gachaName: block.gachaName,
      rarityIdMap,
      itemIdMap,
      counts: block.counts,
      nowIso
    });

    const itemCounts: Record<string, number> = {};
    const rarityCounts: Record<string, number> = {};

    block.counts.forEach((byCode, rarityLabel) => {
      const rarityId = rarityIdMap.get(rarityLabel);
      if (!rarityId) {
        return;
      }

      let rarityTotal = 0;

      byCode.forEach((count, code) => {
        const itemId = itemIdMap.get(code);
        if (!itemId) {
          return;
        }

        const normalized = Math.max(0, Math.floor(count));
        if (normalized <= 0) {
          return;
        }

        itemCounts[itemId] = (itemCounts[itemId] ?? 0) + normalized;
        rarityTotal += normalized;
      });

      if (rarityTotal > 0) {
        rarityCounts[rarityId] = (rarityCounts[rarityId] ?? 0) + rarityTotal;
      }
    });

    if (Object.keys(itemCounts).length > 0) {
      const totalPulledItems = Object.values(itemCounts).reduce((sum, count) => sum + count, 0);
      const declaredPulls = Number.isFinite(block.pulls) ? Math.floor(block.pulls) : 0;
      const normalizedPulls = Math.max(1, totalPulledItems, declaredPulls);
      context.stores.pullHistory.appendPull({
        gachaId,
        userId,
        executedAt: new Date().toISOString(),
        pullCount: normalizedPulls,
        itemCounts,
        rarityCounts: Object.keys(rarityCounts).length > 0 ? rarityCounts : undefined,
        notes: 'リアルタイム入力から追加'
      });
    }
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

  const pullHistoryState = context.stores.pullHistory.getState();

  const nextSnapshot: GachaLocalStorageSnapshot = {
    ...snapshot,
    appState: nextAppState,
    rarityState: nextRarityState,
    catalogState: nextCatalogState,
    userProfiles: nextProfilesState,
    userInventories: nextInventoriesState,
    pullHistory: pullHistoryState ?? snapshot.pullHistory
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

  if (candidates.length === 0) {
    throw new LivePasteCatalogMismatchError({ type: 'missing-gacha', gachaName: displayName });
  }

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

  return null;
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
  if (!existing) {
    throw new LivePasteCatalogMismatchError({ type: 'missing-gacha', gachaName: displayName });
  }

  appState.meta[gachaId] = {
    ...existing,
    id: gachaId,
    displayName,
    updatedAt: nowIso
  };

  if (!appState.order.includes(gachaId)) {
    appState.order.push(gachaId);
  }
}

function ensureRarities(
  rarityState: GachaRarityStateV3,
  gachaId: string,
  gachaName: string,
  rarityLabels: string[],
  nowIso: string
): Map<string, string> {
  const rarityIdMap = new Map<string, string>();
  const existingIndex = rarityState.indexByName?.[gachaId];

  if (!existingIndex) {
    throw new LivePasteCatalogMismatchError({ type: 'missing-rarity-index', gachaName });
  }

  rarityLabels.forEach((label) => {
    if (!label) {
      return;
    }

    const rarityId = existingIndex[label];
    if (!rarityId) {
      throw new LivePasteCatalogMismatchError({ type: 'missing-rarity', gachaName, rarityLabel: label });
    }

    const entity = rarityState.entities?.[rarityId];
    if (!entity) {
      throw new LivePasteCatalogMismatchError({ type: 'missing-rarity', gachaName, rarityLabel: label });
    }

    rarityState.entities[rarityId] = {
      ...entity,
      updatedAt: nowIso
    } satisfies GachaRarityEntityV3;

    rarityIdMap.set(label, rarityId);
  });

  return rarityIdMap;
}

function ensureCatalogItems(
  catalogState: GachaCatalogStateV3,
  gachaId: string,
  gachaName: string,
  codesByRarity: Map<string, Set<string>>,
  rarityIdMap: Map<string, string>,
  nowIso: string
): Map<string, string> {
  const gachaCatalog = catalogState.byGacha[gachaId];
  if (!gachaCatalog) {
    throw new LivePasteCatalogMismatchError({ type: 'missing-gacha', gachaName });
  }

  if (!gachaCatalog.items) {
    gachaCatalog.items = {};
  }

  const items = gachaCatalog.items;
  const itemIdMap = new Map<string, string>();

  codesByRarity.forEach((codes, rarityLabel) => {
    const rarityId = rarityIdMap.get(rarityLabel);
    if (!rarityId) {
      throw new LivePasteCatalogMismatchError({ type: 'missing-rarity', gachaName, rarityLabel });
    }

    codes.forEach((code) => {
      if (!code) {
        return;
      }

      const itemId = findItemIdByName(items, code);
      if (!itemId) {
        throw new LivePasteCatalogMismatchError({ type: 'missing-item', gachaName, rarityLabel, itemName: code });
      }

      const item = items[itemId];
      if (!item) {
        throw new LivePasteCatalogMismatchError({ type: 'missing-item', gachaName, rarityLabel, itemName: code });
      }

      if (item.rarityId !== rarityId) {
        throw new LivePasteCatalogMismatchError({
          type: 'rarity-mismatch',
          gachaName,
          rarityLabel,
          itemName: code
        });
      }

      gachaCatalog.items[itemId] = {
        ...item,
        updatedAt: nowIso
      } satisfies GachaCatalogItemV3;

      itemIdMap.set(code, itemId);
    });
  });

  return itemIdMap;
}

function applyInventoryDelta(params: {
  inventoriesState: UserInventoriesStateV3;
  userId: string;
  gachaId: string;
  gachaName: string;
  rarityIdMap: Map<string, string>;
  itemIdMap: Map<string, string>;
  counts: Map<string, Map<string, number>>;
  nowIso: string;
}): void {
  const { inventoriesState, userId, gachaId, gachaName, rarityIdMap, itemIdMap, counts, nowIso } = params;

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
    const rarityId = rarityIdMap.get(rarityLabel);
    if (!rarityId) {
      throw new LivePasteCatalogMismatchError({ type: 'missing-rarity', gachaName, rarityLabel });
    }
    const existingCounts = { ...(nextCounts[rarityId] ?? {}) };

    byCode.forEach((count, code) => {
      const itemId = itemIdMap.get(code);
      if (!itemId) {
        throw new LivePasteCatalogMismatchError({
          type: 'missing-item',
          gachaName,
          rarityLabel,
          itemName: code
        });
      }
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

