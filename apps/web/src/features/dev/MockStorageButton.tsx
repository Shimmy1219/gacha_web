import { useCallback, useState } from 'react';

type StorageEntry = {
  key: string;
  value: unknown;
};

type GachaDefinition = {
  id: string;
  displayName: string;
  summaryTag: string;
  iconAssetId: string;
  theme: string;
};

type ItemSeed = {
  name: string;
  description: string;
  series: string;
};

type UserSeed = {
  displayName: string;
  handle: string;
  team: string;
};

const GACHA_DEFINITIONS: GachaDefinition[] = [
  {
    id: 'gch-aurora-arc',
    displayName: 'オーロラアーク',
    summaryTag: 'AURORA',
    iconAssetId: 'asset-aurora',
    theme: '極光航路'
  },
  {
    id: 'gch-cosmos-diva',
    displayName: 'コスモスディーヴァ',
    summaryTag: 'COSMOS',
    iconAssetId: 'asset-cosmos',
    theme: '星屑舞台'
  },
  {
    id: 'gch-echo-tide',
    displayName: 'エコータイド',
    summaryTag: 'ECHO',
    iconAssetId: 'asset-echo',
    theme: '潮騒の残響'
  },
  {
    id: 'gch-mistral-note',
    displayName: 'ミストラルノート',
    summaryTag: 'MISTRAL',
    iconAssetId: 'asset-mistral',
    theme: '風待ちの譜面'
  }
];

const RARITY_TEMPLATES = [
  { code: 'legend', label: 'レジェンド', color: '#facc15', emitRate: 0.02, shortName: 'LEG' },
  { code: 'premium', label: 'プレミア', color: '#a855f7', emitRate: 0.18, shortName: 'PRE' },
  { code: 'standard', label: 'スタンダード', color: '#38bdf8', emitRate: 0.8, shortName: 'STD' }
] as const;

const ITEM_SETS: Record<string, ItemSeed[]> = {
  'gch-aurora-arc': [
    {
      name: '極光のティアラ',
      description: '北天の光を閉じ込めた煌めくティアラ。',
      series: 'AURORA JEWELRY'
    },
    {
      name: '氷晶の羽飾り',
      description: '薄氷の羽を模した軽やかなアクセサリー。',
      series: 'AURORA ACCESSORY'
    },
    {
      name: '夜明けの手紙',
      description: '黎明の空を描いた限定ポストカード。',
      series: 'AURORA POST'
    }
  ],
  'gch-cosmos-diva': [
    {
      name: '星雲ステージパス',
      description: '星々を巡るツアーの限定パス。',
      series: 'COSMOS LIVE'
    },
    {
      name: '流星のピアス',
      description: '瞬く流星をイメージしたイヤーアクセ。',
      series: 'COSMOS JEWELRY'
    },
    {
      name: '銀河レコード',
      description: '宇宙音響を収録した記念レコード。',
      series: 'COSMOS RECORDS'
    }
  ],
  'gch-echo-tide': [
    {
      name: '潮騒サウンドボックス',
      description: '波音と旋律を重ねたミュージックボックス。',
      series: 'ECHO MUSIC'
    },
    {
      name: '泡沫のミニキーホルダー',
      description: '海泡を閉じ込めた透明チャーム。',
      series: 'ECHO GOODS'
    },
    {
      name: '浜辺のポラロイド',
      description: '夕暮れの浜辺を映したポラロイド写真。',
      series: 'ECHO PHOTO'
    }
  ],
  'gch-mistral-note': [
    {
      name: '風歌マイクロフォン',
      description: '風を集める共鳴マイク。',
      series: 'MISTRAL AUDIO'
    },
    {
      name: '空渡りのブレスレット',
      description: '風詠みの旋律が刻まれたブレスレット。',
      series: 'MISTRAL ACCESSORY'
    },
    {
      name: '木漏れ日のスコア',
      description: '木漏れ日を五線譜に写したスコアブック。',
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

  const aliasByName = GACHA_DEFINITIONS.reduce<Record<string, string>>((acc, gacha) => {
    acc[gacha.displayName] = gacha.id;
    acc[gacha.summaryTag] = gacha.id;
    return acc;
  }, {});

  const aliasBySourceKey = GACHA_DEFINITIONS.reduce<Record<string, string>>((acc, gacha, index) => {
    acc[`src-${String(index + 1).padStart(2, '0')}`] = gacha.id;
    return acc;
  }, {});

  const appState = {
    version: 3,
    updatedAt: nowIso,
    meta: GACHA_DEFINITIONS.reduce<Record<string, Record<string, unknown>>>((acc, gacha, index) => {
      acc[gacha.id] = {
        id: gacha.id,
        displayName: gacha.displayName,
        summaryTag: gacha.summaryTag,
        iconAssetId: gacha.iconAssetId,
        theme: gacha.theme,
        createdAt: nowIso,
        updatedAt: nowIso,
        colorHint: ['#60a5fa', '#f472b6', '#34d399', '#f97316'][index % 4]
      };
      return acc;
    }, {}),
    order: gachaOrder,
    aliasByName,
    aliasBySourceKey,
    selectedGachaId: gachaOrder[0] ?? null,
    importer: {
      lastSource: 'import-json' as const,
      lastImportedAt: nowIso
    }
  };

  const rarityEntities: Record<string, Record<string, unknown>> = {};
  const rarityByGacha: Record<string, string[]> = {};
  const rarityIndexByName: Record<string, Record<string, string>> = {};

  GACHA_DEFINITIONS.forEach((gacha) => {
    const rarityIds = RARITY_TEMPLATES.map((template, templateIndex) => {
      const rarityId = `${gacha.id}-${template.code}`;
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

  const itemDefinitions = GACHA_DEFINITIONS.flatMap((gacha) => {
    const seeds = ITEM_SETS[gacha.id] ?? [];
    return seeds.map((seed, index) => {
      const rarityIds = rarityByGacha[gacha.id];
      const rarityId = rarityIds[Math.min(index, rarityIds.length - 1)];
      return {
        id: `itm-${gacha.id.split('-')[1]}-${String(index + 1).padStart(2, '0')}`,
        gachaId: gacha.id,
        rarityId,
        order: index + 1,
        name: seed.name,
        description: seed.description,
        series: seed.series,
        completeTarget: index === 0,
        pickupTarget: index < 2,
        imageAssetId: `${gacha.iconAssetId}-${index + 1}`
      };
    });
  });

  const catalogState = {
    version: 3,
    updatedAt: nowIso,
    itemCards: itemDefinitions.reduce<Record<string, Record<string, unknown>>>((acc, item) => {
      acc[item.id] = {
        id: item.id,
        gachaId: item.gachaId,
        rarityId: item.rarityId,
        name: item.name,
        description: item.description,
        order: item.order,
        pickupTarget: item.pickupTarget,
        completeTarget: item.completeTarget,
        imageAssetId: item.imageAssetId,
        tags: [item.series],
        updatedAt: nowIso
      };
      return acc;
    }, {})
  };

  const userAccentPalette = ['#4f46e5', '#f97316', '#14b8a6', '#facc15', '#ec4899', '#0ea5e9'];

  const userProfiles = USER_SEEDS.reduce<Record<string, Record<string, unknown>>>((acc, seed, index) => {
    const id = `usr-${String(index + 1).padStart(3, '0')}`;
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

  const itemsByGacha = itemDefinitions.reduce<Record<string, typeof itemDefinitions>>((acc, item) => {
    acc[item.gachaId] = acc[item.gachaId] ?? [];
    acc[item.gachaId].push(item);
    return acc;
  }, {});

  Object.values(itemsByGacha).forEach((list) => {
    list.sort((a, b) => a.order - b.order);
  });

  const userIds = Object.keys(userProfiles);
  const inventories: Record<string, Record<string, unknown>> = {};
  const reverseIndex: Record<string, Array<Record<string, unknown>>> = {};

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
          itemId: item.id,
          rarityId: item.rarityId,
          count
        };
      });

      const totalCount = selections.reduce((sum, entry) => sum + entry.count, 0);

      gachaInventories[gacha.id] = {
        inventoryId: `inv-${userId}-${gacha.id}`,
        gachaId: gacha.id,
        updatedAt: nowIso,
        totalCount,
        items: selections,
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

  const riaguEntries = itemDefinitions.slice(0, 10).map((item, index) => {
    const riaguId = `riagu-${String(index + 1).padStart(3, '0')}`;
    return [
      riaguId,
      {
        id: riaguId,
        itemId: item.id,
        gachaId: item.gachaId,
        unitCost: 1200 + index * 150,
        typeLabel: index % 2 === 0 ? 'ぬいぐるみ' : 'アクリルスタンド',
        orderHint: index + 1,
        currency: 'JPY',
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
        currency: 'JPY',
        pulls: 1
      },
      complete: {
        price: 9000 + index * 400,
        pulls: 30,
        bonus: 'コンプリート特典フォト付き'
      },
      bundles: [
        {
          id: `${gacha.id}-bundle-10`,
          label: '10連ステップ',
          price: 3000 + index * 120,
          currency: 'JPY',
          pulls: 10,
          bonusTickets: 1,
          guaranteedRarityId: rarityIds[1]
        },
        {
          id: `${gacha.id}-bundle-20`,
          label: '20連スペシャル',
          price: 5800 + index * 160,
          currency: 'JPY',
          pulls: 20,
          bonusTickets: 3,
          guaranteedRarityId: rarityIds[0]
        }
      ],
      guarantees: [
        {
          id: `${gacha.id}-guarantee-top`,
          rarityId: rarityIds[0],
          threshold: 60,
          pityStep: 10
        },
        {
          id: `${gacha.id}-guarantee-mid`,
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

  const primaryUserId = userIds[0] ?? 'usr-001';

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
