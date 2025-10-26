import { inflate, inflateRaw } from 'pako';

import type {
  AppPersistence,
  GachaAppStateV3,
  GachaCatalogItemV3,
  GachaCatalogStateV3,
  GachaLocalStorageSnapshot,
  GachaRarityEntityV3,
  GachaRarityStateV3,
  PullHistoryEntryV1,
  PullHistoryStateV1,
  UserProfilesStateV3
} from '@domain/app-persistence';
import { projectInventories } from '@domain/inventoryProjection';
import type { DomainStores } from '@domain/stores/createDomainStores';
import {
  generateDeterministicGachaId,
  generateDeterministicItemId,
  generateDeterministicPullId,
  generateDeterministicRarityId
} from '@domain/idGenerators';
import type { UserProfileStore } from '@domain/stores/userProfileStore';

interface NamazuTxtEnvelope {
  gacha_select?: string | number | null;
  gacha_name_list?: Record<string, unknown> | Array<unknown>;
  gacha_name?: string;
  title?: string;
  name?: string;
  gacha_data?: {
    rarity_base?: Array<unknown>;
    item_base?: Array<unknown>;
    history_list?: Array<unknown>;
  };
}

interface ParsedRarity {
  label: string;
  weight: number;
}

interface ParsedItem {
  code: string;
  rarityLabel: string;
  order: number;
}

interface ParsedHistoryEntry {
  userName: string;
  items: Array<{
    code: string;
    rarityLabel: string;
    count: number;
  }>;
}

interface ParsedNamazuData {
  displayName: string;
  legacyKey: string | null;
  rarities: ParsedRarity[];
  items: ParsedItem[];
  history: ParsedHistoryEntry[];
}

interface MergeResult {
  snapshot: GachaLocalStorageSnapshot;
  gachaId: string;
  displayName: string;
}

const DEFAULT_RARITY_COLORS: Record<string, string> = {
  UR: '#f59e0b',
  SSR: '#fde68a',
  SR: '#a78bfa',
  R: '#93c5fd',
  N: '#a7f3d0',
  はずれ: '#fca5a5'
};

const FALLBACK_RARITY_COLOR = '#cbd5f5';

export async function importTxtFile(
  file: File,
  context: { persistence: AppPersistence; stores: DomainStores }
): Promise<{ gachaId: string; displayName: string }> {
  const rawText = (await file.text()).trim();
  if (!rawText) {
    throw new Error('TXTファイルに内容がありません');
  }

  const jsonText = await decodeNamazuPayload(rawText);

  let parsedObject: unknown;
  try {
    parsedObject = JSON.parse(jsonText);
  } catch (error) {
    throw new Error(
      `TXTのJSON解析に失敗しました: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  const parsed = parseNamazuEnvelope(parsedObject);

  const snapshot = context.persistence.loadSnapshot();
  const merged = mergeNamazuIntoSnapshot(parsed, snapshot, context.stores);

  context.persistence.saveSnapshot(merged.snapshot);

  if (merged.snapshot.appState) {
    context.stores.appState.setState(merged.snapshot.appState, { persist: 'none' });
  }
  if (merged.snapshot.catalogState) {
    context.stores.catalog.setState(merged.snapshot.catalogState, { persist: 'none' });
  }
  if (merged.snapshot.rarityState) {
    context.stores.rarities.setState(merged.snapshot.rarityState, { persist: 'none' });
  }
  context.stores.pullHistory.setState(merged.snapshot.pullHistory, { persist: 'none' });
  if (merged.snapshot.userProfiles) {
    context.stores.userProfiles.setState(merged.snapshot.userProfiles, { persist: 'none' });
  }
  context.stores.userInventories.applyProjectionResult(merged.snapshot.userInventories);

  return { gachaId: merged.gachaId, displayName: merged.displayName };
}

async function decodeNamazuPayload(rawBase64: string): Promise<string> {
  const u8 = base64ToUint8Array(rawBase64);
  const decoder = new TextDecoder('utf-8', { fatal: false });

  const directText = decoder.decode(u8).trim();
  if (looksLikeJson(directText)) {
    try {
      JSON.parse(directText);
      return directText;
    } catch {
      // Fall through to try inflate
    }
  }

  try {
    const inflated = inflateRaw(u8);
    const text = decoder.decode(inflated).trim();
    if (looksLikeJson(text)) {
      JSON.parse(text);
      return text;
    }
  } catch {
    // ignore and try next method
  }

  try {
    const inflated = inflate(u8);
    const text = decoder.decode(inflated).trim();
    if (looksLikeJson(text)) {
      JSON.parse(text);
      return text;
    }
  } catch {
    // ignore to throw below
  }

  throw new Error('TXTの解凍に失敗しました（base64/deflate判定）');
}

function looksLikeJson(text: string): boolean {
  return text.startsWith('{') || text.startsWith('[');
}

function base64ToUint8Array(base64: string): Uint8Array {
  const normalized = base64.replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/');
  const padLength = normalized.length % 4 === 0 ? 0 : 4 - (normalized.length % 4);
  const padded = normalized + '='.repeat(padLength);

  if (typeof atob === 'function') {
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
  }

  const globalBuffer = (globalThis as Record<string, unknown>).Buffer as
    | { from?: (input: string, encoding: string) => Uint8Array }
    | undefined;
  if (globalBuffer && typeof globalBuffer.from === 'function') {
    const buffer = globalBuffer.from(padded, 'base64');
    return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.length);
  }

  throw new Error('Base64デコードに失敗しました');
}

function parseNamazuEnvelope(raw: unknown): ParsedNamazuData {
  if (!raw || typeof raw !== 'object') {
    throw new Error('TXTのJSON形式が正しくありません');
  }

  const envelope = raw as NamazuTxtEnvelope;
  const displayName = pickDisplayName(envelope);
  const legacyKey =
    typeof envelope.gacha_select === 'string' || typeof envelope.gacha_select === 'number'
      ? String(envelope.gacha_select)
      : null;

  const rarities: ParsedRarity[] = [];
  const itemRecords: ParsedItem[] = [];
  const history: ParsedHistoryEntry[] = [];

  const gachaData = envelope.gacha_data ?? {};

  const rarityBase = Array.isArray(gachaData.rarity_base) ? gachaData.rarity_base : [];
  rarityBase.forEach((entry, index) => {
    if (!entry) {
      return;
    }
    let label = '';
    let weight = 0;
    if (Array.isArray(entry)) {
      label = String(entry[0] ?? '').trim();
      weight = Number(entry[1] ?? 0) || 0;
    } else if (typeof entry === 'object') {
      const tuple = entry as Record<string, unknown>;
      label = String(tuple.name ?? tuple.label ?? '').trim();
      weight = Number(tuple.value ?? tuple.weight ?? 0) || 0;
    }
    if (!label) {
      label = `RARITY-${index + 1}`;
    }
    rarities.push({ label, weight });
  });

  const rarityByIndex = rarities.map((rarity) => rarity.label);

  const itemBase = Array.isArray(gachaData.item_base) ? gachaData.item_base : [];
  itemBase.forEach((entry, index) => {
    if (!entry) {
      return;
    }

    let rarityLabel = '';
    let code = '';

    if (Array.isArray(entry)) {
      const tuple = entry as Array<unknown>;
      const rarityIndexRaw = tuple[0];
      if (typeof rarityIndexRaw === 'number' && rarityIndexRaw >= 0) {
        rarityLabel = rarityByIndex[rarityIndexRaw] ?? '';
      } else if (typeof rarityIndexRaw === 'string' && /^\d+$/.test(rarityIndexRaw)) {
        const rarityIndex = Number(rarityIndexRaw);
        rarityLabel = rarityByIndex[rarityIndex] ?? '';
      }
      code = String(tuple[2] ?? tuple[1] ?? `ITEM-${index + 1}`).trim();
    } else if (typeof entry === 'object') {
      const tuple = entry as Record<string, unknown>;
      const rarityIndexRaw = tuple.rarity_type ?? tuple.rarityIndex ?? tuple[0 as unknown as keyof typeof tuple];
      if (typeof rarityIndexRaw === 'number' && rarityIndexRaw >= 0) {
        rarityLabel = rarityByIndex[rarityIndexRaw] ?? '';
      }
      code = String(tuple.code ?? tuple.name ?? tuple.label ?? `ITEM-${index + 1}`).trim();
      if (!rarityLabel && typeof tuple.rarity === 'string') {
        rarityLabel = tuple.rarity;
      }
    }

    if (!rarityLabel) {
      rarityLabel = rarityByIndex[0] ?? 'N';
    }
    if (!code) {
      code = `ITEM-${index + 1}`;
    }

    itemRecords.push({ code, rarityLabel, order: index + 1 });
  });

  const itemsByCode = new Map<string, ParsedItem>();
  itemRecords.forEach((item) => {
    itemsByCode.set(item.code, item);
  });

  const historyList = Array.isArray(gachaData.history_list) ? gachaData.history_list : [];
  historyList.forEach((entry) => {
    if (!Array.isArray(entry) || entry.length < 2) {
      return;
    }
    const userName = String(entry[0] ?? '').trim();
    if (!userName) {
      return;
    }

    const pullsRaw = entry[1];
    const pulls = Array.isArray(pullsRaw) ? pullsRaw : [];
    const parsedPulls: ParsedHistoryEntry['items'] = [];

    pulls.forEach((pull) => {
      if (!Array.isArray(pull)) {
        return;
      }
      const rarityLabel = String(pull[1] ?? '').trim();
      const code = String(pull[2] ?? '').trim();
      const count = Number(pull[3] ?? 1) || 1;

      if (!itemsByCode.has(code)) {
        const fallbackRarity = rarityLabel || itemRecords[0]?.rarityLabel || 'N';
        itemsByCode.set(code, {
          code,
          rarityLabel: fallbackRarity,
          order: itemRecords.length + itemsByCode.size + 1
        });
      }

      const finalRarity = rarityLabel || itemsByCode.get(code)?.rarityLabel || 'N';
      parsedPulls.push({ code, rarityLabel: finalRarity, count });
    });

    if (parsedPulls.length > 0) {
      history.push({ userName, items: parsedPulls });
    }
  });

  const finalItems = Array.from(itemsByCode.values());
  finalItems.sort((a, b) => a.order - b.order);

  return {
    displayName,
    legacyKey,
    rarities,
    items: finalItems,
    history
  };
}

function pickDisplayName(envelope: NamazuTxtEnvelope): string {
  const selectRaw = envelope.gacha_select;
  const nameList = envelope.gacha_name_list;

  if (nameList != null) {
    if (Array.isArray(nameList)) {
      const index =
        typeof selectRaw === 'string' && /^\d+$/.test(selectRaw)
          ? Number(selectRaw)
          : typeof selectRaw === 'number'
            ? selectRaw
            : 0;
      const candidate = nameList[index];
      if (candidate != null) {
        const label = String(candidate).trim();
        if (label) {
          return label;
        }
      }
    } else if (typeof nameList === 'object') {
      const record = nameList as Record<string, unknown>;
      if (selectRaw != null && Object.prototype.hasOwnProperty.call(record, String(selectRaw))) {
        const value = record[String(selectRaw)];
        if (value != null) {
          const label = String(value).trim();
          if (label) {
            return label;
          }
        }
      }
      const firstKey = Object.keys(record)[0];
      if (firstKey != null) {
        const value = record[firstKey];
        if (value != null) {
          const label = String(value).trim();
          if (label) {
            return label;
          }
        }
      }
    }
  }

  const fallback = envelope.gacha_name ?? envelope.title ?? envelope.name ?? 'ガチャ';
  const normalized = String(fallback ?? '').trim();
  return normalized || 'ガチャ';
}

function mergeNamazuIntoSnapshot(
  parsed: ParsedNamazuData,
  snapshot: GachaLocalStorageSnapshot,
  stores: DomainStores
): MergeResult {
  const nowIso = new Date().toISOString();
  const existingAppState = snapshot.appState;
  const gachaId = resolveGachaId(existingAppState, parsed.displayName);

  const nextAppState = buildNextAppState(existingAppState, gachaId, parsed.displayName, nowIso);
  const rarityResult = buildNextRarityState(snapshot.rarityState, gachaId, parsed.rarities, nowIso);
  const catalogResult = buildNextCatalogState(
    snapshot.catalogState,
    gachaId,
    parsed.items,
    rarityResult.rarityIdByLabel,
    nowIso
  );
  const profilesResult = buildNextUserProfiles(
    snapshot.userProfiles,
    parsed.history,
    nowIso,
    stores.userProfiles
  );
  const pullHistoryState = buildNextPullHistory(
    snapshot.pullHistory,
    gachaId,
    parsed.history,
    rarityResult.rarityIdByLabel,
    catalogResult.itemIdByCode,
    nowIso,
    stores.userProfiles
  );

  const projection = projectInventories({
    pullHistory: pullHistoryState,
    catalogState: catalogResult.state,
    legacyInventories: snapshot.userInventories,
    now: nowIso
  });

  const nextSnapshot: GachaLocalStorageSnapshot = {
    ...snapshot,
    appState: nextAppState,
    rarityState: rarityResult.state,
    catalogState: catalogResult.state,
    userProfiles: profilesResult,
    userInventories: projection.state,
    pullHistory: pullHistoryState
  };

  return {
    snapshot: nextSnapshot,
    gachaId,
    displayName: parsed.displayName
  };
}

function resolveGachaId(appState: GachaAppStateV3 | undefined, displayName: string): string {
  if (appState?.meta) {
    for (const [gachaId, meta] of Object.entries(appState.meta)) {
      if (meta?.displayName === displayName) {
        return gachaId;
      }
    }
  }
  const seed = displayName || `gacha-${Date.now()}`;
  return generateDeterministicGachaId(seed);
}

function buildNextAppState(
  previous: GachaAppStateV3 | undefined,
  gachaId: string,
  displayName: string,
  nowIso: string
): GachaAppStateV3 {
  const base: GachaAppStateV3 = previous
    ? {
        ...previous,
        meta: { ...(previous.meta ?? {}) },
        order: Array.isArray(previous.order) ? [...previous.order] : []
      }
    : {
        version: 3,
        updatedAt: nowIso,
        meta: {},
        order: [],
        selectedGachaId: null
      };

  const existingMeta = base.meta[gachaId];
  if (existingMeta) {
    base.meta[gachaId] = {
      ...existingMeta,
      id: gachaId,
      displayName,
      updatedAt: nowIso
    };
  } else {
    base.meta[gachaId] = {
      id: gachaId,
      displayName,
      createdAt: nowIso,
      updatedAt: nowIso
    };
  }

  if (!base.order.includes(gachaId)) {
    base.order.push(gachaId);
  }

  base.selectedGachaId = gachaId;
  base.updatedAt = nowIso;

  return base;
}

function buildNextRarityState(
  previous: GachaRarityStateV3 | undefined,
  gachaId: string,
  rarities: ParsedRarity[],
  nowIso: string
): { state: GachaRarityStateV3; rarityIdByLabel: Map<string, string> } {
  const base: GachaRarityStateV3 = previous
    ? {
        ...previous,
        byGacha: { ...(previous.byGacha ?? {}) },
        entities: { ...(previous.entities ?? {}) },
        indexByName: { ...(previous.indexByName ?? {}) }
      }
    : {
        version: 3,
        updatedAt: nowIso,
        byGacha: {},
        entities: {},
        indexByName: {}
      };

  const rarityIdByLabel = new Map<string, string>();
  const weights = rarities.map((rarity) => Math.max(0, rarity.weight));
  const totalWeight = weights.reduce((sum, value) => sum + value, 0);

  rarities.forEach((rarity, index) => {
    const rarityId = generateDeterministicRarityId(`${gachaId}-${rarity.label}`);
    rarityIdByLabel.set(rarity.label, rarityId);

    base.entities[rarityId] = {
      id: rarityId,
      gachaId,
      label: rarity.label,
      color: DEFAULT_RARITY_COLORS[rarity.label] ?? FALLBACK_RARITY_COLOR,
      sortOrder: index,
      emitRate: totalWeight > 0 ? weights[index] / totalWeight : undefined,
      updatedAt: nowIso
    } satisfies GachaRarityEntityV3;
  });

  base.byGacha[gachaId] = rarities.map((rarity) => rarityIdByLabel.get(rarity.label) ?? '');
  base.indexByName[gachaId] = rarities.reduce<Record<string, string>>((acc, rarity) => {
    const rarityId = rarityIdByLabel.get(rarity.label);
    if (rarityId) {
      acc[rarity.label] = rarityId;
    }
    return acc;
  }, {});

  base.updatedAt = nowIso;

  return { state: base, rarityIdByLabel };
}

function buildNextCatalogState(
  previous: GachaCatalogStateV3 | undefined,
  gachaId: string,
  items: ParsedItem[],
  rarityIdByLabel: Map<string, string>,
  nowIso: string
): { state: GachaCatalogStateV3; itemIdByCode: Map<string, string> } {
  const base: GachaCatalogStateV3 = previous
    ? {
        ...previous,
        byGacha: { ...(previous.byGacha ?? {}) }
      }
    : {
        version: 3,
        updatedAt: nowIso,
        byGacha: {}
      };

  const itemIdByCode = new Map<string, string>();
  const catalogItems: Record<string, GachaCatalogItemV3> = {};
  const order: string[] = [];

  items.forEach((item, index) => {
    const rarityId = rarityIdByLabel.get(item.rarityLabel) ?? generateDeterministicRarityId(`${gachaId}-${item.rarityLabel}`);
    const itemId = generateDeterministicItemId(`${gachaId}-${item.code}`);
    itemIdByCode.set(item.code, itemId);

    catalogItems[itemId] = {
      itemId,
      rarityId,
      name: item.code,
      order: index + 1,
      pickupTarget: false,
      completeTarget: false,
      updatedAt: nowIso
    };
    order.push(itemId);
  });

  base.byGacha[gachaId] = {
    order,
    items: catalogItems
  };
  base.updatedAt = nowIso;

  return { state: base, itemIdByCode };
}

function buildNextUserProfiles(
  previous: UserProfilesStateV3 | undefined,
  history: ParsedHistoryEntry[],
  nowIso: string,
  userProfileStore: UserProfileStore
): UserProfilesStateV3 {
  const ensureBaseState = (): UserProfilesStateV3 => {
    const existing = userProfileStore.getState();
    if (existing) {
      return existing;
    }

    const baseline: UserProfilesStateV3 = previous
      ? {
          ...previous,
          users: { ...(previous.users ?? {}) },
          updatedAt: previous.updatedAt ?? nowIso
        }
      : {
          version: 3,
          updatedAt: nowIso,
          users: {}
        };

    return userProfileStore.setState(baseline, { persist: 'none' }) ?? baseline;
  };

  let currentState = ensureBaseState();

  history.forEach((entry) => {
    const trimmedName = entry.userName.trim();
    if (!trimmedName) {
      return;
    }
    userProfileStore.ensureProfile(trimmedName, { persist: 'none' });
  });

  currentState = userProfileStore.getState() ?? ensureBaseState();

  return currentState;
}

function normalizePullHistoryState(
  previous: PullHistoryStateV1 | undefined,
  nowIso: string
): PullHistoryStateV1 {
  if (!previous || previous.version !== 1) {
    return {
      version: 1,
      updatedAt: nowIso,
      order: [],
      pulls: {}
    } satisfies PullHistoryStateV1;
  }

  const pulls: Record<string, PullHistoryEntryV1> = {};
  const order: string[] = [];
  const seen = new Set<string>();

  const orderedIds = Array.isArray(previous.order) ? previous.order : [];
  orderedIds.forEach((id) => {
    if (typeof id !== 'string' || id.length === 0 || seen.has(id)) {
      return;
    }
    const entry = previous.pulls?.[id];
    if (!entry) {
      return;
    }
    pulls[id] = { ...entry, source: entry.source ?? 'insiteResult' };
    order.push(id);
    seen.add(id);
  });

  Object.entries(previous.pulls ?? {}).forEach(([id, entry]) => {
    if (!entry || seen.has(id)) {
      return;
    }
    pulls[id] = { ...entry, source: entry.source ?? 'insiteResult' };
    order.push(id);
    seen.add(id);
  });

  return {
    version: 1,
    updatedAt: previous.updatedAt ?? nowIso,
    order,
    pulls
  } satisfies PullHistoryStateV1;
}

function buildNextPullHistory(
  previous: PullHistoryStateV1 | undefined,
  gachaId: string,
  history: ParsedHistoryEntry[],
  rarityIdByLabel: Map<string, string>,
  itemIdByCode: Map<string, string>,
  nowIso: string,
  userProfileStore: UserProfileStore
): PullHistoryStateV1 | undefined {
  const normalized = normalizePullHistoryState(previous, nowIso);

  const retainedPulls: Record<string, PullHistoryEntryV1> = {};
  const retainedOrder: string[] = [];
  const seen = new Set<string>();

  const shouldRemoveEntry = (entry: PullHistoryEntryV1 | undefined): boolean => {
    if (!entry) {
      return false;
    }
    if (entry.gachaId !== gachaId) {
      return false;
    }
    return entry.source === undefined || entry.source === 'insiteResult';
  };

  normalized.order.forEach((id) => {
    if (typeof id !== 'string' || id.length === 0 || seen.has(id)) {
      return;
    }
    const entry = normalized.pulls[id];
    if (!entry || shouldRemoveEntry(entry)) {
      return;
    }
    retainedPulls[id] = entry;
    retainedOrder.push(id);
    seen.add(id);
  });

  Object.entries(normalized.pulls).forEach(([id, entry]) => {
    if (!entry || seen.has(id) || shouldRemoveEntry(entry)) {
      return;
    }
    retainedPulls[id] = entry;
    retainedOrder.push(id);
    seen.add(id);
  });

  const newEntries: Array<{ id: string; entry: PullHistoryEntryV1 }> = [];
  const baseTimestamp = Date.parse(nowIso);
  const timestampFallback = Number.isFinite(baseTimestamp) ? baseTimestamp : Date.now();

  history.forEach((record, index) => {
    const userId = userProfileStore.ensureProfile(record.userName, { persist: 'none' });
    if (!userId) {
      return;
    }
    const itemCounts: Record<string, number> = {};
    const rarityCounts: Record<string, number> = {};
    let totalCount = 0;

    record.items.forEach((item) => {
      const normalizedCount = Math.max(0, Math.floor(item.count));
      if (normalizedCount === 0) {
        return;
      }

      const itemId =
        itemIdByCode.get(item.code) ?? generateDeterministicItemId(`${gachaId}-${item.code}`);
      const rarityId =
        rarityIdByLabel.get(item.rarityLabel) ??
        generateDeterministicRarityId(`${gachaId}-${item.rarityLabel}`);

      itemCounts[itemId] = (itemCounts[itemId] ?? 0) + normalizedCount;
      rarityCounts[rarityId] = (rarityCounts[rarityId] ?? 0) + normalizedCount;
      totalCount += normalizedCount;
    });

    if (totalCount === 0) {
      return;
    }

    const entryId = generateDeterministicPullId(`${gachaId}:${userId}:${index}`);
    const executedAtMillis = timestampFallback - index * 1000;
    const executedAt = new Date(executedAtMillis).toISOString();

    const entry: PullHistoryEntryV1 = {
      id: entryId,
      gachaId,
      userId,
      executedAt,
      pullCount: Math.max(totalCount, 1),
      currencyUsed: 0,
      itemCounts,
      rarityCounts: Object.keys(rarityCounts).length > 0 ? rarityCounts : undefined,
      source: 'insiteResult'
    };

    newEntries.push({ id: entryId, entry });
  });

  const nextPulls: Record<string, PullHistoryEntryV1> = { ...retainedPulls };
  const nextOrder: string[] = [];
  const orderSeen = new Set<string>();

  newEntries.forEach(({ id, entry }) => {
    nextPulls[id] = entry;
    if (!orderSeen.has(id)) {
      nextOrder.push(id);
      orderSeen.add(id);
    }
  });

  retainedOrder.forEach((id) => {
    if (!orderSeen.has(id)) {
      nextOrder.push(id);
      orderSeen.add(id);
    }
  });

  if (nextOrder.length === 0) {
    return undefined;
  }

  return {
    version: 1,
    updatedAt: nowIso,
    order: nextOrder,
    pulls: nextPulls
  } satisfies PullHistoryStateV1;
}
