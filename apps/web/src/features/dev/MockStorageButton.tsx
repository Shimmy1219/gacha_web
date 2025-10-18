import { useCallback, useState } from 'react';

import { GACHA_STORAGE_UPDATED_EVENT } from '../storage/useGachaLocalStorage';

type StorageEntry = {
  key: string;
  value: unknown;
};

type GachaSeed = {
  slug: string;
  displayName: string;
  iconAssetId: string;
};

type GachaDefinition = GachaSeed & {
  id: string;
};

type ItemSeed = {
  name: string;
  series: string;
  riagu?: boolean;
};

type ItemDefinition = {
  itemId: string;
  gachaId: string;
  rarityId: string;
  order: number;
  name: string;
  completeTarget: boolean;
  pickupTarget: boolean;
  imageAssetId: string;
  riagu: boolean;
  series: string;
};

type GachaMetaSnapshot = {
  id: string;
  displayName: string;
  iconAssetId: string;
  createdAt: string;
  updatedAt: string;
};

type CatalogItemSnapshot = {
  itemId: string;
  rarityId: string;
  name: string;
  order: number;
  pickupTarget: boolean;
  completeTarget: boolean;
  imageAssetId: string;
  riagu: boolean;
  series: string;
  updatedAt: string;
};

type CatalogGachaSnapshot = {
  order: string[];
  items: Record<string, CatalogItemSnapshot>;
};

type UserSeed = {
  displayName: string;
  handle: string;
  team: string;
};

const BASE62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

function makeDeterministicId(prefix: string, seed: string, length = 10): string {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 33 + seed.charCodeAt(index)) >>> 0;
  }

  let value = hash || 1;
  let suffix = '';

  for (let position = 0; position < length; position += 1) {
    value = (value * 1664525 + 1013904223) >>> 0;
    suffix += BASE62[value % BASE62.length];
  }

  return `${prefix}${suffix}`;
}

const GACHA_SEEDS: GachaSeed[] = [
  {
    slug: 'aurora-arc',
    displayName: 'オーロラアーク',
    iconAssetId: 'asset-aurora'
  },
  {
    slug: 'cosmos-diva',
    displayName: 'コスモスディーヴァ',
    iconAssetId: 'asset-cosmos'
  },
  {
    slug: 'echo-tide',
    displayName: 'エコータイド',
    iconAssetId: 'asset-echo'
  },
  {
    slug: 'mistral-note',
    displayName: 'ミストラルノート',
    iconAssetId: 'asset-mistral'
  }
];

const GACHA_DEFINITIONS: GachaDefinition[] = GACHA_SEEDS.map((seed) => ({
  ...seed,
  id: makeDeterministicId('gch-', seed.slug)
}));

const RARITY_TEMPLATES = [
  { code: 'legend', label: 'レジェンド', color: '#facc15', emitRate: 0.02, shortName: 'LEG' },
  { code: 'premium', label: 'プレミア', color: '#a855f7', emitRate: 0.18, shortName: 'PRE' },
  { code: 'standard', label: 'スタンダード', color: '#38bdf8', emitRate: 0.8, shortName: 'STD' }
] as const;

const ITEM_SETS: Record<string, ItemSeed[]> = {
  'aurora-arc': [
    {
      name: '極光のティアラ',
      series: 'AURORA JEWELRY',
      riagu: true
    },
    {
      name: '氷晶の羽飾り',
      series: 'AURORA ACCESSORY'
    },
    {
      name: '夜明けの手紙',
      series: 'AURORA POST'
    }
  ],
  'cosmos-diva': [
    {
      name: '星雲ステージパス',
      series: 'COSMOS LIVE',
      riagu: true
    },
    {
      name: '流星のピアス',
      series: 'COSMOS JEWELRY'
    },
    {
      name: '銀河レコード',
      series: 'COSMOS RECORDS'
    }
  ],
  'echo-tide': [
    {
      name: '潮騒サウンドボックス',
      series: 'ECHO MUSIC'
    },
    {
      name: '泡沫のミニキーホルダー',
      series: 'ECHO GOODS',
      riagu: true
    },
    {
      name: '浜辺のポラロイド',
      series: 'ECHO PHOTO'
    }
  ],
  'mistral-note': [
    {
      name: '風歌マイクロフォン',
      series: 'MISTRAL AUDIO'
    },
    {
      name: '空渡りのブレスレット',
      series: 'MISTRAL ACCESSORY',
      riagu: true
    },
    {
      name: '木漏れ日のスコア',
      series: 'MISTRAL SCORE'
    }
  ]
};

const USER_SEEDS: UserSeed[] = [
  { displayName: '綾瀬 ひかり', handle: 'ayase', team: '北ブロック' },
  { displayName: '南雲 遼', handle: 'nagumo', team: '南ブロック' },
  { displayName: '東雲 澪', handle: 'shinonome', team: '東ブロック' },
  { displayName: '西園 迅', handle: 'saionji', team: '西ブロック' },
  { displayName: '真白 こはく', handle: 'mashiro', team: '管理チーム' },
  { displayName: '久遠 つばさ', handle: 'kuon', team: '北ブロック' },
  { displayName: '朝霧 颯太', handle: 'asagiri', team: '南ブロック' },
  { displayName: '氷室 朱音', handle: 'himuro', team: '東ブロック' },
  { displayName: '燈矢 陽', handle: 'touya', team: 'PRチーム' },
  { displayName: '霧島 柚葉', handle: 'kirishima', team: 'サポート' }
];

function createMockEntries(): StorageEntry[] {
  const now = new Date();
  const nowIso = now.toISOString();
  const nextWeekIso = new Date(now.getTime() + 1000 * 60 * 60 * 24 * 7).toISOString();

  const gachaOrder = GACHA_DEFINITIONS.map((gacha) => gacha.id);

  const appState = {
    version: 3,
    updatedAt: nowIso,
    meta: GACHA_DEFINITIONS.reduce<Record<string, GachaMetaSnapshot>>((acc, gacha) => {
      acc[gacha.id] = {
        id: gacha.id,
        displayName: gacha.displayName,
        iconAssetId: gacha.iconAssetId,
        createdAt: nowIso,
        updatedAt: nowIso
      };
      return acc;
    }, {}),
    order: gachaOrder,
    selectedGachaId: gachaOrder[0] ?? null
  };

  const rarityEntities: Record<string, Record<string, unknown>> = {};
  const rarityByGacha: Record<string, string[]> = {};
  const rarityIndexByName: Record<string, Record<string, string>> = {};

  GACHA_DEFINITIONS.forEach((gacha) => {
    const rarityIds = RARITY_TEMPLATES.map((template, templateIndex) => {
      const rarityId = makeDeterministicId('rar-', `${gacha.id}-${template.code}`);
      rarityEntities[rarityId] = {
        id: rarityId,
        gachaId: gacha.id,
        label: template.label,
        shortName: template.shortName,
        color: template.color,
        emitRate: template.emitRate,
        sortOrder: templateIndex,
        updatedAt: nowIso
      };
      return rarityId;
    });

    rarityByGacha[gacha.id] = rarityIds;
    rarityIndexByName[gacha.id] = RARITY_TEMPLATES.reduce<Record<string, string>>((acc, template, templateIndex) => {
      const rarityId = rarityIds[templateIndex];
      acc[template.label] = rarityId;
      acc[template.shortName] = rarityId;
      return acc;
    }, {});
  });

  const rarityState = {
    version: 3,
    updatedAt: nowIso,
    byGacha: rarityByGacha,
    entities: rarityEntities,
    indexByName: rarityIndexByName
  };

  const itemDefinitions: ItemDefinition[] = GACHA_DEFINITIONS.flatMap((gacha) => {
    const seeds = ITEM_SETS[gacha.slug] ?? [];
    return seeds.map((seed, index) => {
      const rarityIds = rarityByGacha[gacha.id];
      const rarityId = rarityIds[Math.min(index, rarityIds.length - 1)];
      return {
        itemId: makeDeterministicId('itm-', `${gacha.id}-${seed.name}`),
        gachaId: gacha.id,
        rarityId,
        order: index + 1,
        name: seed.name,
        completeTarget: index === 0,
        pickupTarget: index < 2,
        imageAssetId: `${gacha.iconAssetId}-${index + 1}`,
        riagu: Boolean(seed.riagu),
        series: seed.series
      };
    });
  });

  const catalogState = {
    version: 3,
    updatedAt: nowIso,
    byGacha: GACHA_DEFINITIONS.reduce<Record<string, CatalogGachaSnapshot>>((acc, gacha) => {
      const gachaItems = itemDefinitions.filter((item) => item.gachaId === gacha.id);
      acc[gacha.id] = {
        order: gachaItems.map((item) => item.itemId),
        items: gachaItems.reduce<Record<string, CatalogItemSnapshot>>((itemsAcc, item) => {
          itemsAcc[item.itemId] = {
            itemId: item.itemId,
            rarityId: item.rarityId,
            name: item.name,
            order: item.order,
            pickupTarget: item.pickupTarget,
            completeTarget: item.completeTarget,
            imageAssetId: item.imageAssetId,
            riagu: item.riagu,
            series: item.series,
            updatedAt: nowIso
          };
          return itemsAcc;
        }, {})
      };
      return acc;
    }, {})
  };

  const userAccentPalette = ['#4f46e5', '#f97316', '#14b8a6', '#facc15', '#ec4899', '#0ea5e9'];

  const userProfiles = USER_SEEDS.reduce<Record<string, Record<string, unknown>>>((acc, seed, index) => {
    const id = makeDeterministicId('usr-', seed.handle);
    acc[id] = {
      id,
      displayName: seed.displayName,
      handle: seed.handle,
      team: seed.team,
      role: index % 3 === 0 ? 'STAFF' : 'PLAYER',
      accentColor: userAccentPalette[index % userAccentPalette.length],
      joinedAt: nowIso
    };
    return acc;
  }, {});

  const userProfilesState = {
    version: 3,
    updatedAt: nowIso,
    users: userProfiles
  };

  const itemsByGacha = itemDefinitions.reduce<Record<string, ItemDefinition[]>>((acc, item) => {
    acc[item.gachaId] = acc[item.gachaId] ?? [];
    acc[item.gachaId].push(item);
    return acc;
  }, {});

  Object.values(itemsByGacha).forEach((list) => {
    list.sort((a, b) => a.order - b.order);
  });

  const userIds = Object.keys(userProfiles);
  const inventories: Record<string, Record<string, unknown>> = {};
  const reverseIndex: Record<string, Array<{ userId: string; gachaId: string; rarityId: string; count: number }>> = {};

  userIds.forEach((userId, userIndex) => {
    const assignedGachas = [
      GACHA_DEFINITIONS[userIndex % GACHA_DEFINITIONS.length],
      GACHA_DEFINITIONS[(userIndex + 1) % GACHA_DEFINITIONS.length]
    ];

    const gachaInventories: Record<string, Record<string, unknown>> = {};

    assignedGachas.forEach((gacha, assignmentIndex) => {
      const gachaItems = itemsByGacha[gacha.id] ?? [];
      const selections = gachaItems.slice(0, 3).map((item, itemIndex) => {
        const count = ((userIndex + itemIndex + assignmentIndex) % 4) + 1;
        return {
          itemId: item.itemId,
          rarityId: item.rarityId,
          count
        };
      });

      const totalCount = selections.reduce((sum, entry) => sum + entry.count, 0);
      const itemsMap: Record<string, string[]> = {};
      const countsMap: Record<string, Record<string, number>> = {};

      selections.forEach((entry) => {
        if (!itemsMap[entry.rarityId]) {
          itemsMap[entry.rarityId] = [];
        }
        itemsMap[entry.rarityId].push(entry.itemId);

        if (!countsMap[entry.rarityId]) {
          countsMap[entry.rarityId] = {};
        }
        countsMap[entry.rarityId][entry.itemId] = entry.count;
      });

      gachaInventories[gacha.id] = {
        inventoryId: makeDeterministicId('inv-', `${userId}-${gacha.id}`),
        gachaId: gacha.id,
        createdAt: nowIso,
        updatedAt: nowIso,
        totalCount,
        items: itemsMap,
        counts: countsMap,
        notes: `${gacha.displayName}のサンプル在庫`
      };

      selections.forEach((entry) => {
        if (!reverseIndex[entry.itemId]) {
          reverseIndex[entry.itemId] = [];
        }
        reverseIndex[entry.itemId].push({
          userId,
          gachaId: gacha.id,
          rarityId: entry.rarityId,
          count: entry.count
        });
      });
    });

    inventories[userId] = gachaInventories;
  });

  const userInventoriesState = {
    version: 3,
    updatedAt: nowIso,
    inventories,
    byItemId: reverseIndex
  };

  const hitCounts = Object.entries(reverseIndex).reduce<Record<string, number>>((acc, [itemId, entries]) => {
    const total = entries.reduce((sum, entry) => sum + Number(entry.count ?? 0), 0);
    acc[itemId] = total;
    return acc;
  }, {});

  const hitCountsState = {
    version: 3,
    updatedAt: nowIso,
    byItemId: hitCounts
  };

  const riaguCandidates = itemDefinitions.filter((item) => item.riagu);

  const riaguEntries = riaguCandidates.map((item, index) => {
    const riaguId = makeDeterministicId('riagu-', `${item.itemId}-${index}`);
    return [
      riaguId,
      {
        id: riaguId,
        itemId: item.itemId,
        gachaId: item.gachaId,
        unitCost: 1200 + index * 150,
        typeLabel: index % 2 === 0 ? 'ぬいぐるみ' : 'アクリルスタンド',
        orderHint: index + 1,
        stock: 48 - index * 2,
        notes: 'React移行用のダミーリアグデータ',
        updatedAt: nowIso
      }
    ] as const;
  });

  const riaguState = {
    version: 3,
    updatedAt: nowIso,
    riaguCards: Object.fromEntries(riaguEntries),
    indexByItemId: riaguEntries.reduce<Record<string, string>>((acc, [riaguId, card]) => {
      acc[card.itemId as string] = riaguId;
      return acc;
    }, {})
  };

  const ptSettingsByGacha = GACHA_DEFINITIONS.reduce<Record<string, Record<string, unknown>>>((acc, gacha, index) => {
    const rarityIds = rarityByGacha[gacha.id];
    acc[gacha.id] = {
      perPull: {
        price: 300,
        pulls: 1
      },
      complete: {
        price: 9000 + index * 400
      },
      bundles: [
        {
          id: makeDeterministicId('bndl-', `${gacha.id}-10`),
          price: 3000 + index * 120,
          pulls: 10
        },
        {
          id: makeDeterministicId('bndl-', `${gacha.id}-20`),
          price: 5800 + index * 160,
          pulls: 20
        }
      ],
      guarantees: [
        {
          id: makeDeterministicId('ptg-', `${gacha.id}-top`),
          rarityId: rarityIds[0],
          threshold: 60,
          pityStep: 10
        },
        {
          id: makeDeterministicId('ptg-', `${gacha.id}-mid`),
          rarityId: rarityIds[1],
          threshold: 30,
          pityStep: 10
        }
      ],
      updatedAt: nowIso
    };
    return acc;
  }, {});

  const ptSettingsState = {
    version: 3,
    updatedAt: nowIso,
    byGachaId: ptSettingsByGacha
  };

  const uiPreferences = {
    version: 3,
    updatedAt: nowIso,
    dashboard: {
      desktop: 'items',
      mobile: 'rarity'
    },
    toolbar: {
      hideMiss: false,
      showCounts: true,
      showSkipOnly: false,
      userSearch: '',
      subcontrolsCollapsed: false
    },
    users: {
      filter: {
        query: '',
        selectedGachaIds: gachaOrder.slice(0, 2),
        selectedRarityIds: [],
        includeCompleted: true,
        tags: ['demo']
      }
    },
    riagu: {
      selectedGachaId: gachaOrder[1] ?? null
    },
    lastSeenRelease: '2024.10-preview'
  };

  const primaryUserId = userIds[0] ?? makeDeterministicId('usr-', 'primary');

  const saveOptions = {
    version: 3,
    key: 'mock-session',
    shareUrl: 'https://example.com/mock/share',
    downloadUrl: 'https://example.com/mock/download.zip',
    expiresAt: nextWeekIso,
    pathname: '/share/mock-session',
    savedAt: nowIso
  };

  const receiveHistory = {
    version: 3,
    completedKeys: ['mock-key-001', 'mock-key-002', 'mock-key-003'],
    lastCompletedAt: nowIso
  };

  const receivePrefs = {
    version: 3,
    intro: {
      skipIntro: true,
      lastConfirmedAt: nowIso
    }
  };

  const entries: StorageEntry[] = [
    { key: 'gacha:app-state:v3', value: appState },
    { key: 'gacha:catalog-state:v3', value: catalogState },
    { key: 'gacha:rarity-state:v3', value: rarityState },
    { key: 'gacha:user-inventories:v3', value: userInventoriesState },
    { key: 'gacha:user-profiles:v3', value: userProfilesState },
    { key: 'gacha:hit-counts:v3', value: hitCountsState },
    { key: 'gacha:riagu-state:v3', value: riaguState },
    { key: 'gacha:pt-settings:v3', value: ptSettingsState },
    { key: 'gacha:ui-preferences:v3', value: uiPreferences },
    { key: `gacha:save-options:last-upload:v3:${primaryUserId}`, value: saveOptions },
    { key: 'gacha:receive:history:v3', value: receiveHistory },
    { key: 'gacha:receive:prefs:v3', value: receivePrefs }
  ];

  return entries;
}

export function MockStorageButton(): JSX.Element {
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string>('');

  const handleInsertMockData = useCallback(() => {
    if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
      setStatus('error');
      setErrorMessage('ブラウザ環境ではありません');
      return;
    }

    try {
      const entries = createMockEntries();
      entries.forEach(({ key, value }) => {
        window.localStorage.setItem(key, JSON.stringify(value));
      });
      window.dispatchEvent(new Event(GACHA_STORAGE_UPDATED_EVENT));
      setStatus('success');
      setErrorMessage('');
      console.info('ローカルストレージに仮データを保存しました', entries.map((entry) => entry.key));
    } catch (error) {
      console.error('ローカルストレージへの仮データ保存に失敗しました', error);
      setStatus('error');
      setErrorMessage(error instanceof Error ? error.message : String(error));
    }
  }, []);

  return (
    <div className="mock-storage-button flex flex-col gap-4 text-sm">
      <div className="space-y-1">
        <h2 className="text-base font-semibold text-surface-foreground">ローカルストレージ仮データ</h2>
        <p className="text-xs leading-relaxed text-muted-foreground">
          React移行用のv3スキーマに沿ったダミーデータをローカルストレージへ保存します。既存のデータは上書きされます。
        </p>
      </div>
      <button
        type="button"
        onClick={handleInsertMockData}
        className="inline-flex items-center justify-center gap-2 rounded-full border border-border/50 bg-[#23232b] px-5 py-2 text-xs font-semibold text-surface-foreground transition hover:bg-[#2f2f39]"
      >
        仮データを生成
      </button>
      {status === 'success' ? (
        <p className="text-xs text-emerald-400">v3スキーマ準拠の仮データを保存しました。</p>
      ) : null}
      {status === 'error' ? (
        <p className="text-xs text-rose-400">保存に失敗しました: {errorMessage}</p>
      ) : null}
    </div>
  );
}
