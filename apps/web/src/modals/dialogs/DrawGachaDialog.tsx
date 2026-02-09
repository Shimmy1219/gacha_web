import {
  ArrowPathIcon,
  ClipboardIcon,
  PaperAirplaneIcon,
  ShareIcon,
  SparklesIcon
} from '@heroicons/react/24/outline';
import { useCallback, useEffect, useMemo, useRef, useState, useId } from 'react';
import clsx from 'clsx';

import { SingleSelectDropdown, type SingleSelectOption } from '../../pages/gacha/components/select/SingleSelectDropdown';
import { ModalBody, ModalFooter, ConfirmDialog, type ModalComponentProps } from '..';
import { PageSettingsDialog } from './PageSettingsDialog';
import { DiscordMemberPickerDialog } from './DiscordMemberPickerDialog';
import { QuickSendConfirmDialog } from './QuickSendConfirmDialog';
import { useAppPersistence, useDomainStores } from '../../features/storage/AppPersistenceProvider';
import { useStoreValue } from '@domain/stores';
import { useShareHandler } from '../../hooks/useShare';
import { XLogoIcon } from '../../components/icons/XLogoIcon';
import { resolveSafeUrl } from '../../utils/safeUrl';
import { buildUserZipFromSelection } from '../../features/save/buildUserZip';
import { useBlobUpload } from '../../features/save/useBlobUpload';
import { useDiscordSession } from '../../features/discord/useDiscordSession';
import { linkDiscordProfileToStore } from '../../features/discord/linkDiscordProfileToStore';
import { useHaptics } from '../../features/haptics/HapticsProvider';
import {
  DiscordGuildSelectionMissingError,
  requireDiscordGuildSelection,
  type DiscordGuildSelection
} from '../../features/discord/discordGuildSelectionStorage';
import { ensurePrivateChannelCategory } from '../../features/discord/ensurePrivateChannelCategory';
import {
  isDiscordMissingPermissionsErrorCode,
  pushDiscordMissingPermissionsWarning
} from './_lib/discordApiErrorHandling';
import type {
  GachaAppStateV3,
  GachaCatalogStateV4,
  GachaRarityStateV3,
  PtSettingV3,
  UserProfileCardV3
} from '@domain/app-persistence';
import type { GachaResultPayload } from '@domain/gacha/gachaResult';
import {
  buildGachaPools,
  buildItemInventoryCountMap,
  calculateDrawPlan,
  executeGacha,
  executeGachaByPulls,
  inferRarityFractionDigits,
  normalizePtSetting,
  resolveRemainingStock,
  type DrawPlan,
  type GachaPoolDefinition
} from '../../logic/gacha';
import { getRarityTextPresentation } from '../../features/rarity/utils/rarityColorPresentation';

interface DrawGachaDialogResultItem {
  itemId: string;
  name: string;
  rarityId: string;
  rarityLabel: string;
  rarityColor?: string;
  count: number;
  guaranteedCount?: number;
  isNew?: boolean;
}

interface GachaDefinition {
  id: string;
  label: string;
  pool: GachaPoolDefinition;
  completeItemCount: number;
  items: Array<{
    itemId: string;
    name: string;
    rarityId: string;
    rarityLabel: string;
    rarityColor?: string;
  }>;
}

interface QueuedDiscordDeliveryRequest {
  userId: string;
  selection: DiscordGuildSelection;
  requestedAt: number;
  itemIdFilter?: string[];
}

function resolvePlanForPulls({
  pulls,
  gacha,
  ptSetting,
  completeExecutionsOverride,
  disableComplete
}: {
  pulls: number;
  gacha: GachaDefinition;
  ptSetting: PtSettingV3 | undefined;
  completeExecutionsOverride?: number | null;
  disableComplete?: boolean;
}): { plan: DrawPlan; points: number } | { error: string; warnings: string[] } {
  const { normalized } = normalizePtSetting(ptSetting);
  const priceCandidates: number[] = [];
  const unitPriceCandidates: number[] = [];

  if (normalized.perPull) {
    priceCandidates.push(normalized.perPull.price);
    unitPriceCandidates.push(normalized.perPull.price / normalized.perPull.pulls);
  }
  normalized.bundles.forEach((bundle) => {
    priceCandidates.push(bundle.price);
    unitPriceCandidates.push(bundle.price / bundle.pulls);
  });
  if (normalized.complete && !disableComplete) {
    priceCandidates.push(normalized.complete.price);
    if (gacha.completeItemCount > 0) {
      unitPriceCandidates.push(normalized.complete.price / gacha.completeItemCount);
    }
  }

  const minStep = priceCandidates.length > 0 ? Math.min(...priceCandidates) : 1;
  const unitPrice = unitPriceCandidates.length > 0 ? Math.min(...unitPriceCandidates) : 1;

  let points = Math.max(minStep, Math.ceil(pulls * unitPrice));
  let plan = calculateDrawPlan({
    points,
    settings: ptSetting,
    totalItemTypes: gacha.completeItemCount,
    completeExecutionsOverride: completeExecutionsOverride ?? undefined
  });

  let safety = 0;
  while (plan.totalPulls < pulls && safety < 1000) {
    points += minStep;
    plan = calculateDrawPlan({
      points,
      settings: ptSetting,
      totalItemTypes: gacha.completeItemCount,
      completeExecutionsOverride: completeExecutionsOverride ?? undefined
    });
    safety += 1;
  }

  if (plan.errors.length > 0 || plan.totalPulls <= 0) {
    const message = plan.errors[0] ?? 'ポイント設定を確認してください。';
    return { error: message, warnings: plan.warnings };
  }

  return { plan, points };
}

function formatNumber(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value) || !Number.isFinite(value)) {
    return '0';
  }
  const rounded = Math.round(value * 100) / 100;
  return new Intl.NumberFormat('ja-JP').format(rounded);
}

function buildGachaDefinitions(
  appState: GachaAppStateV3 | undefined,
  catalogState: GachaCatalogStateV4 | undefined,
  rarityState: GachaRarityStateV3 | undefined,
  inventoryCountsByItemId: ReturnType<typeof buildItemInventoryCountMap>,
  includeOutOfStockItems: boolean,
  includeOutOfStockInComplete: boolean
): { options: Array<SingleSelectOption<string>>; map: Map<string, GachaDefinition> } {
  const options: Array<SingleSelectOption<string>> = [];
  const map = new Map<string, GachaDefinition>();

  if (!catalogState?.byGacha) {
    return { options, map };
  }

  const rarityFractionDigits = inferRarityFractionDigits(rarityState);
  const { poolsByGachaId } = buildGachaPools({
    catalogState,
    rarityState,
    rarityFractionDigits,
    inventoryCountsByItemId,
    includeOutOfStockItems
  });

  const catalogByGacha = catalogState.byGacha;
  const orderFromAppState = appState?.order ?? Object.keys(catalogByGacha);
  const knownGacha = new Set<string>();

  const appendGacha = (gachaId: string) => {
    if (knownGacha.has(gachaId)) {
      return;
    }
    const pool = poolsByGachaId.get(gachaId);
    if (!pool || !pool.items.length) {
      return;
    }

    const definition: GachaDefinition = {
      id: gachaId,
      label: appState?.meta?.[gachaId]?.displayName ?? gachaId,
      pool,
      completeItemCount: includeOutOfStockInComplete
        ? pool.items.length
        : pool.items.filter((item) => item.remainingStock !== 0).length,
      items: pool.items.map((item) => ({
        itemId: item.itemId,
        name: item.name,
        rarityId: item.rarityId,
        rarityLabel: item.rarityLabel,
        rarityColor: item.rarityColor
      }))
    };

    knownGacha.add(gachaId);
    map.set(gachaId, definition);
    options.push({ value: gachaId, label: definition.label });
  };

  orderFromAppState.forEach(appendGacha);

  Object.keys(catalogByGacha).forEach((gachaId) => {
    appendGacha(gachaId);
  });

  return { options, map };
}

function formatExecutedAt(value: string | undefined): string {
  if (!value) {
    return '';
  }
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) {
    return value;
  }
  return new Intl.DateTimeFormat('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  }).format(date);
}

export function DrawGachaDialog({ close, push }: ModalComponentProps): JSX.Element {
  const {
    appState: appStateStore,
    catalog: catalogStore,
    rarities: rarityStore,
    ptControls,
    userProfiles,
    userInventories,
    pullHistory,
    uiPreferences: uiPreferencesStore
  } = useDomainStores();
  const appState = useStoreValue(appStateStore);
  const catalogState = useStoreValue(catalogStore);
  const rarityState = useStoreValue(rarityStore);
  const ptSettingsState = useStoreValue(ptControls);
  const userProfilesState = useStoreValue(userProfiles);
  const userInventoriesState = useStoreValue(userInventories);
  const pullHistoryState = useStoreValue(pullHistory);
  const uiPreferencesState = useStoreValue(uiPreferencesStore);
  const gachaSelectId = useId();
  const pointsInputId = useId();
  const pullsInputId = useId();
  const inventoryCountsByItemId = useMemo(
    () => buildItemInventoryCountMap(userInventoriesState?.byItemId),
    [userInventoriesState?.byItemId]
  );
  const lastPreferredGachaId = useMemo(
    () => uiPreferencesStore.getLastSelectedDrawGachaId() ?? undefined,
    [uiPreferencesState, uiPreferencesStore]
  );
  const quickSendNewOnlyPreference = useMemo(
    () => uiPreferencesStore.getQuickSendNewOnlyPreference(),
    [uiPreferencesState, uiPreferencesStore]
  );
  const excludeRiaguImagesPreference = useMemo(
    () => uiPreferencesStore.getExcludeRiaguImagesPreference(),
    [uiPreferencesState, uiPreferencesStore]
  );
  const completeOutOfStockPreference = useMemo(
    () => uiPreferencesStore.getCompleteGachaIncludeOutOfStockPreference(),
    [uiPreferencesState, uiPreferencesStore]
  );
  const excludeRiaguImages = excludeRiaguImagesPreference ?? false;
  const includeOutOfStockInComplete = completeOutOfStockPreference ?? false;
  const guaranteeOutOfStockPreference = useMemo(
    () => uiPreferencesStore.getGuaranteeOutOfStockItemPreference(),
    [uiPreferencesState, uiPreferencesStore]
  );
  const allowOutOfStockGuaranteeItem = guaranteeOutOfStockPreference ?? false;
  const applyLowerThresholdGuaranteesPreference = useMemo(
    () => uiPreferencesStore.getApplyLowerThresholdGuaranteesPreference(),
    [uiPreferencesState, uiPreferencesStore]
  );
  const applyLowerThresholdGuarantees = applyLowerThresholdGuaranteesPreference ?? true;
  const includeOutOfStockItems = includeOutOfStockInComplete || allowOutOfStockGuaranteeItem;
  const { triggerConfirmation, triggerError, triggerSelection } = useHaptics();

  const { options: gachaOptions, map: gachaMap } = useMemo(
    () =>
      buildGachaDefinitions(
        appState,
        catalogState,
        rarityState,
        inventoryCountsByItemId,
        includeOutOfStockItems,
        includeOutOfStockInComplete
      ),
    [appState, catalogState, includeOutOfStockInComplete, includeOutOfStockItems, inventoryCountsByItemId, rarityState]
  );

  const [selectedGachaId, setSelectedGachaId] = useState<string | undefined>(() => {
    if (lastPreferredGachaId && gachaOptions.some((option) => option.value === lastPreferredGachaId)) {
      return lastPreferredGachaId;
    }
    return gachaOptions[0]?.value;
  });
  const applySelectedGacha = useCallback(
    (nextId: string | undefined) => {
      setSelectedGachaId((previous) => (previous === nextId ? previous : nextId));
      uiPreferencesStore.setLastSelectedDrawGachaId(nextId ?? null, { persist: 'debounced' });
    },
    [uiPreferencesStore]
  );
  const handleGachaChange = useCallback(
    (value: string) => {
      applySelectedGacha(value);
    },
    [applySelectedGacha]
  );
  const [pointsInput, setPointsInput] = useState('100');
  const [pointsInputMode, setPointsInputMode] = useState<'points' | 'pulls'>('points');
  const [pullsInput, setPullsInput] = useState('10');
  const [completeExecutionsOverride, setCompleteExecutionsOverride] = useState<number | null>(null);
  const [userName, setUserName] = useState('');
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const [lastPullId, setLastPullId] = useState<string | null>(null);
  const [resultItems, setResultItems] = useState<DrawGachaDialogResultItem[] | null>(null);
  const [lastExecutedAt, setLastExecutedAt] = useState<string | undefined>(undefined);
  const [lastGachaLabel, setLastGachaLabel] = useState<string | undefined>(undefined);
  const [lastPointsSpent, setLastPointsSpent] = useState<number | null>(null);
  const [lastPointsRemainder, setLastPointsRemainder] = useState<number | null>(null);
  const [lastUsedManualPulls, setLastUsedManualPulls] = useState(false);
  const [lastExecutionWarnings, setLastExecutionWarnings] = useState<string[]>([]);
  const [lastPlan, setLastPlan] = useState<DrawPlan | null>(null);
  const [lastTotalPulls, setLastTotalPulls] = useState<number | null>(null);
  const [lastUserName, setLastUserName] = useState<string>('');
  const [lastUserId, setLastUserId] = useState<string | null>(null);
  const [queuedDiscordDelivery, setQueuedDiscordDelivery] = useState<QueuedDiscordDeliveryRequest | null>(null);
  const [isDiscordDelivering, setIsDiscordDelivering] = useState(false);
  const [discordDeliveryStage, setDiscordDeliveryStage] = useState<
    'idle' | 'building-zip' | 'uploading' | 'sending'
  >('idle');
  const [discordDeliveryError, setDiscordDeliveryError] = useState<string | null>(null);
  const [discordDeliveryNotice, setDiscordDeliveryNotice] = useState<string | null>(null);
  const [discordDeliveryCompleted, setDiscordDeliveryCompleted] = useState(false);
  const noticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!gachaOptions.length) {
      if (selectedGachaId !== undefined || lastPreferredGachaId !== undefined) {
        applySelectedGacha(undefined);
      }
      return;
    }

    if (selectedGachaId && gachaMap.has(selectedGachaId)) {
      return;
    }

    if (lastPreferredGachaId && gachaMap.has(lastPreferredGachaId)) {
      if (selectedGachaId !== lastPreferredGachaId) {
        applySelectedGacha(lastPreferredGachaId);
      }
      return;
    }

    const fallbackId = gachaOptions[0]?.value;
    if (fallbackId && selectedGachaId !== fallbackId) {
      applySelectedGacha(fallbackId);
    }
  }, [
    applySelectedGacha,
    gachaMap,
    gachaOptions,
    lastPreferredGachaId,
    selectedGachaId
  ]);

  const selectedGacha = selectedGachaId ? gachaMap.get(selectedGachaId) : undefined;
  const selectedPtSetting = selectedGachaId ? ptSettingsState?.byGachaId?.[selectedGachaId] : undefined;
  const hasGuaranteeOutOfStockBlocker = useMemo(() => {
    if (!selectedGacha || allowOutOfStockGuaranteeItem) {
      return false;
    }

    const guarantees = selectedPtSetting?.guarantees ?? [];
    if (!guarantees.length) {
      return false;
    }

    const catalog = catalogState?.byGacha?.[selectedGacha.id];
    if (!catalog?.items) {
      return false;
    }

    return guarantees.some((guarantee) => {
      if (guarantee?.target?.type !== 'item') {
        return false;
      }

      const itemId = guarantee?.target?.itemId;
      if (!itemId) {
        return false;
      }

      const snapshot = catalog.items[itemId];
      if (!snapshot) {
        return false;
      }

      if (typeof snapshot.stockCount !== 'number' || !Number.isFinite(snapshot.stockCount)) {
        return false;
      }

      const remaining = resolveRemainingStock(itemId, snapshot.stockCount, inventoryCountsByItemId);
      if (remaining !== 0) {
        return false;
      }

      const rarityId = guarantee.rarityId ?? snapshot.rarityId;
      const hasAlternative = Object.values(catalog.items).some((item) => {
        if (!item || item.itemId === itemId) {
          return false;
        }
        if (item.rarityId !== rarityId) {
          return false;
        }
        const candidateRemaining = resolveRemainingStock(item.itemId, item.stockCount, inventoryCountsByItemId);
        return candidateRemaining !== 0;
      });

      return !hasAlternative;
    });
  }, [
    allowOutOfStockGuaranteeItem,
    catalogState,
    inventoryCountsByItemId,
    selectedGacha,
    selectedPtSetting?.guarantees
  ]);

  useEffect(() => {
    setErrorMessage(null);
    setResultItems(null);
    setLastPullId(null);
    setLastPointsSpent(null);
    setLastPointsRemainder(null);
    setLastUsedManualPulls(false);
    setLastExecutionWarnings([]);
    setLastPlan(null);
    setLastTotalPulls(null);
    setLastUserName('');
    setLastUserId(null);
    setCompleteExecutionsOverride(null);
    setDiscordDeliveryError(null);
    setDiscordDeliveryNotice(null);
    setDiscordDeliveryCompleted(false);
    if (noticeTimerRef.current) {
      clearTimeout(noticeTimerRef.current);
      noticeTimerRef.current = null;
    }
  }, [selectedGachaId]);

  const parsedPoints = useMemo(() => {
    if (!pointsInput.trim()) {
      return NaN;
    }
    const value = Number(pointsInput);
    return Number.isFinite(value) ? value : NaN;
  }, [pointsInput]);

  const parsedPulls = useMemo(() => {
    if (!pullsInput.trim()) {
      return NaN;
    }
    const value = Number(pullsInput);
    return Number.isFinite(value) ? value : NaN;
  }, [pullsInput]);
  const requestedPulls = useMemo(
    () => (Number.isFinite(parsedPulls) ? Math.floor(parsedPulls) : null),
    [parsedPulls]
  );

  const adjustPointsInput = useCallback((delta: number) => {
    const current = Number(pointsInput);
    const base = Number.isFinite(current) ? current : 0;
    const nextValue = Math.max(0, base + delta);
    setPointsInput(String(nextValue));
  }, [pointsInput]);

  const adjustPullsInput = useCallback((delta: number) => {
    const current = Number(pullsInput);
    const base = Number.isFinite(current) ? current : 0;
    const nextValue = Math.max(1, base + delta);
    setPullsInput(String(nextValue));
  }, [pullsInput]);

  const handleQuickAdjust = useCallback((delta: number) => {
    if (pointsInputMode === 'pulls') {
      adjustPullsInput(delta);
      return;
    }
    adjustPointsInput(delta);
  }, [adjustPointsInput, adjustPullsInput, pointsInputMode]);

  const normalizedUserName = userName.trim();

  const userSuggestions = useMemo(() => {
    const users = userProfilesState?.users ?? {};
    const entries: UserProfileCardV3[] = Object.values(users);

    if (!entries.length) {
      return [] as UserProfileCardV3[];
    }

    const historyOrder = pullHistoryState?.order ?? [];
    const historyEntries = pullHistoryState?.pulls ?? {};
    const latestIndexByUserId = new Map<string, number>();
    historyOrder.forEach((pullId, index) => {
      const entry = historyEntries[pullId];
      const userId = entry?.userId;
      if (userId && !latestIndexByUserId.has(userId)) {
        latestIndexByUserId.set(userId, index);
      }
    });

    const query = normalizedUserName.toLowerCase();
    const filtered = query
      ? entries.filter((profile) => profile.displayName.toLowerCase().includes(query))
      : entries;

    const sorted = [...filtered].sort((a, b) => {
      const indexA = latestIndexByUserId.get(a.id);
      const indexB = latestIndexByUserId.get(b.id);
      if (indexA != null && indexB != null) {
        return indexA - indexB;
      }
      if (indexA != null) {
        return -1;
      }
      if (indexB != null) {
        return 1;
      }
      return a.displayName.localeCompare(b.displayName, 'ja');
    });

    return sorted.slice(0, 8);
  }, [normalizedUserName, pullHistoryState, userProfilesState]);

  const { share: shareResult, copy: copyShareText, feedback: shareFeedback } = useShareHandler();
  const { uploadZip } = useBlobUpload();
  const { data: discordSession } = useDiscordSession();
  const persistence = useAppPersistence();
  const isPullsMode = pointsInputMode === 'pulls';
  const completeExecutionsOverrideForPlan = isPullsMode ? 0 : completeExecutionsOverride;

  const resolveOwnerName = useCallback(() => {
    const prefs = persistence.loadSnapshot().receivePrefs;
    return prefs?.ownerName?.trim() ?? '';
  }, [persistence]);

  const ensureOwnerName = useCallback(() => {
    const ownerName = resolveOwnerName();
    if (ownerName) {
      return ownerName;
    }
    push(ConfirmDialog, {
      id: 'owner-name-warning',
      title: 'オーナー名の設定',
      size: 'sm',
      payload: {
        message: 'オーナー名が未設定です。共有リンクを作成する前にサイト設定でオーナー名を設定してください。',
        confirmLabel: '設定を開く',
        cancelLabel: '閉じる',
        onConfirm: () => {
          push(PageSettingsDialog, {
            id: 'page-settings',
            title: 'ページ設定',
            size: 'lg',
            panelClassName: 'page-settings-modal overflow-hidden',
            showHeaderCloseButton: true
          });
        }
      }
    });
    return null;
  }, [push, resolveOwnerName]);

  const planResolution = useMemo(() => {
    if (!selectedGacha) {
      return { plan: null, points: NaN, error: null as string | null };
    }

    if (pointsInputMode === 'pulls') {
      if (!Number.isFinite(parsedPulls) || parsedPulls <= 0) {
        return { plan: null, points: NaN, error: '連数を入力してください。' };
      }
      const resolved = resolvePlanForPulls({
        pulls: Math.floor(parsedPulls),
        gacha: selectedGacha,
        ptSetting: selectedPtSetting,
        completeExecutionsOverride: completeExecutionsOverrideForPlan,
        disableComplete: isPullsMode
      });
      if ('error' in resolved) {
        return { plan: null, points: NaN, error: resolved.error };
      }
      return { plan: resolved.plan, points: resolved.points, error: null };
    }

    return {
      plan: calculateDrawPlan({
        points: parsedPoints,
        settings: selectedPtSetting,
        totalItemTypes: selectedGacha.completeItemCount,
        completeExecutionsOverride: completeExecutionsOverrideForPlan ?? undefined
      }),
      points: parsedPoints,
      error: null
    };
  }, [
    completeExecutionsOverrideForPlan,
    completeExecutionsOverride,
    parsedPoints,
    parsedPulls,
    pointsInputMode,
    selectedGacha,
    selectedPtSetting
  ]);

  const drawPlan = planResolution.plan;
  const resolvedPoints = planResolution.points;
  const planErrorMessage = planResolution.error;
  const pullsMismatch =
    isPullsMode && requestedPulls != null && drawPlan != null && drawPlan.totalPulls !== requestedPulls;
  const displayPlan = useMemo(() => {
    if (!drawPlan || !isPullsMode || requestedPulls == null) {
      return drawPlan;
    }
    const sanitized = Math.max(0, requestedPulls);
    return {
      ...drawPlan,
      completeExecutions: 0,
      completePulls: 0,
      randomPulls: sanitized,
      totalPulls: sanitized
    };
  }, [drawPlan, isPullsMode, requestedPulls]);
  const showUnknownPoints = pullsMismatch;
  const displayPulls = useMemo(() => {
    if (!displayPlan) {
      return null;
    }
    if (isPullsMode && requestedPulls != null) {
      return Math.max(0, requestedPulls);
    }
    return displayPlan.totalPulls;
  }, [displayPlan, isPullsMode, requestedPulls]);

  const executeGachaDraw = useCallback(
    async ({ bypassPullsMismatchWarning = false }: { bypassPullsMismatchWarning?: boolean } = {}) => {
      if (isExecuting) {
        return;
      }
      triggerSelection();

      setErrorMessage(null);
      setLastPullId(null);
      setDiscordDeliveryError(null);
      setDiscordDeliveryNotice(null);
      setDiscordDeliveryCompleted(false);
      if (noticeTimerRef.current) {
        clearTimeout(noticeTimerRef.current);
        noticeTimerRef.current = null;
      }
      setLastUserId(null);

      if (!selectedGacha) {
        setErrorMessage('ガチャの種類を選択してください。');
        setResultItems(null);
        setLastTotalPulls(null);
        setLastUserName('');
        triggerError();
        return;
      }

      if (!normalizedUserName) {
        setErrorMessage('ユーザー名を入力してください。');
        setResultItems(null);
        setLastTotalPulls(null);
        setLastUserName('');
        triggerError();
        return;
      }

      if (planErrorMessage || !drawPlan || drawPlan.errors.length > 0) {
        setErrorMessage(planErrorMessage ?? drawPlan?.errors?.[0] ?? 'ポイント設定を確認してください。');
        setResultItems(null);
        setLastTotalPulls(null);
        setLastUserName('');
        triggerError();
        return;
      }

      if (!selectedGacha.items.length) {
        setErrorMessage('選択したガチャに登録されているアイテムがありません。');
        setResultItems(null);
        setLastTotalPulls(null);
        setLastUserName('');
        triggerError();
        return;
      }

      if (!bypassPullsMismatchWarning && pullsMismatch && requestedPulls != null) {
        push(ConfirmDialog, {
          id: 'draw-pulls-mismatch-warning',
          title: '警告',
          size: 'sm',
          payload: {
            message: `お得バンドルをどう組み合わせても、${formatNumber(
              requestedPulls
            )}連になることはありませんがこのまま進みますか？`,
            confirmLabel: 'このまま進む',
            cancelLabel: 'キャンセル',
            onConfirm: () => {
              void executeGachaDraw({ bypassPullsMismatchWarning: true });
            }
          }
        });
        return;
      }

      const useManualPulls = pullsMismatch && requestedPulls != null;

      setIsExecuting(true);
      try {
        const executionResult = useManualPulls
          ? executeGachaByPulls({
              gachaId: selectedGacha.id,
              pool: selectedGacha.pool,
              settings: selectedPtSetting,
              pulls: requestedPulls ?? 0,
              includeOutOfStockInComplete,
              allowOutOfStockGuaranteeItem,
              applyLowerThresholdGuarantees
            })
          : executeGacha({
              gachaId: selectedGacha.id,
              pool: selectedGacha.pool,
              settings: selectedPtSetting,
              points: resolvedPoints,
              completeExecutionsOverride: completeExecutionsOverrideForPlan ?? undefined,
              includeOutOfStockInComplete,
              allowOutOfStockGuaranteeItem,
              applyLowerThresholdGuarantees
            });

        if (executionResult.errors.length > 0) {
          setErrorMessage(executionResult.errors[0]);
          setResultItems(null);
          setLastTotalPulls(null);
          setLastUserName('');
          triggerError();
          return;
        }

        if (!executionResult.items.length) {
          setErrorMessage('ガチャ結果を生成できませんでした。');
          setResultItems(null);
          setLastTotalPulls(null);
          setLastUserName('');
          triggerError();
          return;
        }

        const itemsForStore: GachaResultPayload['items'] = executionResult.items.map((item) => ({
          itemId: item.itemId,
          rarityId: item.rarityId,
          count: item.count
        }));

        const executedAt = new Date().toISOString();
        const userId = normalizedUserName ? userProfiles.ensureProfile(normalizedUserName) : undefined;
        const inventoryByItemId = userId ? (userInventoriesState?.byItemId ?? {}) : null;

        const aggregatedItems: DrawGachaDialogResultItem[] = executionResult.items.map((item) => {
          const existingEntries = inventoryByItemId?.[item.itemId] ?? [];
          const alreadyOwned = userId
            ? existingEntries.some(
                (entry) =>
                  entry.userId === userId &&
                  entry.gachaId === selectedGacha.id &&
                  entry.count > 0
              )
            : false;

          return {
            itemId: item.itemId,
            name: item.name,
            rarityId: item.rarityId,
            rarityLabel: item.rarityLabel,
            rarityColor: item.rarityColor,
            count: item.count,
            guaranteedCount: item.guaranteedCount > 0 ? item.guaranteedCount : undefined,
            isNew: userId ? !alreadyOwned : false
          };
        });

        const newItemIds = Array.from(
          new Set(aggregatedItems.filter((item) => item.isNew).map((item) => item.itemId))
        );

        const payload: GachaResultPayload = {
          gachaId: selectedGacha.id,
          userId,
          executedAt,
          pullCount: executionResult.totalPulls,
          currencyUsed: useManualPulls ? undefined : executionResult.pointsSpent,
          items: itemsForStore,
          newItems: newItemIds.length > 0 ? newItemIds : undefined
        };

        console.info('【デバッグ】ガチャを引きました', {
          ガチャID: selectedGacha.id,
          ユーザーID: userId ?? '未指定',
          実行日時: executedAt,
          連続回数: executionResult.totalPulls,
          消費ポイント: useManualPulls ? '???' : executionResult.pointsSpent,
          抽選アイテム数: itemsForStore.length
        });

        const pullId = pullHistory.recordGachaResult(payload);
        if (!pullId) {
          setErrorMessage('ガチャ結果の保存に失敗しました。');
          setResultItems(null);
          setLastTotalPulls(null);
          setLastUserName('');
          return;
        }

        setResultItems(aggregatedItems);
        setLastPullId(pullId);
        setLastExecutedAt(executedAt);
        setLastGachaLabel(selectedGacha.label);
        setLastPointsSpent(useManualPulls ? null : executionResult.pointsSpent);
        setLastPointsRemainder(useManualPulls ? null : executionResult.pointsRemainder);
        setLastUsedManualPulls(useManualPulls);
        setLastExecutionWarnings(executionResult.warnings);
        setLastPlan(executionResult.plan);
        setLastTotalPulls(executionResult.totalPulls);
        setLastUserName(normalizedUserName);
        setLastUserId(userId ?? null);
        triggerConfirmation();
      } catch (error) {
        console.error('ガチャ実行中にエラーが発生しました', error);
        setErrorMessage('ガチャの実行中にエラーが発生しました。');
        setResultItems(null);
        setLastTotalPulls(null);
        setLastUserName('');
        setLastPointsSpent(null);
        setLastPointsRemainder(null);
        setLastUsedManualPulls(false);
        setLastExecutionWarnings([]);
        setLastPlan(null);
        setLastUserId(null);
        triggerError();
      } finally {
        setIsExecuting(false);
      }
    },
    [
      allowOutOfStockGuaranteeItem,
      applyLowerThresholdGuarantees,
      completeExecutionsOverrideForPlan,
      drawPlan,
      includeOutOfStockInComplete,
      isExecuting,
      normalizedUserName,
      planErrorMessage,
      pullHistory,
      pullsMismatch,
      push,
      requestedPulls,
      resolvedPoints,
      selectedGacha,
      selectedPtSetting,
      triggerConfirmation,
      triggerError,
      triggerSelection,
      userInventoriesState?.byItemId,
      userProfiles
    ]
  );

  const handleExecute = () => {
    void executeGachaDraw();
  };

  const executedAtLabel = formatExecutedAt(lastExecutedAt);
  const integerFormatter = useMemo(() => new Intl.NumberFormat('ja-JP'), []);
  const totalCount = resultItems?.reduce((total, item) => total + item.count, 0) ?? 0;
  const newResultItemIds = useMemo(() => {
    if (!resultItems) {
      return [];
    }
    const ids = resultItems.filter((item) => item.isNew).map((item) => item.itemId);
    return Array.from(new Set(ids));
  }, [resultItems]);
  const rarityOrderIds = useMemo(() => {
    if (!selectedGacha) {
      return [];
    }
    const orderFromState = rarityState?.byGacha?.[selectedGacha.id];
    if (orderFromState && orderFromState.length > 0) {
      return orderFromState;
    }
    return Array.from(selectedGacha.pool.rarityGroups.keys());
  }, [rarityState, selectedGacha]);
  const rarityOrderIndex = useMemo(() => {
    const map = new Map<string, number>();
    rarityOrderIds.forEach((rarityId, index) => {
      map.set(rarityId, index);
    });
    return map;
  }, [rarityOrderIds]);
  const itemOrderIndex = useMemo(() => {
    const map = new Map<string, number>();
    if (!selectedGacha) {
      return map;
    }
    selectedGacha.items.forEach((item, index) => {
      map.set(item.itemId, index);
    });
    return map;
  }, [selectedGacha]);
  const sortedResultItems = useMemo(() => {
    if (!resultItems) {
      return null;
    }
    const items = [...resultItems];
    items.sort((a, b) => {
      const rarityOrderA = rarityOrderIndex.get(a.rarityId) ?? Number.POSITIVE_INFINITY;
      const rarityOrderB = rarityOrderIndex.get(b.rarityId) ?? Number.POSITIVE_INFINITY;
      if (rarityOrderA !== rarityOrderB) {
        return rarityOrderA - rarityOrderB;
      }
      const itemOrderA = itemOrderIndex.get(a.itemId) ?? Number.POSITIVE_INFINITY;
      const itemOrderB = itemOrderIndex.get(b.itemId) ?? Number.POSITIVE_INFINITY;
      if (itemOrderA !== itemOrderB) {
        return itemOrderA - itemOrderB;
      }
      return a.name.localeCompare(b.name, 'ja');
    });
    return items;
  }, [itemOrderIndex, rarityOrderIndex, resultItems]);
  const planWarnings = displayPlan?.warnings ?? [];
  const normalizedCompleteSetting = displayPlan?.normalizedSettings.complete;
  const maxCompleteExecutions = useMemo(() => {
    if (isPullsMode || !normalizedCompleteSetting || !Number.isFinite(resolvedPoints)) {
      return 0;
    }
    if (!Number.isFinite(normalizedCompleteSetting.price) || normalizedCompleteSetting.price <= 0) {
      return 0;
    }
    return Math.max(0, Math.floor(resolvedPoints / normalizedCompleteSetting.price));
  }, [normalizedCompleteSetting, resolvedPoints]);
  const currentCompleteExecutions = useMemo(() => {
    if (isPullsMode) {
      return 0;
    }
    if (!normalizedCompleteSetting) {
      return 0;
    }
    if (completeExecutionsOverride != null && Number.isFinite(completeExecutionsOverride)) {
      return Math.min(maxCompleteExecutions, Math.max(0, Math.floor(completeExecutionsOverride)));
    }
    return displayPlan?.completeExecutions ?? 0;
  }, [
    completeExecutionsOverride,
    displayPlan,
    isPullsMode,
    maxCompleteExecutions,
    normalizedCompleteSetting
  ]);
  const completePointsUsed = useMemo(() => {
    if (!normalizedCompleteSetting) {
      return 0;
    }
    return Math.max(0, normalizedCompleteSetting.price * currentCompleteExecutions);
  }, [currentCompleteExecutions, normalizedCompleteSetting]);

  useEffect(() => {
    if (isPullsMode) {
      return;
    }
    if (!normalizedCompleteSetting) {
      if (completeExecutionsOverride != null) {
        setCompleteExecutionsOverride(null);
      }
      return;
    }
    if (completeExecutionsOverride == null) {
      return;
    }
    const clamped = Math.min(maxCompleteExecutions, Math.max(0, Math.floor(completeExecutionsOverride)));
    if (!Number.isFinite(clamped)) {
      if (completeExecutionsOverride !== 0) {
        setCompleteExecutionsOverride(0);
      }
      return;
    }
    if (clamped !== completeExecutionsOverride) {
      setCompleteExecutionsOverride(clamped);
    }
  }, [completeExecutionsOverride, isPullsMode, maxCompleteExecutions, normalizedCompleteSetting]);

  const handleCompleteAdjust = useCallback(
    (delta: number) => {
      if (isPullsMode || !normalizedCompleteSetting) {
        return;
      }
      const next = Math.min(maxCompleteExecutions, Math.max(0, currentCompleteExecutions + delta));
      setCompleteExecutionsOverride(next);
    },
    [currentCompleteExecutions, isPullsMode, maxCompleteExecutions, normalizedCompleteSetting]
  );
  const guaranteeSummaries = useMemo(() => {
    if (!displayPlan || !selectedGacha) {
      return [] as Array<{
        rarityId: string;
        threshold: number;
        description: string;
        applies: boolean;
      }>;
    }

    const eligibleThresholds = applyLowerThresholdGuarantees
      ? null
      : displayPlan.normalizedSettings.guarantees
          .filter((guarantee) => displayPlan.totalPulls >= guarantee.threshold)
          .map((guarantee) => guarantee.threshold);
    const maxApplicableThreshold =
      eligibleThresholds && eligibleThresholds.length > 0 ? Math.max(...eligibleThresholds) : null;

    return displayPlan.normalizedSettings.guarantees.map((guarantee) => {
      const rarity = selectedGacha.pool.rarityGroups.get(guarantee.rarityId);
      const rarityEntity = rarityState?.entities?.[guarantee.rarityId];
      const label =
        rarity?.label ??
        (rarityEntity && (!rarityEntity.gachaId || rarityEntity.gachaId === selectedGacha.id)
          ? rarityEntity.label
          : null) ??
        guarantee.rarityId;
      let targetLabel = 'レアリティ内からランダムに';
      if (guarantee.targetType === 'item' && guarantee.itemId) {
        const item = selectedGacha.pool.items.find((entry) => entry.itemId === guarantee.itemId);
        if (item) {
          targetLabel = `${item.name}を`;
        } else {
          targetLabel = '指定アイテムを';
        }
      }
      const description = `${label}: ${guarantee.threshold}連以上で${targetLabel}${guarantee.quantity}個保証`;
      const applies = applyLowerThresholdGuarantees
        ? displayPlan.totalPulls >= guarantee.threshold
        : maxApplicableThreshold != null && guarantee.threshold === maxApplicableThreshold;
      return {
        rarityId: guarantee.rarityId,
        threshold: guarantee.threshold,
        description,
        applies
      };
    });
  }, [applyLowerThresholdGuarantees, displayPlan, rarityState, selectedGacha]);

  const shareContent = useMemo(() => {
    if (!resultItems || resultItems.length === 0) {
      return null;
    }

    const shareUserName = (lastUserName || normalizedUserName || '名無し').trim() || '名無し';
    const fallbackPullCount = resultItems.reduce((total, item) => total + item.count, 0);
    const pullCount =
      lastTotalPulls != null
        ? lastTotalPulls
        : lastPlan?.totalPulls != null
          ? lastPlan.totalPulls
          : fallbackPullCount;
    const pullCountValue = Math.max(0, pullCount);
    const pullCountLabel = `${integerFormatter.format(pullCountValue)}連`;

    const positiveItemLines = resultItems
      .filter((item) => item.count > 0)
      .map((item) => {
        const rarityLabel = item.rarityLabel ?? '景品';
        const countLabel = `${integerFormatter.format(item.count)}個`;
        return `【${rarityLabel}】${item.name}：${countLabel}`;
      });

    const gachaLabel = lastGachaLabel ?? '四遊楽ガチャ';
    const shareLines = [`【${gachaLabel}結果】`, `${shareUserName} ${pullCountLabel}`, ''];
    if (positiveItemLines.length > 0) {
      shareLines.push(...positiveItemLines, '');
    }
    shareLines.push('#四遊楽ガチャ(β)');
    const shareText = shareLines.join('\n');

    const urlParams = new URLSearchParams();
    urlParams.set('button_hashtag', '四遊楽ガチャ');
    urlParams.set('ref_src', 'twsrc%5Etfw');
    urlParams.set('text', shareText);
    const tweetUrl = `https://twitter.com/intent/tweet?${urlParams.toString()}`;

    return { shareText, tweetUrl };
  }, [
    integerFormatter,
    lastGachaLabel,
    lastPlan?.totalPulls,
    lastTotalPulls,
    lastUserName,
    normalizedUserName,
    resultItems
  ]);
  const safeTweetUrl = useMemo(
    () => (shareContent ? resolveSafeUrl(shareContent.tweetUrl, { allowedProtocols: ['https:'] }) : null),
    [shareContent?.tweetUrl]
  );

  const shareStatus = shareFeedback?.entryKey === 'draw-result' ? shareFeedback.status : null;
  const isDiscordLoggedIn = discordSession?.loggedIn === true;
  const staffDiscordId = discordSession?.user?.id ?? null;
  const staffDiscordName = discordSession?.user?.name ?? null;
  const lastUserProfile = lastUserId ? userProfilesState?.users?.[lastUserId] : undefined;
  const canDeliverToDiscord = Boolean(
    resultItems &&
      lastPullId &&
      lastUserId &&
      isDiscordLoggedIn &&
      staffDiscordId
  );
  const discordDeliveryButtonDisabled =
    isDiscordDelivering || queuedDiscordDelivery !== null || !canDeliverToDiscord;
  const isDiscordDeliveryInProgress = isDiscordDelivering || queuedDiscordDelivery !== null;
  const discordDeliveryButtonMinWidth = '14.5rem';
  const discordDeliveryButtonLabel = useMemo(() => {
    if (discordDeliveryCompleted) {
      return '送信済み';
    }
    switch (discordDeliveryStage) {
      case 'building-zip':
        return 'ZIPファイル作成中...';
      case 'uploading':
        return 'ファイルアップロード中...';
      case 'sending':
        return '送信中...';
      default:
        return 'お渡し部屋に景品を送信';
    }
  }, [discordDeliveryCompleted, discordDeliveryStage]);

  useEffect(() => {
    return () => {
      if (noticeTimerRef.current) {
        clearTimeout(noticeTimerRef.current);
        noticeTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!discordDeliveryNotice) {
      return;
    }
    if (noticeTimerRef.current) {
      clearTimeout(noticeTimerRef.current);
    }
    noticeTimerRef.current = window.setTimeout(() => {
      setDiscordDeliveryNotice(null);
      noticeTimerRef.current = null;
    }, 4000);
  }, [discordDeliveryNotice]);

  const requestQuickSendPreference = useCallback(() => {
    return new Promise<{ sendNewOnly: boolean; rememberChoice: boolean } | null>((resolve) => {
      let settled = false;
      const finalize = (value: { sendNewOnly: boolean; rememberChoice: boolean } | null) => {
        if (settled) {
          return;
        }
        settled = true;
        resolve(value);
      };

      push(QuickSendConfirmDialog, {
        id: 'quick-send-confirm',
        title: '送信対象の確認',
        size: 'sm',
        panelClassName: 'overflow-hidden',
        payload: {
          onConfirm: (result) => finalize(result)
        },
        onClose: () => finalize(null)
      });
    });
  }, [push]);

  const resolveQuickSendNewOnly = useCallback(async () => {
    if (quickSendNewOnlyPreference !== null) {
      return quickSendNewOnlyPreference;
    }
    const decision = await requestQuickSendPreference();
    if (!decision) {
      return null;
    }
    if (decision.rememberChoice) {
      uiPreferencesStore.setQuickSendNewOnlyPreference(decision.sendNewOnly, { persist: 'immediate' });
    }
    return decision.sendNewOnly;
  }, [quickSendNewOnlyPreference, requestQuickSendPreference, uiPreferencesStore]);

  const handleShareResult = useCallback(() => {
    if (!shareContent) {
      return;
    }
    void shareResult('draw-result', shareContent.shareText);
  }, [shareContent, shareResult]);

  const queuedDeliveryProcessingRef = useRef<string | null>(null);

  const performDiscordDelivery = useCallback(
    async ({
      profile,
      targetUserId,
      guildSelection: selectionOverride,
      itemIdFilter
    }: {
      profile: UserProfileCardV3;
      targetUserId: string;
      guildSelection?: DiscordGuildSelection;
      itemIdFilter?: string[];
    }) => {
      setDiscordDeliveryCompleted(false);
      if (!resultItems || resultItems.length === 0) {
        const message = '共有できるガチャ結果がありません。';
        setDiscordDeliveryError(message);
        throw new Error(message);
      }
      if (!lastPullId) {
        const message = '共有する履歴が見つかりませんでした。';
        setDiscordDeliveryError(message);
        throw new Error(message);
      }
      if (!targetUserId) {
        const message = '共有対象のユーザー情報が見つかりませんでした。';
        setDiscordDeliveryError(message);
        throw new Error(message);
      }
      if (!isDiscordLoggedIn) {
        const message = 'Discordにログインしてから共有してください。';
        setDiscordDeliveryError(message);
        throw new Error(message);
      }
      if (!staffDiscordId) {
        const message = 'Discordアカウントの情報を取得できませんでした。再度ログインしてください。';
        setDiscordDeliveryError(message);
        throw new Error(message);
      }

      const trimOrNull = (value: string | null | undefined): string | null => {
        if (typeof value !== 'string') {
          return null;
        }
        const trimmed = value.trim();
        return trimmed ? trimmed : null;
      };

      const sharedMemberId = trimOrNull(profile.discordUserId);
      if (!sharedMemberId) {
        const message = 'Discord連携ユーザーのIDを確認できませんでした。';
        setDiscordDeliveryError(message);
        throw new Error(message);
      }

      const ownerName = ensureOwnerName();
      if (!ownerName) {
        return;
      }

      setIsDiscordDelivering(true);
      setDiscordDeliveryStage('building-zip');
      setDiscordDeliveryError(null);

      try {
        const snapshot = persistence.loadSnapshot();

        const profileDisplayName = profile.displayName?.trim();
        const receiverDisplayName =
          profileDisplayName && profileDisplayName.length > 0
            ? profileDisplayName
            : lastUserName && lastUserName.trim().length > 0
              ? lastUserName.trim()
              : normalizedUserName && normalizedUserName.length > 0
                ? normalizedUserName
                : profile.id || targetUserId;

        const selection = { mode: 'history', pullIds: [lastPullId] } as const;

        const filteredItemIds =
          itemIdFilter && itemIdFilter.length > 0 ? new Set(itemIdFilter) : undefined;
        const zip = await buildUserZipFromSelection({
          snapshot,
          selection,
          userId: targetUserId,
          userName: receiverDisplayName,
          ownerName,
          itemIdFilter: filteredItemIds,
          excludeRiaguImages
        });

        setDiscordDeliveryStage('uploading');

        const uploadResponse = await uploadZip({
          file: zip.blob,
          fileName: zip.fileName,
          userId: targetUserId,
          receiverName: receiverDisplayName,
          ownerDiscordId: staffDiscordId,
          ownerDiscordName: staffDiscordName ?? undefined
        });

        if (!uploadResponse?.shareUrl) {
          throw new Error('Discord共有に必要なURLを取得できませんでした。');
        }

        if (zip.pullIds.length > 0) {
          pullHistory.markPullStatus(zip.pullIds, 'uploaded');
          pullHistory.markPullOriginalPrizeMissing(zip.pullIds, zip.originalPrizeMissingPullIds);
        }

        const guildSelection = selectionOverride ?? requireDiscordGuildSelection(staffDiscordId);

        const pickDisplayName = (
          ...candidates: Array<string | null | undefined>
        ): string => {
          for (const candidate of candidates) {
            if (typeof candidate === 'string') {
              const trimmed = candidate.trim();
              if (trimmed) {
                return trimmed;
              }
            }
          }
          return sharedMemberId;
        };

        const memberDisplayName = pickDisplayName(
          profile.discordDisplayName,
          receiverDisplayName,
          profile.displayName,
          profile.discordUserName,
          profile.id
        );

        let channelId = trimOrNull(profile.discordLastShareChannelId);
        const storedChannelName = profile.discordLastShareChannelName;
        let channelName =
          storedChannelName === null ? null : trimOrNull(storedChannelName ?? undefined);
        const storedParentId = profile.discordLastShareChannelParentId;
        let channelParentId =
          storedParentId === null ? null : trimOrNull(storedParentId ?? undefined);

        const shareUrl = uploadResponse.shareUrl;
        const shareLabelCandidate = shareUrl ?? null;
        const shareTitle = `${receiverDisplayName ?? '景品'}のお渡しリンクです`;
        const shareComment =
          shareLabelCandidate && shareLabelCandidate !== shareUrl ? shareLabelCandidate : null;

        let preferredCategory = channelParentId ?? guildSelection.privateChannelCategory?.id ?? null;

        if (!channelId && !preferredCategory) {
          const category = await ensurePrivateChannelCategory({
            push,
            discordUserId: staffDiscordId,
            guildSelection,
            dialogTitle: 'お渡しカテゴリの設定'
          });
          preferredCategory = category.id;
        }

        if (!channelId) {
          if (!preferredCategory) {
            throw new Error('お渡しチャンネルのカテゴリが設定されていません。Discord共有設定を確認してください。');
          }

          const params = new URLSearchParams({
            guild_id: guildSelection.guildId,
            member_id: sharedMemberId,
            create: '1'
          });
          params.set('category_id', preferredCategory);
          const displayNameForChannel = pickDisplayName(
            profile.discordDisplayName,
            receiverDisplayName,
            profile.displayName
          );
          if (displayNameForChannel) {
            params.set('display_name', displayNameForChannel);
          }

          const findResponse = await fetch(`/api/discord/find-channels?${params.toString()}`, {
            headers: {
              Accept: 'application/json'
            },
            credentials: 'include'
          });

          const findPayload = (await findResponse.json().catch(() => null)) as {
            ok: boolean;
            channel_id?: string | null;
            channel_name?: string | null;
            parent_id?: string | null;
            created?: boolean;
            error?: string;
            errorCode?: string;
          } | null;

          if (!findResponse.ok || !findPayload) {
            const message =
              findPayload?.error || `お渡しチャンネルの確認に失敗しました (${findResponse.status})`;
            if (isDiscordMissingPermissionsErrorCode(findPayload?.errorCode)) {
              pushDiscordMissingPermissionsWarning(push, message);
              throw new Error('Discord botの権限が不足しています。');
            }
            throw new Error(message);
          }

          if (!findPayload.ok) {
            const message = findPayload.error || 'お渡しチャンネルの確認に失敗しました';
            if (isDiscordMissingPermissionsErrorCode(findPayload?.errorCode)) {
              pushDiscordMissingPermissionsWarning(push, message);
              throw new Error('Discord botの権限が不足しています。');
            }
            throw new Error(message);
          }

          channelId = trimOrNull(findPayload.channel_id);
          channelName =
            findPayload.channel_name === null
              ? null
              : trimOrNull(findPayload.channel_name ?? undefined);
          channelParentId =
            findPayload.parent_id === null
              ? null
              : trimOrNull(findPayload.parent_id ?? undefined);
        }

        if (!channelId) {
          throw new Error('お渡しチャンネルの情報が見つかりませんでした。');
        }

        setDiscordDeliveryStage('sending');

        const payload: Record<string, unknown> = {
          channel_id: channelId,
          share_url: shareUrl,
          title: shareTitle,
          mode: 'bot'
        };
        if (shareComment) {
          payload.comment = shareComment;
        }

        const sendResponse = await fetch('/api/discord/send', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json'
          },
          credentials: 'include',
          body: JSON.stringify(payload)
        });

        const sendPayload = (await sendResponse
          .json()
          .catch(() => ({ ok: false, error: 'unexpected response' }))) as {
          ok?: boolean;
          error?: string;
        };

        if (!sendResponse.ok || !sendPayload.ok) {
          throw new Error(sendPayload.error || 'Discordへの共有に失敗しました');
        }

        if (zip.pullIds.length > 0) {
          pullHistory.markPullStatus(zip.pullIds, 'discord_shared');
          pullHistory.markPullOriginalPrizeMissing(zip.pullIds, zip.originalPrizeMissingPullIds);
        }

        const sharedAt = new Date().toISOString();
        const rawShareUrl = shareUrl || '';
        const resolvedShareUrl = rawShareUrl.trim();
        const resolvedShareLabel =
          typeof shareLabelCandidate === 'string' ? shareLabelCandidate.trim() : shareLabelCandidate;

        const shareInfo = resolvedShareUrl
          ? {
              channelId,
              channelName: channelName ?? null,
              channelParentId: channelParentId ?? null,
              shareUrl: resolvedShareUrl,
              shareLabel: resolvedShareLabel ? resolvedShareLabel : null,
              shareTitle,
              shareComment: shareComment ?? null,
              sharedAt
            }
          : undefined;

        void linkDiscordProfileToStore({
          store: userProfiles,
          profileId: targetUserId,
          discordUserId: sharedMemberId,
          discordDisplayName: memberDisplayName,
          discordUserName: profile.discordUserName,
          avatarUrl: profile.discordAvatarUrl ?? undefined,
          share: shareInfo
        });

        setDiscordDeliveryError(null);
        setDiscordDeliveryNotice(`${memberDisplayName}さんに景品を送信しました`);
        setDiscordDeliveryCompleted(true);
      } catch (error) {
        const message =
          error instanceof DiscordGuildSelectionMissingError
            ? error.message
            : error instanceof Error
              ? error.message
              : String(error);
        const displayMessage =
          error instanceof DiscordGuildSelectionMissingError
            ? message
            : `Discord共有の送信に失敗しました: ${message}`;
        setDiscordDeliveryError(displayMessage);
        setDiscordDeliveryCompleted(false);
        throw new Error(displayMessage);
      } finally {
        setIsDiscordDelivering(false);
        setDiscordDeliveryStage('idle');
      }
    }, [
      resultItems,
      lastPullId,
      isDiscordLoggedIn,
      staffDiscordId,
      persistence,
      lastUserName,
      normalizedUserName,
      uploadZip,
      staffDiscordName,
      pullHistory,
      userProfiles,
      excludeRiaguImages
    ]
  );

  useEffect(() => {
    if (!queuedDiscordDelivery) {
      queuedDeliveryProcessingRef.current = null;
      return;
    }
    const { userId, selection, requestedAt, itemIdFilter } = queuedDiscordDelivery;
    const processingKey = `${userId}:${requestedAt}`;

    if (queuedDeliveryProcessingRef.current === processingKey) {
      return;
    }

    queuedDeliveryProcessingRef.current = processingKey;
    if (!userId) {
      setQueuedDiscordDelivery(null);
      return;
    }
    const profile = userProfilesState?.users?.[userId];
    if (!profile?.discordUserId) {
      return;
    }

    void (async () => {
      try {
        setDiscordDeliveryCompleted(false);
        await performDiscordDelivery({
          profile,
          targetUserId: userId,
          guildSelection: selection,
          itemIdFilter
        });
      } catch (error) {
        console.error('Failed to deliver prize after linking Discord profile', error);
      } finally {
        setQueuedDiscordDelivery(null);
        queuedDeliveryProcessingRef.current = null;
      }
    })();
  }, [queuedDiscordDelivery, userProfilesState, performDiscordDelivery]);

  const handleDeliverToDiscord = useCallback(async () => {
    if (!resultItems || resultItems.length === 0) {
      setDiscordDeliveryError('共有できるガチャ結果がありません。');
      return;
    }
    if (!lastPullId) {
      setDiscordDeliveryError('共有する履歴が見つかりませんでした。');
      return;
    }
    if (!lastUserId) {
      setDiscordDeliveryError('共有対象のユーザー情報が見つかりませんでした。');
      return;
    }
    if (!isDiscordLoggedIn) {
      setDiscordDeliveryError('Discordにログインしてから共有してください。');
      return;
    }
    if (!staffDiscordId) {
      setDiscordDeliveryError('Discordアカウントの情報を取得できませんでした。再度ログインしてください。');
      return;
    }

    setDiscordDeliveryError(null);
    setDiscordDeliveryNotice(null);
    setDiscordDeliveryCompleted(false);

    const quickSendNewOnly = await resolveQuickSendNewOnly();
    if (quickSendNewOnly === null) {
      return;
    }
    if (quickSendNewOnly && newResultItemIds.length === 0) {
      setDiscordDeliveryError('新規取得した景品がありません。');
      return;
    }
    const itemIdFilter = quickSendNewOnly ? newResultItemIds : undefined;

    let guildSelection: DiscordGuildSelection;
    try {
      guildSelection = requireDiscordGuildSelection(staffDiscordId);
    } catch (error) {
      const message =
        error instanceof DiscordGuildSelectionMissingError
          ? error.message
          : 'お渡しチャンネルのカテゴリが設定されていません。Discord共有設定を確認してください。';
      setDiscordDeliveryError(message);
      return;
    }

    const targetUserId = lastUserId;
    const profile = lastUserProfile;

    if (profile?.discordUserId) {
      try {
        await performDiscordDelivery({
          profile,
          targetUserId,
          guildSelection,
          itemIdFilter
        });
      } catch (error) {
        console.error('Failed to deliver prize to Discord', error);
      }
      return;
    }

    push(DiscordMemberPickerDialog, {
      id: 'discord-member-picker',
      title: 'Discord情報を追加',
      size: 'lg',
      payload: {
        mode: 'link',
        guildId: guildSelection.guildId,
        discordUserId: staffDiscordId,
        submitLabel: '追加',
        refreshLabel: 'メンバー情報の更新',
        onMemberPicked: async (member) => {
          const normalizedDisplayName =
            (member.displayName && member.displayName.trim().length > 0 ? member.displayName : undefined) ??
            member.globalName ??
            member.username ??
            member.id;

          const shareInfo = member.giftChannelId
            ? {
                channelId: member.giftChannelId,
                channelName: member.giftChannelName ?? null,
                channelParentId: member.giftChannelParentId ?? null
              }
            : undefined;

          await linkDiscordProfileToStore({
            store: userProfiles,
            profileId: targetUserId,
            discordUserId: member.id,
            discordDisplayName: normalizedDisplayName,
            discordUserName: member.username || member.globalName || null,
            avatarUrl: member.avatarUrl ?? null,
            share: shareInfo
          });

          setDiscordDeliveryCompleted(false);
          setQueuedDiscordDelivery({
            userId: targetUserId,
            selection: guildSelection,
            requestedAt: Date.now(),
            itemIdFilter
          });
        },
        onMemberPickFailed: (message) => {
          const displayMessage = message.includes('Discord情報')
            ? message
            : `Discord情報の連携に失敗しました: ${message}`;
          setDiscordDeliveryError(displayMessage);
        }
      }
    });
  }, [
    resultItems,
    lastPullId,
    lastUserId,
    isDiscordLoggedIn,
    staffDiscordId,
    lastUserProfile,
    performDiscordDelivery,
    resolveQuickSendNewOnly,
    newResultItemIds,
    push,
    userProfiles
  ]);

  const handleCopyShareResult = useCallback(() => {
    if (!shareContent) {
      return;
    }
    void copyShareText('draw-result', shareContent.shareText);
  }, [copyShareText, shareContent]);

  return (
    <>
      <ModalBody className="space-y-6">
        <div className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <label className="block text-sm font-semibold text-muted-foreground" htmlFor={gachaSelectId}>
                ガチャの種類
              </label>
            </div>
            <SingleSelectDropdown
              id={gachaSelectId}
              value={selectedGachaId}
              options={gachaOptions}
              onChange={handleGachaChange}
              placeholder="ガチャを選択"
              fallbackToFirstOption={false}
              classNames={{ root: 'w-full', button: 'w-full' }}
            />
          </div>
          {gachaOptions.length === 0 ? (
            <p className="text-sm leading-relaxed text-muted-foreground">
              ガチャがまだ登録されていません。先にガチャを登録してから実行してください。
            </p>
          ) : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <span className="block text-sm font-semibold text-muted-foreground">ポイント / 連数</span>
              <div className="flex flex-wrap gap-2">
                {[
                  { label: 'ポイント指定', value: 'points' },
                  { label: '連数指定', value: 'pulls' }
                ].map((option) => {
                  const isSelected = pointsInputMode === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setPointsInputMode(option.value as 'points' | 'pulls')}
                      className={`inline-flex items-center rounded-full border px-3 py-1 text-xs transition-colors focus:outline-none focus:ring-1 focus:ring-accent/40 ${
                        isSelected
                          ? 'border-accent bg-accent/10 text-accent'
                          : 'border-border/60 text-muted-foreground hover:border-accent hover:text-accent'
                      }`}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
              {pointsInputMode === 'points' ? (
                <>
                  <div className="relative">
                    <input
                      id={pointsInputId}
                      type="number"
                      min={0}
                      step={1}
                      value={pointsInput}
                      onChange={(event) => setPointsInput(event.currentTarget.value)}
                      className="w-full rounded-xl border border-border/60 bg-surface-alt px-3 py-2 pr-9 text-sm text-surface-foreground focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/40"
                      placeholder="100"
                      aria-label="ポイント"
                    />
                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground/70">
                      pt
                    </span>
                  </div>
                </>
              ) : (
                <>
                  <div className="relative">
                    <input
                      id={pullsInputId}
                      type="number"
                      min={1}
                      step={1}
                      value={pullsInput}
                      onChange={(event) => setPullsInput(event.currentTarget.value)}
                      className="w-full rounded-xl border border-border/60 bg-surface-alt px-3 py-2 pr-9 text-sm text-surface-foreground focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/40"
                      placeholder="10"
                      aria-label="連数"
                    />
                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground/70">
                      連
                    </span>
                  </div>
                </>
              )}
              <div className="flex flex-wrap gap-2">
                {[
                  { label: '+1000', delta: 1000 },
                  { label: '+100', delta: 100 },
                  { label: '+10', delta: 10 },
                  { label: '+1', delta: 1 },
                  { label: '-1', delta: -1 },
                  { label: '-10', delta: -10 },
                  { label: '-100', delta: -100 },
                  { label: '-1000', delta: -1000 }
                ].map((item) => (
                  <button
                    key={item.label}
                    type="button"
                    onClick={() => handleQuickAdjust(item.delta)}
                    className="inline-flex items-center rounded-full border border-border/60 px-3 py-1 text-xs text-muted-foreground transition-colors focus:outline-none focus:ring-1 focus:ring-accent/40 hover:border-accent hover:text-accent"
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <label className="space-y-2">
                <span className="block text-sm font-semibold text-muted-foreground">名前（必須）</span>
                <input
                  type="text"
                  value={userName}
                  onChange={(event) => {
                    setUserName(event.currentTarget.value);
                    setSelectedUserId(null);
                  }}
                  className="w-full rounded-xl border border-border/60 bg-surface-alt px-3 py-2 text-sm text-surface-foreground focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/40"
                  placeholder="ユーザー名"
                />
              </label>
              {userSuggestions.length > 0 ? (
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-muted-foreground">候補</p>
                  <div className="flex flex-wrap gap-2">
                    {userSuggestions.map((profile) => {
                      const isSelected = selectedUserId === profile.id;
                      return (
                        <button
                          key={profile.id}
                          type="button"
                          onClick={() => {
                            setUserName(profile.displayName);
                            setSelectedUserId(profile.id);
                          }}
                          className={`inline-flex items-center rounded-full border px-3 py-1 text-xs transition-colors focus:outline-none focus:ring-1 focus:ring-accent/40 ${
                            isSelected
                              ? 'border-accent bg-accent/10 text-accent'
                              : 'border-border/60 text-muted-foreground hover:border-accent hover:text-accent'
                          }`}
                        >
                          {profile.displayName}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}
              {normalizedUserName && userSuggestions.length === 0 ? (
                <p className="text-xs text-muted-foreground">一致する候補はありません。</p>
              ) : null}
            </div>
          </div>
          {selectedGacha && displayPlan ? (
            <div className="space-y-2 rounded-xl border border-border/60 bg-surface-alt p-3 text-xs text-muted-foreground">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  消費:
                  <span className="ml-1 font-mono text-surface-foreground">
                    {showUnknownPoints ? '??? pt' : `${formatNumber(displayPlan.pointsUsed)} pt`}
                  </span>
                </span>
                {normalizedCompleteSetting && !showUnknownPoints ? (
                  <span>
                    内、コンプリート排出分
                    <span className="ml-1 font-mono text-surface-foreground">
                      {formatNumber(completePointsUsed)} pt
                    </span>
                  </span>
                ) : null}
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  連数:
                  <span className="ml-1 font-mono text-surface-foreground">
                    {displayPulls != null ? `${formatNumber(displayPulls)} 連` : '-'}
                  </span>
                </span>
              </div>
              {normalizedCompleteSetting ? (
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span>
                    コンプリートガチャ(MAX:{formatNumber(maxCompleteExecutions)}回):
                  </span>
                  <span className="inline-flex items-center gap-2">
                    <span className="font-mono text-surface-foreground">
                      {formatNumber(currentCompleteExecutions)} 回
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleCompleteAdjust(-1)}
                        disabled={currentCompleteExecutions <= 0}
                        className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-border/60 text-xs font-semibold text-muted-foreground transition-colors focus:outline-none focus:ring-1 focus:ring-accent/40 hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-40"
                        aria-label="コンプリートガチャ回数を減らす"
                      >
                        -
                      </button>
                      <button
                        type="button"
                        onClick={() => handleCompleteAdjust(1)}
                        disabled={currentCompleteExecutions >= maxCompleteExecutions}
                        className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-border/60 text-xs font-semibold text-muted-foreground transition-colors focus:outline-none focus:ring-1 focus:ring-accent/40 hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-40"
                        aria-label="コンプリートガチャ回数を増やす"
                      >
                        +
                      </button>
                    </div>
                  </span>
                </div>
              ) : null}
              {guaranteeSummaries.length ? (
                <div className="space-y-1">
                  <span>保証設定:</span>
                  <ul className="space-y-1 text-[11px] text-surface-foreground/80">
                    {guaranteeSummaries.map((summary, index) => (
                      <li
                        key={`${summary.rarityId}-${summary.threshold}-${index}`}
                        className="flex items-start justify-between gap-2 rounded-lg border border-border/40 bg-surface-alt px-2 py-1"
                      >
                        <span className="leading-snug">{summary.description}</span>
                        <span
                          className={`whitespace-nowrap text-xs font-semibold ${
                            summary.applies
                              ? 'text-emerald-600'
                              : 'text-muted-foreground'
                          }`}
                        >
                          {summary.applies ? '適用' : '適用外'}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {planWarnings.length ? (
                <ul className="space-y-1 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2 text-[11px] text-amber-700">
                  {planWarnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
        </div>
        {planErrorMessage ? (
          <div className="rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-600">
            {planErrorMessage}
          </div>
        ) : null}
        {errorMessage ? (
          <div className="rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-600">
            {errorMessage}
          </div>
        ) : null}
        {sortedResultItems ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>
                {lastGachaLabel ? `「${lastGachaLabel}」` : '選択したガチャ'} の結果
              </span>
              <span className="font-mono text-xs">合計 {totalCount} 個</span>
            </div>
            <div className="space-y-2 rounded-2xl border border-border/60 bg-surface-alt p-4">
              {sortedResultItems.map((item) => {
                const { className: rarityTextClassName, style: rarityTextStyle } = getRarityTextPresentation(
                  item.rarityColor
                );
                const hasSolidColor = typeof item.rarityColor === 'string' && item.rarityColor.startsWith('#');
                const rarityBadgeStyle = hasSolidColor
                  ? { backgroundColor: `${item.rarityColor}1a`, color: item.rarityColor }
                  : undefined;

                return (
                  <div key={item.itemId} className="flex items-center gap-3 text-sm text-surface-foreground">
                    <span
                      className="inventory-history-dialog__rarity-badge inline-flex min-w-[3rem] items-center justify-center rounded-full border px-2 py-0.5 text-[11px] font-semibold shadow-sm"
                      style={rarityBadgeStyle}
                    >
                      <span
                        className={clsx('inventory-history-dialog__rarity-badge__label', rarityTextClassName)}
                        style={rarityTextStyle}
                      >
                        {item.rarityLabel}
                      </span>
                    </span>
                    <span className="flex-1 min-w-0 overflow-hidden font-medium">
                      <span className="inline-flex w-full min-w-0 items-center gap-2">
                        <span className="block min-w-0 flex-1 truncate">{item.name}</span>
                        {item.isNew ? (
                          <span className="inline-flex h-5 items-center rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 text-[10px] font-semibold leading-none text-emerald-700">
                            new
                          </span>
                        ) : null}
                      </span>
                    </span>
                    <span className="flex items-center gap-2 font-mono">
                      ×{item.count}
                      {item.guaranteedCount ? (
                        <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                          保証 {item.guaranteedCount}
                        </span>
                      ) : null}
                    </span>
                  </div>
                );
              })}
            </div>
            <div className="flex flex-wrap items-start justify-between gap-3 text-xs text-muted-foreground">
              <div className="space-y-1">
                <div>
                  消費ポイント:
                  <span className="ml-1 font-mono text-surface-foreground">
                    {lastUsedManualPulls
                      ? '??? pt'
                      : `${formatNumber((lastPointsSpent ?? lastPlan?.pointsUsed) ?? 0)} pt`}
                  </span>
                  {!lastUsedManualPulls && (lastPointsRemainder != null || lastPlan?.pointsRemainder != null) ? (
                    <span className="ml-2">
                      残り:
                      <span className="ml-1 font-mono text-surface-foreground">
                        {formatNumber((lastPointsRemainder ?? lastPlan?.pointsRemainder) ?? 0)} pt
                      </span>
                    </span>
                  ) : null}
                </div>
                {lastPlan && lastPlan.completeExecutions > 0 ? (
                  <div>
                    抽選内訳:
                    <span className="ml-1 font-mono text-surface-foreground">
                      コンプリート {formatNumber(lastPlan.completeExecutions)} 回
                    </span>
                  </div>
                ) : null}
                <div>
                  {executedAtLabel ? `実行日時: ${executedAtLabel}` : null}
                  {lastPullId ? `（履歴ID: ${lastPullId}）` : null}
                </div>
              </div>
              {shareContent ? (
                <div className="flex flex-wrap items-center justify-end gap-2 text-right sm:text-left">
                  <button
                    type="button"
                    className="btn flex items-center gap-1 !min-h-0 px-3 py-1.5 text-xs bg-discord-primary text-white transition hover:bg-discord-hover focus-visible:ring-2 focus-visible:ring-accent/70 disabled:cursor-not-allowed disabled:opacity-70"
                    style={{ minWidth: discordDeliveryButtonMinWidth }}
                    onClick={handleDeliverToDiscord}
                    disabled={discordDeliveryButtonDisabled}
                  >
                    {isDiscordDeliveryInProgress ? (
                      <ArrowPathIcon className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                    ) : (
                      <PaperAirplaneIcon className="h-3.5 w-3.5" aria-hidden="true" />
                    )}
                    {discordDeliveryButtonLabel}
                  </button>
                  <button
                    type="button"
                    className="btn btn-muted aspect-square h-8 w-8 p-1.5 !min-h-0"
                    onClick={handleShareResult}
                    title="結果を共有"
                    aria-label="結果を共有"
                  >
                    <ShareIcon className="h-3.5 w-3.5" aria-hidden="true" />
                    <span className="sr-only">結果を共有</span>
                  </button>
                  {safeTweetUrl ? (
                    <a
                      href={safeTweetUrl}
                      className="btn aspect-square h-8 w-8 border-none bg-[#000000] p-1.5 text-white transition hover:bg-[#111111] focus-visible:ring-2 focus-visible:ring-white/70 !min-h-0"
                      target="_blank"
                      rel="noopener noreferrer"
                      title="Xで共有"
                      aria-label="Xで共有"
                    >
                      <XLogoIcon aria-hidden className="h-3.5 w-3.5" />
                      <span className="sr-only">Xで共有</span>
                    </a>
                  ) : (
                    <span
                      className="btn aspect-square h-8 w-8 border-none bg-[#000000]/60 p-1.5 text-white/70 !min-h-0"
                      aria-disabled="true"
                      title="Xで共有"
                    >
                      <XLogoIcon aria-hidden className="h-3.5 w-3.5" />
                      <span className="sr-only">Xで共有</span>
                    </span>
                  )}
                  <button
                    type="button"
                    className="btn btn-muted aspect-square h-8 w-8 p-1.5 !min-h-0"
                    onClick={handleCopyShareResult}
                    title="結果をコピー"
                    aria-label="結果をコピー"
                  >
                    <ClipboardIcon className="h-3.5 w-3.5" aria-hidden="true" />
                    <span className="sr-only">結果をコピー</span>
                  </button>
                  {shareStatus === 'shared' ? (
                    <span className="basis-full text-right text-[11px] text-muted-foreground">
                      共有を開始しました
                    </span>
                  ) : null}
                  {shareStatus === 'copied' ? (
                    <span className="basis-full text-right text-[11px] text-muted-foreground">
                      共有テキストをコピーしました
                    </span>
                  ) : null}
                  {shareStatus === 'error' ? (
                    <span className="basis-full text-right text-[11px] text-red-500">
                      共有に失敗しました
                    </span>
                  ) : null}
                  {discordDeliveryNotice ? (
                    <span className="basis-full text-right text-[11px] text-emerald-600">
                      {discordDeliveryNotice}
                    </span>
                  ) : null}
                  {discordDeliveryError ? (
                    <span className="basis-full text-right text-[11px] text-red-500">
                      {discordDeliveryError}
                    </span>
                  ) : null}
                </div>
              ) : null}
            </div>
            {lastExecutionWarnings.length ? (
              <ul className="space-y-1 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-700">
                {lastExecutionWarnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
        {!resultItems && !errorMessage ? (
          <div className="space-y-2 text-sm leading-relaxed">
            <p className="text-muted-foreground">
              ガチャを実行すると、このモーダル内に結果が表示され、インベントリ履歴にも保存されます。
            </p>
            {hasGuaranteeOutOfStockBlocker ? (
              <p className="text-amber-600">
                天井保証に設定されているアイテムが在庫切れです。
              </p>
            ) : null}
          </div>
        ) : null}
      </ModalBody>
      <ModalFooter>
        <button type="button" className="btn btn-muted" onClick={close}>
          閉じる
        </button>
        {!resultItems ? (
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleExecute}
            disabled={
              isExecuting ||
              !gachaOptions.length ||
              !normalizedUserName ||
              Boolean(planErrorMessage) ||
              hasGuaranteeOutOfStockBlocker
            }
          >
            <SparklesIcon className="h-5 w-5" />
            ガチャを実行
          </button>
        ) : null}
      </ModalFooter>
    </>
  );
}
