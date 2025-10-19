import { AppPersistence, type GachaRarityEntityV3, type GachaRarityStateV3 } from '../app-persistence';
import { PersistedStore, type UpdateOptions } from './persistedStore';

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
              // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
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
