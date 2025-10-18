import { AdjustmentsHorizontalIcon } from '@heroicons/react/24/outline';
import { clsx } from 'clsx';
import { useCallback, useMemo } from 'react';

import { ItemCard, type ItemCardModel, type RarityMeta } from '../../../components/cards/ItemCard';
import { SectionContainer } from '../../../components/layout/SectionContainer';
import { useModal } from '../../../components/modal';
import { PrizeSettingsDialog } from '../dialogs/PrizeSettingsDialog';
import { useGachaLocalStorage } from '../../storage/useGachaLocalStorage';

const FALLBACK_RARITY_COLOR = '#a1a1aa';
const PLACEHOLDER_CREATED_AT = '2024-01-01T00:00:00.000Z';

type ItemEntry = { model: ItemCardModel; rarity: RarityMeta };

export function ItemsSection(): JSX.Element {
  const { status, data } = useGachaLocalStorage();
  const { push } = useModal();

  const rarityOptionsByGacha = useMemo(() => {
    if (!data?.rarityState) {
      return {} as Record<string, Array<{ id: string; label: string }>>;
    }

    return Object.entries(data.rarityState.byGacha ?? {}).reduce<Record<string, Array<{ id: string; label: string }>>>(
      (acc, [gachaId, rarityIds]) => {
        acc[gachaId] = rarityIds.map((rarityId) => {
          const entity = data.rarityState?.entities?.[rarityId];
          return { id: rarityId, label: entity?.label ?? rarityId };
        });
        return acc;
      },
      {}
    );
  }, [data?.rarityState]);

  const items = useMemo(() => {
    if (!data?.appState || !data?.catalogState || !data?.rarityState) {
      return [] as ItemEntry[];
    }

    const results: ItemEntry[] = [];
    const order = data.appState.order ?? Object.keys(data.catalogState.byGacha ?? {});

    order.forEach((gachaId) => {
      const gachaMeta = data.appState?.meta?.[gachaId];
      const catalog = data.catalogState?.byGacha?.[gachaId];
      if (!catalog) {
        return;
      }

      catalog.order.forEach((itemId) => {
        const snapshot = catalog.items[itemId];
        if (!snapshot) {
          return;
        }

        const rarityEntity = data.rarityState?.entities?.[snapshot.rarityId];
        const rarity: RarityMeta = {
          rarityId: snapshot.rarityId,
          label: rarityEntity?.label ?? snapshot.rarityId,
          color: rarityEntity?.color ?? FALLBACK_RARITY_COLOR
        };

        const thumbnailUrl = snapshot.imageAssetId
          ? `https://picsum.photos/seed/${encodeURIComponent(snapshot.imageAssetId)}/400/400`
          : null;

        const model: ItemCardModel = {
          itemId: snapshot.itemId,
          gachaId,
          gachaDisplayName: gachaMeta?.displayName ?? gachaId,
          rarityId: snapshot.rarityId,
          name: snapshot.name,
          imageAsset: {
            thumbnailUrl,
            assetHash: snapshot.imageAssetId ?? null,
            hasImage: Boolean(thumbnailUrl)
          },
          isRiagu: Boolean(snapshot.riagu),
          completeTarget: Boolean(snapshot.completeTarget),
          pickupTarget: Boolean(snapshot.pickupTarget),
          order: snapshot.order ?? 0,
          createdAt: gachaMeta?.createdAt ?? snapshot.updatedAt ?? PLACEHOLDER_CREATED_AT,
          updatedAt: snapshot.updatedAt ?? PLACEHOLDER_CREATED_AT
        };

        results.push({ model, rarity });
      });
    });

    return results;
  }, [data]);

  const handleEditImage = useCallback(
    (itemId: string) => {
      const target = items.find((entry) => entry.model.itemId === itemId);
      if (!target) {
        return;
      }

      const { model, rarity } = target;
      const rarityOptions = rarityOptionsByGacha[model.gachaId] ?? [rarity].map((entry) => ({
        id: entry.rarityId,
        label: entry.label
      }));

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
          rarityOptions,
          pickupTarget: model.pickupTarget,
          completeTarget: model.completeTarget,
          isRiagu: model.isRiagu,
          thumbnailUrl: model.imageAsset.thumbnailUrl,
          rarityColor: rarity.color,
          riaguPrice: model.isRiagu ? 300 : undefined,
          riaguType: model.isRiagu ? 'リアグ景品' : undefined,
          onSave: (payload) => {
            console.info('景品設定ダイアログから保存（サンプル）', payload);
          }
        }
      });
    },
    [items, push, rarityOptionsByGacha]
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
            onClick={() => console.info('タブ切り替えは未実装です', tab)}
          >
            {tab}
          </button>
        ))}
      </div>

      {status !== 'ready' ? (
        <p className="text-sm text-muted-foreground">ローカルストレージからデータを読み込み中です…</p>
      ) : null}
      {status === 'ready' && items.length === 0 ? (
        <p className="text-sm text-muted-foreground">表示できるアイテムがありません。仮データ投入後にご確認ください。</p>
      ) : null}

      {items.length > 0 ? (
        <div className="items-section__grid grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {items.map(({ model, rarity }) => (
            <ItemCard key={model.itemId} model={model} rarity={rarity} onEditImage={handleEditImage} />
          ))}
        </div>
      ) : null}
    </SectionContainer>
  );
}
