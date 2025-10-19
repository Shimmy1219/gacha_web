import { AdjustmentsHorizontalIcon } from '@heroicons/react/24/outline';
import { clsx } from 'clsx';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { ItemCard, type ItemCardModel, type RarityMeta } from '../../../components/cards/ItemCard';
import { SectionContainer } from '../../../components/layout/SectionContainer';
import { useTabMotion } from '../../../hooks/useTabMotion';
import { useModal } from '../../../components/modal';
import { PrizeSettingsDialog } from '../dialogs/PrizeSettingsDialog';
import { useGachaLocalStorage } from '../../storage/useGachaLocalStorage';
import { useAppPersistence } from '../../storage/AppPersistenceProvider';

const FALLBACK_RARITY_COLOR = '#a1a1aa';
const PLACEHOLDER_CREATED_AT = '2024-01-01T00:00:00.000Z';

type ItemEntry = { model: ItemCardModel; rarity: RarityMeta };
type ItemsByGacha = Record<string, ItemEntry[]>;
type GachaTab = { id: string; label: string };

export function ItemsSection(): JSX.Element {
  const appPersistence = useAppPersistence();
  const { status, data } = useGachaLocalStorage();
  const { push } = useModal();
  const [activeGachaId, setActiveGachaId] = useState<string | null>(null);

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

  const gachaTabs = useMemo<GachaTab[]>(() => {
    if (!data?.appState || !data?.catalogState) {
      return [];
    }

    const catalogByGacha = data.catalogState.byGacha ?? {};
    const ordered = data.appState.order ?? Object.keys(catalogByGacha);

    const knownGachaIds = ordered.filter((gachaId) => catalogByGacha[gachaId]);
    const rest = Object.keys(catalogByGacha).filter((gachaId) => !knownGachaIds.includes(gachaId));
    const finalOrder = [...knownGachaIds, ...rest];

    return finalOrder.map((gachaId) => ({
      id: gachaId,
      label: data.appState?.meta?.[gachaId]?.displayName ?? gachaId
    }));
  }, [data?.appState, data?.catalogState]);

  const gachaTabIds = useMemo(() => gachaTabs.map((tab) => tab.id), [gachaTabs]);

  const panelMotion = useTabMotion(activeGachaId, gachaTabIds);
  const panelAnimationClass = clsx(
    'tab-panel-content',
    panelMotion === 'forward' && 'animate-tab-slide-from-right',
    panelMotion === 'backward' && 'animate-tab-slide-from-left'
  );

  const { itemsByGacha, flatItems } = useMemo(() => {
    if (!data?.appState || !data?.catalogState || !data?.rarityState) {
      return { itemsByGacha: {} as ItemsByGacha, flatItems: [] as ItemEntry[] };
    }

    const catalogByGacha = data.catalogState.byGacha ?? {};
    const entries: ItemsByGacha = {};
    const flat: ItemEntry[] = [];

    Object.keys(catalogByGacha).forEach((gachaId) => {
      const gachaMeta = data.appState?.meta?.[gachaId];
      const catalog = catalogByGacha[gachaId];
      const results: ItemEntry[] = [];

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

        const entry = { model, rarity };
        results.push(entry);
        flat.push(entry);
      });

      entries[gachaId] = results;
    });

    return { itemsByGacha: entries, flatItems: flat };
  }, [data]);

  useEffect(() => {
    if (!gachaTabs.length) {
      setActiveGachaId(null);
      return;
    }

    setActiveGachaId((current) => {
      if (current && gachaTabs.some((tab) => tab.id === current)) {
        return current;
      }

      const preferred = data?.appState?.selectedGachaId;
      if (preferred && gachaTabs.some((tab) => tab.id === preferred)) {
        return preferred;
      }

      return gachaTabs[0].id;
    });
  }, [data?.appState?.selectedGachaId, gachaTabs]);

  const items = activeGachaId ? itemsByGacha[activeGachaId] ?? [] : [];

  const handleEditImage = useCallback(
    (itemId: string) => {
      const target = flatItems.find((entry) => entry.model.itemId === itemId);
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
          gachaId: model.gachaId,
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
            try {
              appPersistence.updateCatalogItem({
                gachaId: model.gachaId,
                itemId: model.itemId,
                patch: {
                  name: payload.name,
                  rarityId: payload.rarityId,
                  pickupTarget: payload.pickupTarget,
                  completeTarget: payload.completeTarget
                }
              });
            } catch (error) {
              console.error('景品設定の保存に失敗しました', error);
            }
          }
        }
      });
    },
    [appPersistence, flatItems, push, rarityOptionsByGacha]
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
      contentClassName="items-section__content"
    >
      <div className="items-section__tabs tab-scroll-area">
        {gachaTabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={clsx(
              'items-section__tab tab-pill shrink-0 rounded-full border px-4 py-1.5 transition',
              tab.id === activeGachaId
                ? 'border-accent/80 bg-accent text-accent-foreground shadow-[0_10px_28px_rgba(225,29,72,0.25)]'
                : 'border-border/40 text-muted-foreground hover:border-accent/60'
            )}
            onClick={() => setActiveGachaId(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="items-section__scroll section-scroll flex-1">
        <div className="items-section__scroll-content space-y-4">
          {gachaTabs.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">表示できるガチャがありません。</p>
          ) : null}

          <div className="tab-panel-viewport">
            <div
              key={activeGachaId ?? 'items-empty'}
              className={panelAnimationClass}
            >
              {status !== 'ready' ? (
                <p className="text-sm text-muted-foreground">ローカルストレージからデータを読み込み中です…</p>
              ) : null}
              {status === 'ready' && activeGachaId && items.length === 0 ? (
                <p className="text-sm text-muted-foreground">このガチャには表示できるアイテムがありません。</p>
              ) : null}

              {items.length > 0 ? (
                <div className="items-section__grid grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {items.map(({ model, rarity }) => (
                    <ItemCard key={model.itemId} model={model} rarity={rarity} onEditImage={handleEditImage} />
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </SectionContainer>
  );
}
