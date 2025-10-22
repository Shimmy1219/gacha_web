import { AppPersistence, type GachaRarityEntityV3, type GachaRarityStateV3 } from '../app-persistence';
import { generateRarityId } from '../idGenerators';
import { PersistedStore, type UpdateOptions } from './persistedStore';

export class RarityStore extends PersistedStore<GachaRarityStateV3 | undefined> {
  constructor(persistence: AppPersistence) {
    super(persistence);

    this.persistence.onUpdated(() => {
      this.handlePersistenceUpdated();
    });
  }

  renameRarity(rarityId: string, label: string, options: UpdateOptions = { persist: 'immediate' }): void {
    this.updateRarity(rarityId, { label }, options);
  }

  setRarityColor(
    rarityId: string,
    color: string,
    options: UpdateOptions = { persist: 'immediate' }
  ): void {
    this.updateRarity(rarityId, { color }, options);
  }

  setRarityEmitRate(
    rarityId: string,
    emitRate: number | undefined,
    options: UpdateOptions = { persist: 'immediate' }
  ): void {
    this.updateRarity(rarityId, { emitRate }, options);
  }

  addRarity(
    gachaId: string,
    initial: Partial<Omit<GachaRarityEntityV3, 'gachaId'>> = {},
    options: UpdateOptions = { persist: 'immediate' }
  ): string | null {
    if (!gachaId) {
      return null;
    }

    const rarityId = initial.id ?? generateRarityId();
    let created = false;

    this.update((previous) => {
      const previousEntities = previous?.entities ?? {};
      if (previousEntities[rarityId]) {
        return previous;
      }

      const previousByGacha = previous?.byGacha ?? {};
      const currentOrder = previousByGacha[gachaId] ?? [];
      if (currentOrder.includes(rarityId)) {
        return previous;
      }

      const timestamp = new Date().toISOString();

      const nextOrder = [...currentOrder, rarityId];
      const nextByGacha = {
        ...previousByGacha,
        [gachaId]: nextOrder
      };

      const nextEntities: Record<string, GachaRarityEntityV3> = {
        ...previousEntities,
        [rarityId]: {
          id: rarityId,
          gachaId,
          label: initial.label ?? '',
          ...(initial.shortName ? { shortName: initial.shortName } : {}),
          ...(initial.color ? { color: initial.color } : {}),
          ...(typeof initial.emitRate === 'number' ? { emitRate: initial.emitRate } : {}),
          ...(typeof initial.sortOrder === 'number' ? { sortOrder: initial.sortOrder } : { sortOrder: nextOrder.length - 1 }),
          updatedAt: timestamp
        }
      };

      let nextIndexByName = previous?.indexByName ? { ...previous.indexByName } : undefined;
      const label = initial.label ?? '';
      const shortName = initial.shortName;
      if (label || shortName) {
        const gachaIndex = { ...(nextIndexByName?.[gachaId] ?? {}) };
        if (label) {
          gachaIndex[label] = rarityId;
        }
        if (shortName) {
          gachaIndex[shortName] = rarityId;
        }
        nextIndexByName = {
          ...(nextIndexByName ?? {}),
          [gachaId]: gachaIndex
        };
      }

      created = true;

      return {
        version: previous?.version ?? 3,
        updatedAt: timestamp,
        byGacha: nextByGacha,
        entities: nextEntities,
        ...(nextIndexByName ? { indexByName: nextIndexByName } : {})
      };
    }, options);

    return created ? rarityId : null;
  }

  removeRarity(rarityId: string, options: UpdateOptions = { persist: 'immediate' }): void {
    if (!rarityId) {
      return;
    }

    this.update((previous) => {
      if (!previous || !previous.entities || !previous.entities[rarityId]) {
        return previous;
      }

      const entity = previous.entities[rarityId];
      const gachaId = entity.gachaId;

      const nextEntities = { ...previous.entities };
      delete nextEntities[rarityId];

      const nextByGacha = { ...(previous.byGacha ?? {}) };
      const currentOrder = nextByGacha[gachaId] ?? [];
      const filteredOrder = currentOrder.filter((id) => id !== rarityId);
      if (filteredOrder.length > 0) {
        nextByGacha[gachaId] = filteredOrder;
      } else {
        delete nextByGacha[gachaId];
      }

      let nextIndexByName = previous.indexByName ? { ...previous.indexByName } : undefined;
      if (nextIndexByName) {
        const gachaIndex = { ...(nextIndexByName[gachaId] ?? {}) };
        let mutated = false;
        if (entity.label && gachaIndex[entity.label] === rarityId) {
          delete gachaIndex[entity.label];
          mutated = true;
        }
        if (entity.shortName && gachaIndex[entity.shortName] === rarityId) {
          delete gachaIndex[entity.shortName];
          mutated = true;
        }
        if (mutated) {
          if (Object.keys(gachaIndex).length > 0) {
            nextIndexByName[gachaId] = gachaIndex;
          } else {
            delete nextIndexByName[gachaId];
          }
        }
        if (nextIndexByName && Object.keys(nextIndexByName).length === 0) {
          nextIndexByName = undefined;
        }
      }

      const timestamp = new Date().toISOString();

      const hasEntities = Object.keys(nextEntities).length > 0;
      const hasByGacha = Object.keys(nextByGacha).length > 0;
      if (!hasEntities && !hasByGacha && !nextIndexByName) {
        return undefined;
      }

      const nextState: GachaRarityStateV3 = {
        version: typeof previous.version === 'number' ? previous.version : 3,
        updatedAt: timestamp,
        byGacha: nextByGacha,
        entities: nextEntities,
        ...(nextIndexByName ? { indexByName: nextIndexByName } : {})
      };

      return nextState;
    }, options);
  }

  removeGacha(gachaId: string, options: UpdateOptions = { persist: 'immediate' }): void {
    if (!gachaId) {
      return;
    }

    this.update(
      (previous) => {
        const currentOrder = previous?.byGacha?.[gachaId];
        if (!previous || !currentOrder) {
          return previous;
        }

        const nextEntities = { ...(previous.entities ?? {}) };
        currentOrder.forEach((rarityId) => {
          delete nextEntities[rarityId];
        });

        const nextByGacha = { ...(previous.byGacha ?? {}) };
        delete nextByGacha[gachaId];

        let nextIndexByName = previous.indexByName ? { ...previous.indexByName } : undefined;
        if (nextIndexByName && nextIndexByName[gachaId]) {
          delete nextIndexByName[gachaId];
          if (Object.keys(nextIndexByName).length === 0) {
            nextIndexByName = undefined;
          }
        }

        const timestamp = new Date().toISOString();
        const hasEntities = Object.keys(nextEntities).length > 0;
        const hasByGacha = Object.keys(nextByGacha).length > 0;

        if (!hasEntities && !hasByGacha && !nextIndexByName) {
          return undefined;
        }

        const nextState: GachaRarityStateV3 = {
          version: typeof previous.version === 'number' ? previous.version : 3,
          updatedAt: timestamp,
          byGacha: nextByGacha,
          entities: nextEntities,
          ...(nextIndexByName ? { indexByName: nextIndexByName } : {})
        };

        return nextState;
      },
      options
    );
  }

  protected persistImmediate(state: GachaRarityStateV3 | undefined): void {
    this.persistence.saveRarityState(state);
  }

  protected persistDebounced(state: GachaRarityStateV3 | undefined): void {
    this.persistence.saveRarityStateDebounced(state);
  }

  private updateRarity(
    rarityId: string,
    patch: Partial<GachaRarityEntityV3>,
    options: UpdateOptions
  ): void {
    this.update((previous) => {
      if (!previous || !previous.entities || !previous.entities[rarityId]) {
        return previous;
      }

      const current = previous.entities[rarityId];
      const next: GachaRarityEntityV3 = { ...current };
      let changed = false;

      (Object.keys(patch) as Array<keyof GachaRarityEntityV3>).forEach((key) => {
        const value = patch[key];
        if (typeof value === 'undefined') {
          if (Object.prototype.hasOwnProperty.call(next, key)) {
            if (!Object.is(next[key], value)) {
              delete (next as Record<string, unknown>)[key as string];
              changed = true;
            }
          }
          return;
        }

        if (!Object.is(next[key], value)) {
          (next as Record<string, unknown>)[key as string] = value;
          changed = true;
        }
      });

      if (!changed) {
        return previous;
      }

      const timestamp = new Date().toISOString();
      next.updatedAt = timestamp;

      const nextEntities: Record<string, GachaRarityEntityV3> = {
        ...previous.entities,
        [rarityId]: next
      };

      let nextIndexByName = previous.indexByName;
      if (Object.prototype.hasOwnProperty.call(patch, 'label') && current.label !== next.label) {
        const indexByName = previous.indexByName ?? {};
        const gachaIndex = { ...(indexByName[current.gachaId] ?? {}) };
        if (current.label) {
          delete gachaIndex[current.label];
        }
        if (next.label) {
          gachaIndex[next.label] = rarityId;
        }
        nextIndexByName = {
          ...indexByName,
          [current.gachaId]: gachaIndex
        };
      }

      return {
        ...previous,
        updatedAt: timestamp,
        entities: nextEntities,
        ...(nextIndexByName ? { indexByName: nextIndexByName } : {})
      };
    }, options);
  }

  private handlePersistenceUpdated(): void {
    try {
      const snapshot = this.persistence.loadSnapshot();
      const nextState = snapshot.rarityState;
      const currentState = this.getState();

      if (!nextState && !currentState) {
        return;
      }

      const nextUpdatedAt = nextState?.updatedAt;
      const currentUpdatedAt = currentState?.updatedAt;
      if (nextUpdatedAt && currentUpdatedAt && nextUpdatedAt === currentUpdatedAt) {
        return;
      }

      this.setState(nextState, { persist: 'none' });
    } catch (error) {
      console.warn('Failed to resync rarity store from persistence snapshot', error);
    }
  }
}
