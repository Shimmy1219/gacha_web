import {
  AppPersistence,
  type PtBundleV3,
  type PtGuaranteeV3,
  type PtSettingV3,
  type PtSettingsStateV3
} from '../app-persistence';
import { PersistedStore, type UpdateOptions } from './persistedStore';
import type { CompleteDrawMode } from '../../logic/gacha/types';

type LegacyPtSetting = PtSettingV3 & { complate?: PtSettingV3['complete'] };

const DEFAULT_COMPLETE_MODE: CompleteDrawMode = 'repeat';

export function resolveCompleteModePreference(state: PtSettingsStateV3 | undefined): CompleteDrawMode {
  if (state?.completeMode === 'frontload') {
    return 'frontload';
  }
  return DEFAULT_COMPLETE_MODE;
}

export function applyCompleteModeToSetting(
  setting: PtSettingV3 | undefined,
  completeMode: CompleteDrawMode
): PtSettingV3 | undefined {
  if (!setting?.complete) {
    return setting;
  }
  return {
    ...setting,
    complete: {
      ...setting.complete,
      mode: completeMode
    }
  };
}

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
  const aMode = a.mode ?? 'repeat';
  const bMode = b.mode ?? 'repeat';
  return a.price === b.price && aMode === bMode;
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

function areGuaranteeTargetsEqual(
  a: PtGuaranteeV3['target'],
  b: PtGuaranteeV3['target']
): boolean {
  if (a.type !== b.type) {
    return false;
  }
  if (a.type === 'item' && b.type === 'item') {
    return a.itemId === b.itemId;
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
      aEntry.quantity !== bEntry.quantity ||
      !areGuaranteeTargetsEqual(aEntry.target, bEntry.target)
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
    ...(setting.guarantees
      ? {
          guarantees: setting.guarantees.map((guarantee) => ({
            ...guarantee,
            target: { ...guarantee.target }
          }))
        }
      : {})
  };
}

export class PtControlsStore extends PersistedStore<PtSettingsStateV3 | undefined> {
  constructor(persistence: AppPersistence) {
    super(persistence);
  }

  hydrate(initialState: PtSettingsStateV3 | undefined): void {
    const sanitized = this.sanitizeState(initialState);
    super.hydrate(sanitized);
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
        const completeMode = resolveCompleteModePreference(previous);

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
          completeMode,
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

  setCompleteMode(mode: CompleteDrawMode, options: UpdateOptions = { persist: 'debounced' }): void {
    const persistMode = options.persist ?? 'debounced';
    const emit = options.emit;

    const resolvedMode: CompleteDrawMode = mode === 'frontload' ? 'frontload' : DEFAULT_COMPLETE_MODE;

    this.update(
      (previous) => {
        const current = resolveCompleteModePreference(previous);
        if (current === resolvedMode) {
          return previous;
        }

        const timestamp = new Date().toISOString();
        const nextState: PtSettingsStateV3 = {
          version: typeof previous?.version === 'number' ? previous.version : 3,
          updatedAt: timestamp,
          completeMode: resolvedMode,
          byGachaId: { ...(previous?.byGachaId ?? {}) }
        };

        return nextState;
      },
      { persist: persistMode, emit }
    );
  }

  removeGacha(gachaId: string, options: UpdateOptions = { persist: 'immediate' }): void {
    this.setGachaSettings(gachaId, undefined, options);
  }

  private sanitizeState(state: PtSettingsStateV3 | undefined): PtSettingsStateV3 | undefined {
    if (!state?.byGachaId) {
      return state;
    }

    let mutated = false;
    const nextByGacha: Record<string, PtSettingV3> = {};

    Object.entries(state.byGachaId).forEach(([gachaId, setting]) => {
      const sanitized = this.sanitizeSetting(setting as LegacyPtSetting);
      nextByGacha[gachaId] = sanitized;
      if (sanitized !== setting) {
        mutated = true;
      }
    });

    const nextCompleteMode: CompleteDrawMode =
      state.completeMode === 'frontload'
        ? 'frontload'
        : Object.values(nextByGacha).some((entry) => entry?.complete?.mode === 'frontload')
          ? 'frontload'
          : DEFAULT_COMPLETE_MODE;

    if (!mutated && state.completeMode === nextCompleteMode) {
      return state;
    }

    return {
      ...state,
      completeMode: nextCompleteMode,
      byGachaId: nextByGacha
    };
  }

  private sanitizeSetting(setting: LegacyPtSetting): PtSettingV3 {
    const upgradedGuarantees = Array.isArray(setting.guarantees)
      ? setting.guarantees.map((guarantee) => {
          const quantity =
            typeof guarantee.quantity === 'number' && Number.isFinite(guarantee.quantity) && guarantee.quantity > 0
              ? guarantee.quantity
              : 1;
          const target =
            guarantee.target && guarantee.target.type === 'item' && typeof guarantee.target.itemId === 'string'
              ? { type: 'item', itemId: guarantee.target.itemId }
              : { type: 'rarity' as const };
          return {
            ...guarantee,
            quantity,
            target
          };
        })
      : undefined;

    const base: PtSettingV3 = {
      ...setting,
      ...(upgradedGuarantees ? { guarantees: upgradedGuarantees } : {})
    };

    const legacyComplete = setting.complate;
    let next: PtSettingV3 = base;

    if (legacyComplete && typeof legacyComplete === 'object') {
      const mergedComplete = base.complete ? { ...legacyComplete, ...base.complete } : { ...legacyComplete };
      next = {
        ...base,
        complete: mergedComplete
      };
    }

    delete (next as LegacyPtSetting).complate;
    return next;
  }
}
