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
import type { DomainStores } from '@domain/stores/createDomainStores';
import {
  generateDeterministicGachaId,
  generateDeterministicInventoryId,
  generateDeterministicItemId,
  generateDeterministicRarityId,
  generateDeterministicUserId
} from '@domain/idGenerators';

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
  const merged = mergeNamazuIntoSnapshot(parsed, snapshot);

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
  if (merged.snapshot.userInventories) {
    context.stores.userInventories.setState(merged.snapshot.userInventories, { persist: 'none' });
  }

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

  const { inflateRaw, inflate } = await import('pako');

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

function mergeNamazuIntoSnapshot(parsed: ParsedNamazuData, snapshot: GachaLocalStorageSnapshot): MergeResult {
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
  const profilesResult = buildNextUserProfiles(snapshot.userProfiles, parsed.history, nowIso);
  const inventoriesResult = buildNextUserInventories(
    snapshot.userInventories,
    gachaId,
    parsed.history,
    rarityResult.rarityIdByLabel,
    catalogResult.itemIdByCode,
    nowIso
  );

  const nextSnapshot: GachaLocalStorageSnapshot = {
    ...snapshot,
    appState: nextAppState,
    rarityState: rarityResult.state,
    catalogState: catalogResult.state,
    userProfiles: profilesResult,
    userInventories: inventoriesResult.state
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
  nowIso: string
): UserProfilesStateV3 {
  const base: UserProfilesStateV3 = previous
    ? {
        ...previous,
        users: { ...(previous.users ?? {}) }
      }
    : {
        version: 3,
        updatedAt: nowIso,
        users: {}
      };

  history.forEach((entry) => {
    const userId = generateDeterministicUserId(entry.userName);
    base.users[userId] = {
      id: userId,
      displayName: entry.userName,
      updatedAt: nowIso
    };
  });

  base.updatedAt = nowIso;
  return base;
}

function buildNextUserInventories(
  previous: UserInventoriesStateV3 | undefined,
  gachaId: string,
  history: ParsedHistoryEntry[],
  rarityIdByLabel: Map<string, string>,
  itemIdByCode: Map<string, string>,
  nowIso: string
): {
  state: UserInventoriesStateV3;
  itemEntries: Map<string, Array<{ userId: string; rarityId: string; count: number }>>;
} {
  const base: UserInventoriesStateV3 = previous
    ? {
        ...previous,
        inventories: { ...(previous.inventories ?? {}) },
        byItemId: { ...(previous.byItemId ?? {}) }
      }
    : {
        version: 3,
        updatedAt: nowIso,
        inventories: {},
        byItemId: {}
      };

  const aggregatedByItem = new Map<string, Array<{ userId: string; rarityId: string; count: number }>>();

  history.forEach((entry) => {
    const userId = generateDeterministicUserId(entry.userName);
    const inventoryId = generateDeterministicInventoryId(`${userId}-${gachaId}`);

    const userInventories = { ...(base.inventories[userId] ?? {}) };

    for (const [existingInventoryId, snapshot] of Object.entries(userInventories)) {
      if (snapshot?.gachaId === gachaId && existingInventoryId !== inventoryId) {
        delete userInventories[existingInventoryId];
      }
    }

    const itemsByRarity: Record<string, string[]> = {};
    const countsByRarity: Record<string, Record<string, number>> = {};
    let totalCount = 0;

    entry.items.forEach((item) => {
      const rarityId = rarityIdByLabel.get(item.rarityLabel) ?? generateDeterministicRarityId(`${gachaId}-${item.rarityLabel}`);
      const itemId = itemIdByCode.get(item.code) ?? generateDeterministicItemId(`${gachaId}-${item.code}`);

      if (!itemsByRarity[rarityId]) {
        itemsByRarity[rarityId] = [];
      }
      if (!countsByRarity[rarityId]) {
        countsByRarity[rarityId] = {};
      }

      for (let index = 0; index < item.count; index += 1) {
        itemsByRarity[rarityId].push(itemId);
      }

      countsByRarity[rarityId][itemId] = (countsByRarity[rarityId][itemId] ?? 0) + item.count;
      totalCount += item.count;

      if (!aggregatedByItem.has(itemId)) {
        aggregatedByItem.set(itemId, []);
      }
      aggregatedByItem.get(itemId)?.push({ userId, rarityId, count: item.count });
    });

    Object.values(itemsByRarity).forEach((list) => {
      list.sort((a, b) => a.localeCompare(b, 'ja'));
    });

    const snapshot: UserInventorySnapshotV3 = {
      inventoryId,
      gachaId,
      updatedAt: nowIso,
      totalCount,
      items: itemsByRarity,
      counts: countsByRarity
    };

    userInventories[inventoryId] = snapshot;
    base.inventories[userId] = userInventories;
  });

  aggregatedByItem.forEach((entries, itemId) => {
    const existingEntries = Array.isArray(base.byItemId[itemId]) ? base.byItemId[itemId] ?? [] : [];
    const filtered = existingEntries.filter((entry) => entry.gachaId !== gachaId);
    base.byItemId[itemId] = [...filtered, ...entries.map((entry) => ({ ...entry, gachaId }))];
  });

  base.updatedAt = nowIso;

  return { state: base, itemEntries: aggregatedByItem };
}
