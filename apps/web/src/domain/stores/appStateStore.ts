import { AppPersistence, type GachaAppStateV3 } from '../app-persistence';
import { PersistedStore, type UpdateOptions } from './persistedStore';

export class AppStateStore extends PersistedStore<GachaAppStateV3 | undefined> {
  constructor(persistence: AppPersistence) {
    super(persistence);
  }

  protected persistImmediate(state: GachaAppStateV3 | undefined): void {
    this.persistence.saveAppState(state);
  }

  protected persistDebounced(state: GachaAppStateV3 | undefined): void {
    this.persistence.saveAppStateDebounced(state);
  }

  setSelectedGacha(gachaId: string | null, options: UpdateOptions = { persist: 'debounced' }): void {
    this.update(
      (previous) => {
        if (!previous) {
          return previous;
        }
        if (previous.selectedGachaId === gachaId) {
          return previous;
        }
        return {
          ...previous,
          selectedGachaId: gachaId,
          updatedAt: new Date().toISOString()
        };
      },
      options
    );
  }

  archiveGacha(gachaId: string, options: UpdateOptions = { persist: 'immediate' }): void {
    if (!gachaId) {
      return;
    }

    this.update(
      (previous) => {
        if (!previous) {
          return previous;
        }

        const hasMeta = Boolean(previous.meta?.[gachaId]);
        const isInOrder = previous.order?.includes(gachaId);

        if (!hasMeta && !isInOrder && previous.selectedGachaId !== gachaId) {
          return previous;
        }

        const timestamp = new Date().toISOString();
        const nextMeta = { ...(previous.meta ?? {}) };
        const currentMeta = nextMeta[gachaId];

        const archivedMeta = {
          ...(currentMeta ?? {}),
          id: currentMeta?.id ?? gachaId,
          displayName: currentMeta?.displayName ?? gachaId,
          createdAt: currentMeta?.createdAt,
          updatedAt: timestamp,
          isArchived: true
        };
        nextMeta[gachaId] = archivedMeta;

        const nextOrder = (previous.order ?? []).filter((id) => id !== gachaId);
        const nextSelected = previous.selectedGachaId === gachaId ? nextOrder[0] ?? null : previous.selectedGachaId;

        return {
          ...previous,
          meta: nextMeta,
          order: nextOrder,
          selectedGachaId: nextSelected,
          updatedAt: timestamp
        };
      },
      options
    );
  }

  restoreGacha(gachaId: string, options: UpdateOptions = { persist: 'immediate' }): void {
    if (!gachaId) {
      return;
    }

    this.update(
      (previous) => {
        if (!previous?.meta?.[gachaId]) {
          return previous;
        }

        const timestamp = new Date().toISOString();
        const nextMeta = { ...(previous.meta ?? {}) };
        const currentMeta = nextMeta[gachaId];

        nextMeta[gachaId] = {
          ...currentMeta,
          id: currentMeta?.id ?? gachaId,
          displayName: currentMeta?.displayName ?? gachaId,
          updatedAt: timestamp,
          isArchived: false
        };

        const hasOrder = previous.order?.includes(gachaId);
        const nextOrder = hasOrder ? [...(previous.order ?? [])] : [...(previous.order ?? []), gachaId];
        const nextSelected = previous.selectedGachaId ?? gachaId;

        return {
          ...previous,
          meta: nextMeta,
          order: nextOrder,
          selectedGachaId: nextSelected,
          updatedAt: timestamp
        };
      },
      options
    );
  }

  purgeGacha(gachaId: string, options: UpdateOptions = { persist: 'immediate' }): void {
    if (!gachaId) {
      return;
    }

    this.update(
      (previous) => {
        if (!previous) {
          return previous;
        }

        const hasMeta = Boolean(previous.meta?.[gachaId]);
        const isInOrder = previous.order?.includes(gachaId);

        if (!hasMeta && !isInOrder && previous.selectedGachaId !== gachaId) {
          return previous;
        }

        const timestamp = new Date().toISOString();
        const { [gachaId]: _removed, ...restMeta } = previous.meta ?? {};
        const nextOrder = (previous.order ?? []).filter((id) => id !== gachaId);
        const nextSelected = previous.selectedGachaId === gachaId ? nextOrder[0] ?? null : previous.selectedGachaId;

        if (Object.keys(restMeta).length === 0 && nextOrder.length === 0) {
          return undefined;
        }

        return {
          version: typeof previous.version === 'number' ? previous.version : 3,
          updatedAt: timestamp,
          meta: restMeta,
          order: nextOrder,
          selectedGachaId: nextSelected
        } satisfies GachaAppStateV3;
      },
      options
    );
  }

  removeGacha(gachaId: string, options: UpdateOptions = { persist: 'immediate' }): void {
    this.archiveGacha(gachaId, options);
  }
}
