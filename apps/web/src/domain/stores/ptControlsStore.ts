import {
  AppPersistence,
  type PtBundleV3,
  type PtGuaranteeV3,
  type PtSettingV3,
  type PtSettingsStateV3
} from '../app-persistence';
import { PersistedStore, type UpdateOptions } from './persistedStore';

function isPerPullEqual(a: PtSettingV3['perPull'], b: PtSettingV3['perPull']): boolean {
  if (!a && !b) {
    return true;
  }
  if (!a || !b) {
    return false;
  }
  const aPulls = typeof a.pulls === 'number' ? a.pulls : 1;
  const bPulls = typeof b.pulls === 'number' ? b.pulls : 1;
  return a.price === b.price && aPulls === bPulls;
}

function isCompleteEqual(a: PtSettingV3['complete'], b: PtSettingV3['complete']): boolean {
  if (!a && !b) {
    return true;
  }
  if (!a || !b) {
    return false;
  }
  return a.price === b.price;
}

function areBundlesEqual(a: PtBundleV3[] | undefined, b: PtBundleV3[] | undefined): boolean {
  if (!a && !b) {
    return true;
  }
  if (!a || !b) {
    return false;
  }
  if (a.length !== b.length) {
    return false;
  }
  for (let index = 0; index < a.length; index += 1) {
    const aEntry = a[index];
    const bEntry = b[index];
    if (aEntry.id !== bEntry.id || aEntry.price !== bEntry.price || aEntry.pulls !== bEntry.pulls) {
      return false;
    }
  }
  return true;
}

function areGuaranteesEqual(a: PtGuaranteeV3[] | undefined, b: PtGuaranteeV3[] | undefined): boolean {
  if (!a && !b) {
    return true;
  }
  if (!a || !b) {
    return false;
  }
  if (a.length !== b.length) {
    return false;
  }
  for (let index = 0; index < a.length; index += 1) {
    const aEntry = a[index];
    const bEntry = b[index];
    if (
      aEntry.id !== bEntry.id ||
      aEntry.rarityId !== bEntry.rarityId ||
      aEntry.threshold !== bEntry.threshold ||
      aEntry.pityStep !== bEntry.pityStep
    ) {
      return false;
    }
  }
  return true;
}

function areSettingsEqual(a: PtSettingV3 | undefined, b: PtSettingV3 | undefined): boolean {
  if (!a && !b) {
    return true;
  }
  if (!a || !b) {
    return false;
  }
  return (
    isPerPullEqual(a.perPull, b.perPull) &&
    isCompleteEqual(a.complete, b.complete) &&
    areBundlesEqual(a.bundles, b.bundles) &&
    areGuaranteesEqual(a.guarantees, b.guarantees)
  );
}

function cloneSettingWithoutUpdatedAt(setting: PtSettingV3): PtSettingV3 {
  return {
    ...(setting.perPull ? { perPull: { ...setting.perPull } } : {}),
    ...(setting.complete ? { complete: { ...setting.complete } } : {}),
    ...(setting.bundles ? { bundles: setting.bundles.map((bundle) => ({ ...bundle })) } : {}),
    ...(setting.guarantees ? { guarantees: setting.guarantees.map((guarantee) => ({ ...guarantee })) } : {})
  };
}

export class PtControlsStore extends PersistedStore<PtSettingsStateV3 | undefined> {
  constructor(persistence: AppPersistence) {
    super(persistence);
  }

  setGachaSettings(
    gachaId: string,
    nextSetting: PtSettingV3 | undefined,
    options: UpdateOptions = { persist: 'debounced' }
  ): void {
    const persistMode = options.persist ?? 'debounced';
    const emit = options.emit;

    this.update(
      (previous) => {
        const previousSetting = previous?.byGachaId?.[gachaId];
        const comparableNext = nextSetting ? cloneSettingWithoutUpdatedAt(nextSetting) : undefined;

        if (areSettingsEqual(previousSetting ? cloneSettingWithoutUpdatedAt(previousSetting) : undefined, comparableNext)) {
          return previous;
        }

        const timestamp = new Date().toISOString();
        const nextByGacha = { ...(previous?.byGachaId ?? {}) };

        if (!nextSetting) {
          if (previousSetting === undefined) {
            return previous;
          }
          delete nextByGacha[gachaId];
        } else {
          nextByGacha[gachaId] = {
            ...cloneSettingWithoutUpdatedAt(nextSetting),
            updatedAt: timestamp
          };
        }

        const nextState: PtSettingsStateV3 = {
          version: typeof previous?.version === 'number' ? previous.version : 3,
          updatedAt: timestamp,
          byGachaId: nextByGacha
        };

        return nextState;
      },
      { persist: persistMode, emit }
    );
  }

  protected persistImmediate(state: PtSettingsStateV3 | undefined): void {
    this.persistence.savePtSettings(state);
  }

  protected persistDebounced(state: PtSettingsStateV3 | undefined): void {
    this.persistence.savePtSettingsDebounced(state);
  }

  removeGacha(gachaId: string, options: UpdateOptions = { persist: 'immediate' }): void {
    this.setGachaSettings(gachaId, undefined, options);
  }
}
