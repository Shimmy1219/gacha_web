import { AppPersistence, type RiaguCardModelV3, type RiaguStateV3 } from '../app-persistence';
import { generateRiaguId } from '../idGenerators';
import { PersistedStore, type UpdateOptions } from './persistedStore';

interface UpsertRiaguCardInput {
  itemId: string;
  gachaId: string;
  unitCost?: number | null;
  typeLabel?: string | null;
  orderHint?: number | null;
  stock?: number | null;
  notes?: string | null;
}

export class RiaguStore extends PersistedStore<RiaguStateV3 | undefined> {
  constructor(persistence: AppPersistence) {
    super(persistence);
  }

  protected persistImmediate(state: RiaguStateV3 | undefined): void {
    this.persistence.saveRiaguState(state);
  }

  protected persistDebounced(state: RiaguStateV3 | undefined): void {
    this.persistence.saveRiaguStateDebounced(state);
  }

  getCardByItemId(itemId: string): RiaguCardModelV3 | undefined {
    const state = this.getState();
    if (!state) {
      return undefined;
    }

    const riaguId = state.indexByItemId?.[itemId];
    if (!riaguId) {
      return undefined;
    }

    return state.riaguCards?.[riaguId];
  }

  upsertCard(input: UpsertRiaguCardInput, options: UpdateOptions = { persist: 'debounced' }): RiaguCardModelV3 | undefined {
    let createdOrUpdated: RiaguCardModelV3 | undefined;

    this.update((previous) => {
      const nowIso = new Date().toISOString();

      const base: RiaguStateV3 = previous
        ? {
            ...previous,
            riaguCards: { ...(previous.riaguCards ?? {}) },
            indexByItemId: { ...(previous.indexByItemId ?? {}) }
          }
        : {
            version: 3,
            updatedAt: nowIso,
            riaguCards: {},
            indexByItemId: {}
          };

      const sanitizedUnitCost =
        typeof input.unitCost === 'number' && Number.isFinite(input.unitCost) ? input.unitCost : undefined;
      const trimmedType = input.typeLabel?.trim();
      const sanitizedType = trimmedType ? trimmedType : undefined;
      const sanitizedOrderHint =
        typeof input.orderHint === 'number' && Number.isFinite(input.orderHint) ? input.orderHint : undefined;
      const sanitizedStock =
        typeof input.stock === 'number' && Number.isFinite(input.stock) ? Math.max(0, Math.floor(input.stock)) : undefined;
      const sanitizedNotes = input.notes?.trim() ? input.notes.trim() : undefined;

      const next: RiaguStateV3 = {
        ...base,
        updatedAt: nowIso
      };

      const existingId = next.indexByItemId[input.itemId];
      if (existingId && next.riaguCards[existingId]) {
        const existing = next.riaguCards[existingId];
        const nextCard: RiaguCardModelV3 = {
          ...existing,
          itemId: input.itemId,
          gachaId: input.gachaId,
          unitCost: sanitizedUnitCost,
          typeLabel: sanitizedType,
          orderHint: sanitizedOrderHint,
          stock: sanitizedStock,
          notes: sanitizedNotes,
          updatedAt: nowIso
        };

        next.riaguCards[existingId] = nextCard;
        createdOrUpdated = nextCard;
      } else {
        const riaguId = generateRiaguId();
        const nextCard: RiaguCardModelV3 = {
          id: riaguId,
          itemId: input.itemId,
          gachaId: input.gachaId,
          unitCost: sanitizedUnitCost,
          typeLabel: sanitizedType,
          orderHint: sanitizedOrderHint,
          stock: sanitizedStock,
          notes: sanitizedNotes,
          updatedAt: nowIso
        };

        next.indexByItemId = {
          ...next.indexByItemId,
          [input.itemId]: riaguId
        };
        next.riaguCards = {
          ...next.riaguCards,
          [riaguId]: nextCard
        };
        createdOrUpdated = nextCard;
      }

      return next;
    }, options);

    return createdOrUpdated;
  }

  removeByItemId(itemId: string, options: UpdateOptions = { persist: 'debounced' }): void {
    this.update((previous) => {
      if (!previous) {
        return previous;
      }

      const riaguId = previous.indexByItemId?.[itemId];
      if (!riaguId) {
        return previous;
      }

      const { [riaguId]: _removed, ...restCards } = previous.riaguCards ?? {};
      const { [itemId]: _removedIndex, ...restIndex } = previous.indexByItemId ?? {};

      const next: RiaguStateV3 = {
        ...previous,
        updatedAt: new Date().toISOString(),
        riaguCards: restCards,
        indexByItemId: restIndex
      };

      return next;
    }, options);
  }

  removeGacha(gachaId: string, options: UpdateOptions = { persist: 'immediate' }): void {
    if (!gachaId) {
      return;
    }

    this.update(
      (previous) => {
        if (!previous?.riaguCards) {
          return previous;
        }

        const nextCards = { ...previous.riaguCards };
        const nextIndex = { ...(previous.indexByItemId ?? {}) };
        let mutated = false;

        Object.entries(nextCards).forEach(([cardId, card]) => {
          if (card?.gachaId === gachaId) {
            mutated = true;
            delete nextCards[cardId];
            if (card.itemId && nextIndex[card.itemId] === cardId) {
              delete nextIndex[card.itemId];
            }
          }
        });

        if (!mutated) {
          return previous;
        }

        const timestamp = new Date().toISOString();
        const hasCards = Object.keys(nextCards).length > 0;
        const hasIndex = Object.keys(nextIndex).length > 0;

        if (!hasCards && !hasIndex) {
          return undefined;
        }

        return {
          version: typeof previous.version === 'number' ? previous.version : 3,
          updatedAt: timestamp,
          riaguCards: nextCards,
          indexByItemId: nextIndex
        } satisfies RiaguStateV3;
      },
      options
    );
  }
}
