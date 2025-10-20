import {
  AppPersistence,
  type GachaCatalogItemV3,
  type GachaCatalogStateV3
} from '../app-persistence';
import { PersistedStore } from './persistedStore';

export class CatalogStore extends PersistedStore<GachaCatalogStateV3 | undefined> {
  constructor(persistence: AppPersistence) {
    super(persistence);
  }

  updateItem(params: {
    gachaId: string;
    itemId: string;
    patch: Partial<GachaCatalogItemV3>;
    updatedAt?: string;
  }): void {
    const { gachaId, itemId, patch, updatedAt } = params;

    if (!gachaId || !itemId) {
      console.warn('CatalogStore.updateItem called without gachaId or itemId');
      return;
    }

    const timestamp = updatedAt ?? new Date().toISOString();

    this.update(
      (previous) => {
        if (!previous) {
          console.warn('CatalogStore.updateItem called before store was hydrated');
          return previous;
        }

        const gachaCatalog = previous.byGacha?.[gachaId];
        if (!gachaCatalog) {
          console.warn(`CatalogStore.updateItem could not find gacha ${gachaId}`);
          return previous;
        }

        const currentItem = gachaCatalog.items?.[itemId];
        if (!currentItem) {
          console.warn(`CatalogStore.updateItem could not find item ${itemId} in gacha ${gachaId}`);
          return previous;
        }

        const nextItem: GachaCatalogItemV3 = {
          ...currentItem,
          ...patch,
          itemId: currentItem.itemId,
          rarityId: patch.rarityId ?? currentItem.rarityId,
          name: patch.name ?? currentItem.name,
          updatedAt: timestamp
        };

        const nextState: GachaCatalogStateV3 = {
          ...previous,
          updatedAt: timestamp,
          byGacha: {
            ...previous.byGacha,
            [gachaId]: {
              ...gachaCatalog,
              items: {
                ...gachaCatalog.items,
                [itemId]: nextItem
              }
            }
          }
        };

        return nextState;
      },
      { persist: 'immediate' }
    );
  }

  addItems(params: { gachaId: string; items: GachaCatalogItemV3[]; updatedAt?: string }): void {
    const { gachaId, items, updatedAt } = params;

    if (!gachaId || !items?.length) {
      console.warn('CatalogStore.addItems called without gachaId or items');
      return;
    }

    const timestamp = updatedAt ?? new Date().toISOString();

    this.update(
      (previous) => {
        if (!previous) {
          console.warn('CatalogStore.addItems called before store was hydrated');
          return previous;
        }

        const gachaCatalog = previous.byGacha?.[gachaId];
        if (!gachaCatalog) {
          console.warn(`CatalogStore.addItems could not find gacha ${gachaId}`);
          return previous;
        }

        const nextItems = { ...gachaCatalog.items };
        const nextOrder = [...(gachaCatalog.order ?? [])];

        items.forEach((item) => {
          if (!item?.itemId) {
            return;
          }

          const nextItem: GachaCatalogItemV3 = {
            ...item,
            itemId: item.itemId,
            rarityId: item.rarityId,
            updatedAt: item.updatedAt ?? timestamp
          };

          nextItems[item.itemId] = nextItem;
          if (!nextOrder.includes(item.itemId)) {
            nextOrder.push(item.itemId);
          }
        });

        if (nextOrder.length === gachaCatalog.order.length) {
          return previous;
        }

        const nextState: GachaCatalogStateV3 = {
          ...previous,
          updatedAt: timestamp,
          byGacha: {
            ...previous.byGacha,
            [gachaId]: {
              ...gachaCatalog,
              items: nextItems,
              order: nextOrder
            }
          }
        };

        return nextState;
      },
      { persist: 'immediate' }
    );
  }

  protected persistImmediate(state: GachaCatalogStateV3 | undefined): void {
    this.persistence.saveCatalogState(state);
  }

  protected persistDebounced(state: GachaCatalogStateV3 | undefined): void {
    this.persistence.saveCatalogStateDebounced(state);
  }
}
