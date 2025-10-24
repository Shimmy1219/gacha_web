import { useCallback, useState } from 'react';

import {
  type GachaLocalStorageSnapshot,
  type PullHistoryStateV1,
  type UserInventoriesStateV3,
  type UserInventorySnapshotV3
} from '@domain/app-persistence';
import {
  generateDeterministicGachaId,
  generateDeterministicInventoryId,
  generateDeterministicItemId,
  generateDeterministicPtBundleId,
  generateDeterministicPtGuaranteeId,
  generateDeterministicRarityId,
  generateDeterministicRiaguId,
  generateDeterministicUserId,
  generateDeterministicPullId
} from '@domain/idGenerators';
import { useAppPersistence } from '../storage/AppPersistenceProvider';

type GachaSeed = {
  slug: string;
  displayName: string;
};

type GachaDefinition = GachaSeed & {
  id: string;
};

type ItemSeed = {
  name: string;
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
};

type GachaMetaSnapshot = {
  id: string;
  displayName: string;
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
  updatedAt: string;
};

type CatalogGachaSnapshot = {
  order: string[];
  items: Record<string, CatalogItemSnapshot>;
};

type UserSeed = {
  displayName: string;
  slug: string;
};

const GACHA_SEEDS: GachaSeed[] = [
  {
    slug: 'aurora-arc',
    displayName: 'オーロラアーク'
  },
  {
    slug: 'cosmos-diva',
    displayName: 'コスモスディーヴァ'
  },
  {
    slug: 'echo-tide',
    displayName: 'エコータイド'
  },
  {
    slug: 'mistral-note',
    displayName: 'ミストラルノート'
  }
];

const GACHA_DEFINITIONS: GachaDefinition[] = GACHA_SEEDS.map((seed) => ({
  ...seed,
  id: generateDeterministicGachaId(seed.slug)
}));

const RARITY_TEMPLATES = [
  { code: 'legend', label: 'レジェンド', color: '#facc15', emitRate: 0.02 },
  { code: 'premium', label: 'プレミア', color: '#a855f7', emitRate: 0.18 },
  { code: 'standard', label: 'スタンダード', color: '#38bdf8', emitRate: 0.8 }
] as const;

const ITEM_SETS: Record<string, ItemSeed[]> = {
  'aurora-arc': [
    {
      name: '極光のティアラ',
      riagu: true
    },
    {
      name: '氷晶の羽飾り'
    },
    {
      name: '夜明けの手紙'
    }
  ],
  'cosmos-diva': [
    {
      name: '星雲ステージパス',
      riagu: true
    },
    {
      name: '流星のピアス'
    },
    {
      name: '銀河レコード'
    }
  ],
  'echo-tide': [
    {
      name: '潮騒サウンドボックス'
    },
    {
      name: '泡沫のミニキーホルダー',
      riagu: true
    },
    {
      name: '浜辺のポラロイド'
    }
  ],
  'mistral-note': [
    {
      name: '風歌マイクロフォン'
    },
    {
      name: '空渡りのブレスレット',
      riagu: true
    },
    {
      name: '木漏れ日のスコア'
    }
  ]
};

const USER_SEEDS: UserSeed[] = [
  { displayName: '綾瀬 ひかり', slug: 'ayase' },
  { displayName: '南雲 遼', slug: 'nagumo' },
  { displayName: '東雲 澪', slug: 'shinonome' },
  { displayName: '西園 迅', slug: 'saionji' },
  { displayName: '真白 こはく', slug: 'mashiro' },
  { displayName: '久遠 つばさ', slug: 'kuon' },
  { displayName: '朝霧 颯太', slug: 'asagiri' },
  { displayName: '氷室 朱音', slug: 'himuro' },
  { displayName: '燈矢 陽', slug: 'touya' },
  { displayName: '霧島 柚葉', slug: 'kirishima' }
];

function createMockSnapshot(): {
  snapshot: GachaLocalStorageSnapshot;
  saveOptionsUserIds: string[];
} {
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
      const rarityId = generateDeterministicRarityId(`${gacha.id}-${template.code}`);
      rarityEntities[rarityId] = {
        id: rarityId,
        gachaId: gacha.id,
        label: template.label,
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
        itemId: generateDeterministicItemId(`${gacha.id}-${seed.name}`),
        gachaId: gacha.id,
        rarityId,
        order: index + 1,
        name: seed.name,
        completeTarget: index === 0,
        pickupTarget: index < 2,
        imageAssetId: `${gacha.slug}-item-${index + 1}`,
        riagu: Boolean(seed.riagu)
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
            updatedAt: nowIso
          };
          return itemsAcc;
        }, {})
      };
      return acc;
    }, {})
  };

  const userProfiles = USER_SEEDS.reduce<Record<string, Record<string, unknown>>>((acc, seed) => {
    const id = generateDeterministicUserId(seed.slug);
    acc[id] = {
      id,
      displayName: seed.displayName,
      joinedAt: nowIso,
      updatedAt: nowIso
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
  const inventories: UserInventoriesStateV3['inventories'] = {};
  const reverseIndex: UserInventoriesStateV3['byItemId'] = {};

  userIds.forEach((userId, userIndex) => {
    const assignedGachas = [
      GACHA_DEFINITIONS[userIndex % GACHA_DEFINITIONS.length],
      GACHA_DEFINITIONS[(userIndex + 1) % GACHA_DEFINITIONS.length]
    ];

    const userInventories: Record<string, UserInventorySnapshotV3> = {};

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

      const inventoryId = generateDeterministicInventoryId(`${userId}-${gacha.id}`);

      userInventories[inventoryId] = {
        inventoryId,
        gachaId: gacha.id,
        createdAt: nowIso,
        updatedAt: nowIso,
        totalCount,
        items: itemsMap,
        counts: countsMap
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

    inventories[userId] = userInventories;
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
    const riaguId = generateDeterministicRiaguId(`${item.itemId}-${index}`);
    return [
      riaguId,
      {
        id: riaguId,
        itemId: item.itemId,
        gachaId: item.gachaId,
        unitCost: 1200 + index * 150,
        typeLabel: index % 2 === 0 ? 'ぬいぐるみ' : 'アクリルスタンド',
        orderHint: index + 1,
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
          id: generateDeterministicPtBundleId(`${gacha.id}-10`),
          price: 3000 + index * 120,
          pulls: 10
        },
        {
          id: generateDeterministicPtBundleId(`${gacha.id}-20`),
          price: 5800 + index * 160,
          pulls: 20
        }
      ],
      guarantees: [
        {
          id: generateDeterministicPtGuaranteeId(`${gacha.id}-top`),
          rarityId: rarityIds[0],
          threshold: 60,
          pityStep: 10
        },
        {
          id: generateDeterministicPtGuaranteeId(`${gacha.id}-mid`),
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

  const primaryUserId = userIds[0] ?? generateDeterministicUserId('primary');

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

  const pullHistoryEntries = GACHA_DEFINITIONS.slice(0, 3).map((gacha, index) => {
    const entryId = generateDeterministicPullId(`${gacha.id}-pull-${index}`);
    const assignedUserId = userIds[index % userIds.length];
    const gachaItems = itemsByGacha[gacha.id] ?? [];
    const selectedItems = gachaItems.slice(0, 3);
    const itemCounts = selectedItems.reduce<Record<string, number>>((acc, item, itemIndex) => {
      acc[item.itemId] = (itemIndex + 1) * (index + 1);
      return acc;
    }, {});
    const rarityCounts = selectedItems.reduce<Record<string, number>>((acc, item, itemIndex) => {
      const rarityId = item.rarityId;
      acc[rarityId] = (acc[rarityId] ?? 0) + (itemIndex + 1);
      return acc;
    }, {});

    return [
      entryId,
      {
        id: entryId,
        gachaId: gacha.id,
        userId: assignedUserId,
        executedAt: new Date(now.getTime() - (index + 1) * 60 * 60 * 1000).toISOString(),
        pullCount: 10 * (index + 1),
        currencyUsed: 3000 * (index + 1),
        itemCounts,
        rarityCounts,
        notes: `${gacha.displayName}のサンプル${10 * (index + 1)}連結果`
      }
    ] as const;
  });

  const pullHistoryState = {
    version: 1 as const,
    updatedAt: nowIso,
    order: pullHistoryEntries.map(([entryId]) => entryId),
    pulls: Object.fromEntries(pullHistoryEntries)
  } satisfies PullHistoryStateV1;

  const snapshot: GachaLocalStorageSnapshot = {
    appState,
    catalogState,
    rarityState,
    userInventories: userInventoriesState,
    userProfiles: userProfilesState,
    hitCounts: hitCountsState,
    riaguState,
    ptSettings: ptSettingsState,
    uiPreferences,
    saveOptions: { [primaryUserId]: saveOptions },
    receiveHistory,
    receivePrefs,
    pullHistory: pullHistoryState
  };

  return {
    snapshot,
    saveOptionsUserIds: [primaryUserId]
  };
}

export function MockStorageButton(): JSX.Element {
  const appPersistence = useAppPersistence();
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string>('');

  const handleInsertMockData = useCallback(() => {
    if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
      setStatus('error');
      setErrorMessage('ブラウザ環境ではありません');
      return;
    }

    try {
      const { snapshot, saveOptionsUserIds } = createMockSnapshot();
      appPersistence.saveSnapshot(snapshot);
      setStatus('success');
      setErrorMessage('');
      const touchedSlices = Object.entries(snapshot)
        .filter(([, value]) => typeof value !== 'undefined')
        .map(([key]) => key);
      console.info('ローカルストレージに仮データを保存しました', {
        slices: touchedSlices,
        saveOptions: saveOptionsUserIds
      });
    } catch (error) {
      console.error('ローカルストレージへの仮データ保存に失敗しました', error);
      setStatus('error');
      setErrorMessage(error instanceof Error ? error.message : String(error));
    }
  }, [appPersistence]);

  return (
    <div className="mock-storage-button flex flex-col gap-2 text-sm">
      <button
        type="button"
        onClick={handleInsertMockData}
        className="inline-flex items-center justify-center gap-2 rounded-full border border-border/50 bg-muted px-5 py-2 text-xs font-semibold text-surface-foreground transition hover:bg-muted/80"
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
