import { AdjustmentsHorizontalIcon } from '@heroicons/react/24/outline';
import { clsx } from 'clsx';
import { useCallback } from 'react';

import { ItemCard, type ItemCardModel, type RarityMeta } from '../../../components/cards/ItemCard';
import { SectionContainer } from '../../../components/layout/SectionContainer';
import { useModal } from '../../../components/modal';
import { PrizeSettingsDialog } from '../dialogs/PrizeSettingsDialog';
import { RiaguConfigDialog } from '../../riagu/dialogs/RiaguConfigDialog';

const RARITY_META: Record<string, RarityMeta> = {
  SSR: { rarityId: 'rar-ssr', label: 'SSR', color: '#ff8ab2' },
  SR: { rarityId: 'rar-sr', label: 'SR', color: '#ff4f89' },
  R: { rarityId: 'rar-r', label: 'R', color: '#c438ff' },
  N: { rarityId: 'rar-n', label: 'N', color: '#4d6bff' }
};

const RARITY_OPTIONS = Object.values(RARITY_META).map((rarity) => ({
  id: rarity.rarityId,
  label: rarity.label
}));

const SAMPLE_TIMESTAMP = '2024-01-01T00:00:00.000Z';

const SAMPLE_ITEMS: Array<{ model: ItemCardModel; rarity: RarityMeta }> = [
  {
    model: {
      itemId: 'itm-000001',
      gachaId: 'gch-main',
      gachaDisplayName: 'スターブライト',
      rarityId: RARITY_META.SSR.rarityId,
      name: '煌めく星屑ブレスレット',
      imageAsset: {
        thumbnailUrl:
          'https://images.unsplash.com/photo-1521579971123-1192931a1452?auto=format&fit=crop&w=400&q=80',
        assetHash: null,
        hasImage: true
      },
      isRiagu: true,
      completeTarget: true,
      pickupTarget: true,
      order: 1,
      createdAt: SAMPLE_TIMESTAMP,
      updatedAt: SAMPLE_TIMESTAMP
    },
    rarity: RARITY_META.SSR
  },
  {
    model: {
      itemId: 'itm-000002',
      gachaId: 'gch-main',
      gachaDisplayName: 'スターブライト',
      rarityId: RARITY_META.SR.rarityId,
      name: '漆黒のオーブ',
      imageAsset: {
        thumbnailUrl: null,
        assetHash: null,
        hasImage: true
      },
      isRiagu: false,
      completeTarget: false,
      pickupTarget: true,
      order: 2,
      createdAt: SAMPLE_TIMESTAMP,
      updatedAt: SAMPLE_TIMESTAMP
    },
    rarity: RARITY_META.SR
  },
  {
    model: {
      itemId: 'itm-000003',
      gachaId: 'gch-main',
      gachaDisplayName: 'スターブライト',
      rarityId: RARITY_META.SR.rarityId,
      name: '幸運のメダル',
      imageAsset: {
        thumbnailUrl: null,
        assetHash: null,
        hasImage: false
      },
      isRiagu: false,
      completeTarget: false,
      pickupTarget: false,
      order: 3,
      createdAt: SAMPLE_TIMESTAMP,
      updatedAt: SAMPLE_TIMESTAMP
    },
    rarity: RARITY_META.SR
  },
  {
    model: {
      itemId: 'itm-000004',
      gachaId: 'gch-main',
      gachaDisplayName: 'スターブライト',
      rarityId: RARITY_META.R.rarityId,
      name: 'スチールギア',
      imageAsset: {
        thumbnailUrl: null,
        assetHash: null,
        hasImage: false
      },
      isRiagu: false,
      completeTarget: false,
      pickupTarget: false,
      order: 4,
      createdAt: SAMPLE_TIMESTAMP,
      updatedAt: SAMPLE_TIMESTAMP
    },
    rarity: RARITY_META.R
  },
  {
    model: {
      itemId: 'itm-000005',
      gachaId: 'gch-main',
      gachaDisplayName: 'スターブライト',
      rarityId: RARITY_META.R.rarityId,
      name: '薄紅のカードケース',
      imageAsset: {
        thumbnailUrl:
          'https://images.unsplash.com/photo-1521310192545-4ac7951413f0?auto=format&fit=crop&w=400&q=80',
        assetHash: null,
        hasImage: true
      },
      isRiagu: false,
      completeTarget: false,
      pickupTarget: false,
      order: 5,
      createdAt: SAMPLE_TIMESTAMP,
      updatedAt: SAMPLE_TIMESTAMP
    },
    rarity: RARITY_META.R
  },
  {
    model: {
      itemId: 'itm-000006',
      gachaId: 'gch-main',
      gachaDisplayName: 'スターブライト',
      rarityId: RARITY_META.N.rarityId,
      name: 'メモリアルチケット',
      imageAsset: {
        thumbnailUrl: null,
        assetHash: null,
        hasImage: false
      },
      isRiagu: false,
      completeTarget: false,
      pickupTarget: false,
      order: 6,
      createdAt: SAMPLE_TIMESTAMP,
      updatedAt: SAMPLE_TIMESTAMP
    },
    rarity: RARITY_META.N
  }
];

export function ItemsSection(): JSX.Element {
  const { push } = useModal();

  const handleEditImage = useCallback(
    (itemId: string) => {
      const target = SAMPLE_ITEMS.find((entry) => entry.model.itemId === itemId);
      if (!target) {
        return;
      }

      const { model, rarity } = target;

      push(PrizeSettingsDialog, {
        id: `prize-settings-${model.itemId}`,
        title: '景品画像を設定',
        description: 'プレビュー・レアリティ・リアグ設定をまとめて更新します。',
        size: 'lg',
        payload: {
          itemId: model.itemId,
          itemName: model.name,
          gachaName: model.gachaDisplayName,
          rarityId: model.rarityId,
          rarityLabel: rarity.label,
          rarityOptions: RARITY_OPTIONS,
          pickupTarget: model.pickupTarget,
          completeTarget: model.completeTarget,
          isRiagu: model.isRiagu,
          thumbnailUrl: model.imageAsset.thumbnailUrl,
          rarityColor: rarity.color,
          riaguPrice: model.isRiagu ? 300 : undefined,
          riaguType: model.isRiagu ? 'アクリルスタンド' : undefined,
          onSave: (data) => {
            console.info('景品設定ダイアログから保存（サンプル）', data);
          }
        }
      });
    },
    [push]
  );

  const handleToggleRiagu = useCallback(
    (itemId: string) => {
      const target = SAMPLE_ITEMS.find((entry) => entry.model.itemId === itemId);
      if (!target) {
        return;
      }

      const { model } = target;

      push(RiaguConfigDialog, {
        id: `riagu-config-${model.itemId}`,
        title: 'リアルグッズ設定',
        size: 'sm',
        payload: {
          itemId: model.itemId,
          itemName: model.name,
          defaultPrice: model.isRiagu ? 300 : undefined,
          defaultType: model.isRiagu ? 'アクリルスタンド' : '',
          onSave: (data) => {
            console.info('リアグ設定ダイアログから保存（サンプル）', data);
          },
          onRemove: (id) => {
            console.info('リアグ設定の解除（サンプル）', id);
          }
        }
      });
    },
    [push]
  );

  return (
    <SectionContainer
      id="items"
      title="アイテム画像の設定"
      description="カタログ内のアイテムを整理し、画像・リアグ状態を管理します。"
      actions={
        <button
          type="button"
          className="items-section__filter-button chip border-accent/40 bg-accent/10 text-accent"
          onClick={() => console.info('フィルタモーダルは未実装です')}
        >
          <AdjustmentsHorizontalIcon className="h-4 w-4" />
          フィルタ
        </button>
      }
      footer="ガチャタブ切替とItemCatalogToolbarの操作が追加される予定です。画像設定はAssetStoreと連携します。"
    >
      <div className="items-section__tabs flex flex-wrap gap-2">
        {['最新', 'おすすめ', 'リアグ対象', '未設定'].map((tab, index) => (
          <button
            key={tab}
            type="button"
            className={clsx(
              'items-section__tab tab-pill rounded-full border px-4 py-1.5',
              index === 0
                ? 'border-accent/80 bg-accent text-accent-foreground shadow-[0_10px_28px_rgba(225,29,72,0.45)]'
                : 'border-border/40 text-muted-foreground hover:border-accent/60'
            )}
          >
            {tab}
          </button>
        ))}
      </div>
      <div className="items-section__grid grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {SAMPLE_ITEMS.map(({ model, rarity }) => (
          <ItemCard
            key={model.itemId}
            model={model}
            rarity={rarity}
            onEditImage={handleEditImage}
            onToggleRiagu={handleToggleRiagu}
          />
        ))}
      </div>
    </SectionContainer>
  );
}
