import {
  AppPersistence,
  type GachaCatalogItemV4,
  type GachaCatalogStateV4
} from '../app-persistence';
import { PersistedStore, type UpdateOptions } from './persistedStore';

export class CatalogStore extends PersistedStore<GachaCatalogStateV4 | undefined> {
  constructor(persistence: AppPersistence) {
    super(persistence);
  }

  updateItem(params: {
    gachaId: string;
    itemId: string;
    patch: Partial<GachaCatalogItemV4>;
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

        const nextItem: GachaCatalogItemV4 = {
          ...currentItem,
          ...patch,
          itemId: currentItem.itemId,
          rarityId: patch.rarityId ?? currentItem.rarityId,
          name: patch.name ?? currentItem.name,
          updatedAt: timestamp
        };

        const nextState: GachaCatalogStateV4 = {
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

  removeItem(params: { gachaId: string; itemId: string; updatedAt?: string }): void {
    const { gachaId, itemId, updatedAt } = params;

    if (!gachaId || !itemId) {
      console.warn('CatalogStore.removeItem called without gachaId or itemId');
      return;
    }

    const timestamp = updatedAt ?? new Date().toISOString();

    this.update(
      (previous) => {
        if (!previous) {
          console.warn('CatalogStore.removeItem called before store was hydrated');
          return previous;
        }

        const gachaCatalog = previous.byGacha?.[gachaId];
        if (!gachaCatalog) {
          console.warn(`CatalogStore.removeItem could not find gacha ${gachaId}`);
          return previous;
        }

        if (!gachaCatalog.items?.[itemId]) {
          return previous;
        }

        const { [itemId]: _removed, ...restItems } = gachaCatalog.items;
        const nextOrder = (gachaCatalog.order ?? []).filter((value) => value !== itemId);

        const nextState: GachaCatalogStateV4 = {
          ...previous,
          updatedAt: timestamp,
          byGacha: {
            ...previous.byGacha,
            [gachaId]: {
              ...gachaCatalog,
              items: restItems,
              order: nextOrder
            }
          }
        };

        return nextState;
      },
      { persist: 'immediate' }
    );
  }

  addItems(params: { gachaId: string; items: GachaCatalogItemV4[]; updatedAt?: string }): void {
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

          const nextItem: GachaCatalogItemV4 = {
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

        const previousOrderLength = gachaCatalog.order?.length ?? 0;

        if (nextOrder.length === previousOrderLength) {
          return previous;
        }

        const nextState: GachaCatalogStateV4 = {
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

  removeGacha(gachaId: string, options: UpdateOptions = { persist: 'immediate' }): void {
    if (!gachaId) {
      return;
    }

    this.update(
      (previous) => {
        if (!previous?.byGacha?.[gachaId]) {
          return previous;
        }

        const { [gachaId]: _removed, ...rest } = previous.byGacha;
        const timestamp = new Date().toISOString();

        if (Object.keys(rest).length === 0) {
          return undefined;
        }

        return {
          version: typeof previous.version === 'number' ? previous.version : 4,
          updatedAt: timestamp,
          byGacha: rest
        } satisfies GachaCatalogStateV4;
      },
      options
    );
  }

  protected persistImmediate(state: GachaCatalogStateV4 | undefined): void {
    this.persistence.saveCatalogState(state);
  }

  protected persistDebounced(state: GachaCatalogStateV4 | undefined): void {
    this.persistence.saveCatalogStateDebounced(state);
  }
}
