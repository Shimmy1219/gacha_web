import { AdjustmentsHorizontalIcon } from '@heroicons/react/24/outline';
import { clsx } from 'clsx';
import {
  type CSSProperties,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState
} from 'react';

import {
  ItemCard,
  type ItemCardModel,
  type ItemCardProps,
  type RarityMeta
} from '../../../components/cards/ItemCard';
import { SectionContainer } from '../../../components/layout/SectionContainer';
import { useTabMotion } from '../../../hooks/useTabMotion';
import { useModal } from '../../../components/modal';
import { PrizeSettingsDialog } from '../dialogs/PrizeSettingsDialog';
import { useGachaLocalStorage } from '../../storage/useGachaLocalStorage';

const FALLBACK_RARITY_COLOR = '#a1a1aa';
const PLACEHOLDER_CREATED_AT = '2024-01-01T00:00:00.000Z';

const CARD_WIDTH_REM = 24;
const CARD_GAP_REM = 0.75; // tailwind gap-3

type ItemEntry = { model: ItemCardModel; rarity: RarityMeta };
type ItemsByGacha = Record<string, ItemEntry[]>;
type GachaTab = { id: string; label: string };

export function ItemsSection(): JSX.Element {
  const { status, data } = useGachaLocalStorage();
  const { push } = useModal();
  const [activeGachaId, setActiveGachaId] = useState<string | null>(null);
  const gridContainerRef = useRef<HTMLDivElement | null>(null);
  const [rootFontSize, setRootFontSize] = useState(16);
  const [gridState, setGridState] = useState<{ columns: number; layout: ItemCardProps['layout'] }>(() => ({
    columns: 3,
    layout: 'vertical'
  }));

  useLayoutEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    const fontSize = parseFloat(getComputedStyle(document.documentElement).fontSize);
    if (!Number.isNaN(fontSize)) {
      setRootFontSize(fontSize);
    }
  }, []);

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

  useEffect(() => {
    if (typeof ResizeObserver === 'undefined') {
      return;
    }
    const element = gridContainerRef.current;
    if (!element) {
      return;
    }

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      const width = entry.contentRect.width;
      const cardWidth = CARD_WIDTH_REM * rootFontSize;
      const gap = CARD_GAP_REM * rootFontSize;

      const thresholdFour = cardWidth * 4 + gap * 3;
      const thresholdThree = cardWidth * 3 + gap * 2;
      const thresholdTwo = cardWidth * 2 + gap;

      let columns = 1;
      if (width >= thresholdFour) {
        columns = 4;
      } else if (width >= thresholdThree) {
        columns = 3;
      } else if (width >= thresholdTwo) {
        columns = 2;
      }

      const layout: ItemCardProps['layout'] = columns === 1 ? 'horizontal' : 'vertical';
      setGridState((current) => {
        if (current.columns === columns && current.layout === layout) {
          return current;
        }
        return { columns, layout };
      });
    });

    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, [items.length, rootFontSize]);

  const effectiveColumns = useMemo(() => {
    if (gridState.columns <= 1) {
      return 1;
    }
    const availableItems = Math.max(items.length, 1);
    return Math.min(gridState.columns, availableItems);
  }, [gridState.columns, items.length]);

  const gridStyles = useMemo<CSSProperties>(() => {
    if (gridState.columns <= 1 || effectiveColumns <= 1) {
      return { gridTemplateColumns: 'minmax(0, 1fr)' };
    }

    const cardWidth = CARD_WIDTH_REM * rootFontSize;
    const gap = CARD_GAP_REM * rootFontSize;
    const columnCount = Math.max(1, effectiveColumns);

    return {
      gridTemplateColumns: `repeat(${columnCount}, minmax(${cardWidth}px, 1fr))`,
      columnGap: `${gap}px`
    };
  }, [effectiveColumns, gridState.columns, rootFontSize]);

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
    [flatItems, push, rarityOptionsByGacha]
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
            <div ref={gridContainerRef} className="items-section__grid-wrapper w-full">
              <div
                className={clsx('items-section__grid grid gap-3 justify-items-stretch')}
                style={gridStyles}
              >
                {items.map(({ model, rarity }) => (
                  <ItemCard
                    key={model.itemId}
                    model={model}
                    rarity={rarity}
                    layout={gridState.layout}
                    onEditImage={handleEditImage}
                  />
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </SectionContainer>
  );
}
