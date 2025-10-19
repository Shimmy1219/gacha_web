import { AppPersistence, type GachaRarityEntityV3, type GachaRarityStateV3 } from '../app-persistence';
import { PersistedStore, type UpdateOptions } from './persistedStore';

function createRarityId(): string {
  if (typeof globalThis.crypto !== 'undefined' && typeof globalThis.crypto.randomUUID === 'function') {
    return `rar-${globalThis.crypto.randomUUID()}`;
  }
  return `rar-${Math.random().toString(36).slice(2, 10)}`;
}

export class RarityStore extends PersistedStore<GachaRarityStateV3 | undefined> {
  constructor(persistence: AppPersistence) {
    super(persistence);
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

    const rarityId = initial.id ?? createRarityId();
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
}
