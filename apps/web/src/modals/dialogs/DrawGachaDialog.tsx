import {
  ArrowPathIcon,
  ClipboardIcon,
  PaperAirplaneIcon,
  ShareIcon,
  SparklesIcon
} from '@heroicons/react/24/outline';
import { useCallback, useEffect, useMemo, useRef, useState, useId } from 'react';

import { SingleSelectDropdown, type SingleSelectOption } from '../../pages/gacha/components/select/SingleSelectDropdown';
import { ModalBody, ModalFooter, type ModalComponentProps } from '..';
import { useNavigate } from 'react-router-dom';
import { PageSettingsDialog } from './PageSettingsDialog';
import { DiscordMemberPickerDialog } from './DiscordMemberPickerDialog';
import { useAppPersistence, useDomainStores } from '../../features/storage/AppPersistenceProvider';
import { resolveCompleteModePreference, useStoreValue } from '@domain/stores';
import { useShareHandler } from '../../hooks/useShare';
import { XLogoIcon } from '../../components/icons/XLogoIcon';
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
import type {
  GachaAppStateV3,
  GachaCatalogStateV3,
  GachaRarityStateV3,
  UserProfileCardV3
} from '@domain/app-persistence';
import type { GachaResultPayload } from '@domain/gacha/gachaResult';
import {
  buildGachaPools,
  calculateDrawPlan,
  executeGacha,
  inferRarityFractionDigits,
  type DrawPlan,
  type GachaPoolDefinition
} from '../../logic/gacha';
import type { CompleteDrawMode } from '../../logic/gacha/types';

const COMPLETE_MODE_LABELS: Record<CompleteDrawMode, string> = {
  repeat: 'コンプ回数分すべて排出',
  frontload: '初回のみ全種→残り通常抽選'
};

interface DrawGachaDialogResultItem {
  itemId: string;
  name: string;
  rarityId: string;
  rarityLabel: string;
  rarityColor?: string;
  count: number;
  guaranteedCount?: number;
}

interface GachaDefinition {
  id: string;
  label: string;
  pool: GachaPoolDefinition;
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
  catalogState: GachaCatalogStateV3 | undefined,
  rarityState: GachaRarityStateV3 | undefined
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
    rarityFractionDigits
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
    pullHistory,
    uiPreferences: uiPreferencesStore
  } = useDomainStores();
  const appState = useStoreValue(appStateStore);
  const catalogState = useStoreValue(catalogStore);
  const rarityState = useStoreValue(rarityStore);
  const ptSettingsState = useStoreValue(ptControls);
  const userProfilesState = useStoreValue(userProfiles);
  const pullHistoryState = useStoreValue(pullHistory);
  const uiPreferencesState = useStoreValue(uiPreferencesStore);
  const navigate = useNavigate();
  const gachaSelectId = useId();
  const completeMode = resolveCompleteModePreference(ptSettingsState);

  const { options: gachaOptions, map: gachaMap } = useMemo(
    () => buildGachaDefinitions(appState, catalogState, rarityState),
    [appState, catalogState, rarityState]
  );

  const lastPreferredGachaId = useMemo(
    () => uiPreferencesStore.getLastSelectedDrawGachaId() ?? undefined,
    [uiPreferencesState, uiPreferencesStore]
  );
  const { triggerConfirmation, triggerError, triggerSelection } = useHaptics();

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
  const [lastExecutionWarnings, setLastExecutionWarnings] = useState<string[]>([]);
  const [lastPlan, setLastPlan] = useState<DrawPlan | null>(null);
  const [lastTotalPulls, setLastTotalPulls] = useState<number | null>(null);
  const [lastUserName, setLastUserName] = useState<string>('');
  const [lastUserId, setLastUserId] = useState<string | null>(null);
  const [queuedDiscordDelivery, setQueuedDiscordDelivery] = useState<QueuedDiscordDeliveryRequest | null>(null);
  const [isDiscordDelivering, setIsDiscordDelivering] = useState(false);
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

  useEffect(() => {
    setErrorMessage(null);
    setResultItems(null);
    setLastPullId(null);
    setLastPointsSpent(null);
    setLastPointsRemainder(null);
    setLastExecutionWarnings([]);
    setLastPlan(null);
    setLastTotalPulls(null);
    setLastUserName('');
    setLastUserId(null);
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

  const drawPlan = useMemo(() => {
    if (!selectedGacha) {
      return null;
    }

    return calculateDrawPlan({
      points: parsedPoints,
      settings: selectedPtSetting,
      totalItemTypes: selectedGacha.pool.items.length
    });
  }, [parsedPoints, selectedGacha, selectedPtSetting]);

  const handleExecute = async () => {
    if (isExecuting) {
      return;
    }
    triggerSelection();
    setIsExecuting(true);
    try {
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

      if (!drawPlan || drawPlan.errors.length > 0) {
        setErrorMessage(drawPlan?.errors?.[0] ?? 'ポイント設定を確認してください。');
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

      const executionResult = executeGacha({
        gachaId: selectedGacha.id,
        pool: selectedGacha.pool,
        settings: selectedPtSetting,
        points: parsedPoints,
        completeMode
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

      const aggregatedItems: DrawGachaDialogResultItem[] = executionResult.items.map((item) => ({
        itemId: item.itemId,
        name: item.name,
        rarityId: item.rarityId,
        rarityLabel: item.rarityLabel,
        rarityColor: item.rarityColor,
        count: item.count,
        guaranteedCount: item.guaranteedCount > 0 ? item.guaranteedCount : undefined
      }));

      const itemsForStore: GachaResultPayload['items'] = executionResult.items.map((item) => ({
        itemId: item.itemId,
        rarityId: item.rarityId,
        count: item.count
      }));

      const executedAt = new Date().toISOString();
      const userId = normalizedUserName ? userProfiles.ensureProfile(normalizedUserName) : undefined;

      const payload: GachaResultPayload = {
        gachaId: selectedGacha.id,
        userId,
        executedAt,
        pullCount: executionResult.totalPulls,
        currencyUsed: executionResult.pointsSpent,
        items: itemsForStore
      };

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
      setLastPointsSpent(executionResult.pointsSpent);
      setLastPointsRemainder(executionResult.pointsRemainder);
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
      setLastExecutionWarnings([]);
      setLastPlan(null);
      setLastUserId(null);
      triggerError();
    } finally {
      setIsExecuting(false);
    }
  };

  const executedAtLabel = formatExecutedAt(lastExecutedAt);
  const integerFormatter = useMemo(() => new Intl.NumberFormat('ja-JP'), []);
  const totalCount = resultItems?.reduce((total, item) => total + item.count, 0) ?? 0;
  const planWarnings = drawPlan?.warnings ?? [];
  const planErrorMessage = drawPlan?.errors?.[0] ?? null;
  const normalizedCompleteSetting = drawPlan?.normalizedSettings.complete;
  const completeMode: CompleteDrawMode =
    normalizedCompleteSetting?.mode === 'frontload' ? 'frontload' : 'repeat';
  const completeModeLabel = COMPLETE_MODE_LABELS[completeMode];
  const guaranteeSummaries = useMemo(() => {
    if (!drawPlan || !selectedGacha) {
      return [] as Array<{
        rarityId: string;
        threshold: number;
        description: string;
        applies: boolean;
      }>;
    }

    return drawPlan.normalizedSettings.guarantees.map((guarantee) => {
      const rarity = selectedGacha.pool.rarityGroups.get(guarantee.rarityId);
      const label = rarity?.label ?? guarantee.rarityId;
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
      const applies = drawPlan.totalPulls >= guarantee.threshold;
      return {
        rarityId: guarantee.rarityId,
        threshold: guarantee.threshold,
        description,
        applies
      };
    });
  }, [drawPlan, selectedGacha]);

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

  const handleShareResult = useCallback(() => {
    if (!shareContent) {
      return;
    }
    void shareResult('draw-result', shareContent.shareText);
  }, [shareContent, shareResult]);

  const performDiscordDelivery = useCallback(
    async ({
      profile,
      targetUserId,
      guildSelection: selectionOverride
    }: {
      profile: UserProfileCardV3;
      targetUserId: string;
      guildSelection?: DiscordGuildSelection;
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

      setIsDiscordDelivering(true);
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

        const zip = await buildUserZipFromSelection({
          snapshot,
          selection,
          userId: targetUserId,
          userName: receiverDisplayName
        });

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

        if (!channelId) {
          const preferredCategory =
            channelParentId ?? guildSelection.privateChannelCategory?.id ?? null;
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
          } | null;

          if (!findResponse.ok || !findPayload) {
            const message =
              findPayload?.error || `お渡しチャンネルの確認に失敗しました (${findResponse.status})`;
            throw new Error(message);
          }

          if (!findPayload.ok) {
            throw new Error(findPayload.error || 'お渡しチャンネルの確認に失敗しました');
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
      userProfiles
    ]
  );

  useEffect(() => {
    if (!queuedDiscordDelivery) {
      return;
    }
    const { userId, selection } = queuedDiscordDelivery;
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
          guildSelection: selection
        });
      } catch (error) {
        console.error('Failed to deliver prize after linking Discord profile', error);
      } finally {
        setQueuedDiscordDelivery(null);
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
          guildSelection
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
            requestedAt: Date.now()
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
    push,
    userProfiles
  ]);

  const handleCopyShareResult = useCallback(() => {
    if (!shareContent) {
      return;
    }
    void copyShareText('draw-result', shareContent.shareText);
  }, [copyShareText, shareContent]);

  const resolveIsStandalonePwa = useCallback(() => {
    if (typeof window === 'undefined') {
      return false;
    }

    const mediaStandalone =
      typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches;

    const navigatorWithStandalone = window.navigator as Navigator & { standalone?: boolean };
    const iosStandalone =
      typeof navigatorWithStandalone.standalone === 'boolean' && navigatorWithStandalone.standalone;

    return mediaStandalone || iosStandalone;
  }, []);

  const handleOpenGachaTestPage = useCallback(() => {
    const targetUrl = '/gacha/test';

    if (resolveIsStandalonePwa()) {
      close();
      navigate(targetUrl);
      return;
    }

    if (typeof window !== 'undefined') {
      window.open(targetUrl, '_blank', 'noopener');
    }
  }, [close, navigate, resolveIsStandalonePwa]);

  const handleOpenSettings = useCallback(() => {
    push(PageSettingsDialog, {
      id: 'page-settings',
      title: 'サイト設定',
      description: 'ガチャ一覧の表示方法やサイトカラーをカスタマイズできます。',
      size: 'xl',
      panelPaddingClassName: 'p-2 lg:p-6'
    });
  }, [push]);

  return (
    <>
      <ModalBody className="space-y-6">
        <div className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <label className="block text-sm font-semibold text-muted-foreground" htmlFor={gachaSelectId}>
                ガチャの種類
              </label>
              <button type="button" className="btn btn-ghost btn-xs" onClick={handleOpenGachaTestPage}>
                テスト
              </button>
            </div>
            <SingleSelectDropdown
              id={gachaSelectId}
              value={selectedGachaId}
              options={gachaOptions}
              onChange={handleGachaChange}
              placeholder="ガチャを選択"
              fallbackToFirstOption={false}
            />
          </div>
          {gachaOptions.length === 0 ? (
            <p className="text-sm leading-relaxed text-muted-foreground">
              ガチャがまだ登録されていません。先にガチャを登録してから実行してください。
            </p>
          ) : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-2">
              <span className="block text-sm font-semibold text-muted-foreground">ポイント</span>
              <input
                type="number"
                min={0}
                step={1}
                value={pointsInput}
                onChange={(event) => setPointsInput(event.currentTarget.value)}
                className="w-full rounded-xl border border-border/60 bg-surface-alt px-3 py-2 text-sm text-surface-foreground focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/40"
                placeholder="100"
              />
            </label>
            <div className="space-y-2">
              <label className="space-y-2">
                <span className="block text-sm font-semibold text-muted-foreground">名前</span>
                <input
                  type="text"
                  value={userName}
                  onChange={(event) => {
                    setUserName(event.currentTarget.value);
                    setSelectedUserId(null);
                  }}
                  className="w-full rounded-xl border border-border/60 bg-surface-alt px-3 py-2 text-sm text-surface-foreground focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/40"
                  placeholder="ユーザー名（任意）"
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
          {selectedGacha && drawPlan ? (
            <div className="space-y-2 rounded-xl border border-border/60 bg-surface-alt p-3 text-xs text-muted-foreground">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  消費:
                  <span className="ml-1 font-mono text-surface-foreground">
                    {formatNumber(drawPlan.pointsUsed)} pt
                  </span>
                </span>
                <span>
                  残り:
                  <span className="ml-1 font-mono text-surface-foreground">
                    {formatNumber(drawPlan.pointsRemainder)} pt
                  </span>
                </span>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  連数:
                  <span className="ml-1 font-mono text-surface-foreground">
                    {formatNumber(drawPlan.totalPulls)} 連
                  </span>
                </span>
              </div>
              {drawPlan.completeExecutions > 0 ? (
                <div>
                  コンプリート排出:
                  <span className="ml-1 font-mono text-surface-foreground">
                    {formatNumber(drawPlan.completeExecutions)} 回
                  </span>
                </div>
              ) : null}
              {normalizedCompleteSetting ? (
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span>
                    コンプリート排出モード:
                    <span className="ml-1 font-semibold text-surface-foreground">
                      {completeModeLabel}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={handleOpenSettings}
                    className="inline-flex items-center rounded-lg border border-border/60 px-3 py-1.5 text-[11px] font-semibold text-muted-foreground transition hover:border-accent hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
                  >
                    モードを変更
                  </button>
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
        {resultItems ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>
                {lastGachaLabel ? `「${lastGachaLabel}」` : '選択したガチャ'} の結果
              </span>
              <span className="font-mono text-xs">合計 {totalCount} 個</span>
            </div>
            <div className="space-y-2 rounded-2xl border border-border/60 bg-surface-alt p-4">
              {resultItems.map((item) => (
                <div key={item.itemId} className="flex items-center gap-3 text-sm text-surface-foreground">
                  <span
                    className="inline-flex min-w-[3rem] items-center justify-center rounded-full px-2 py-0.5 text-xs font-semibold"
                    style={item.rarityColor ? { backgroundColor: `${item.rarityColor}1a`, color: item.rarityColor } : undefined}
                  >
                    {item.rarityLabel}
                  </span>
                  <span className="flex-1 font-medium">{item.name}</span>
                  <span className="flex items-center gap-2 font-mono">
                    ×{item.count}
                    {item.guaranteedCount ? (
                      <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                        保証 {item.guaranteedCount}
                      </span>
                    ) : null}
                  </span>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap items-start justify-between gap-3 text-xs text-muted-foreground">
              <div className="space-y-1">
                <div>
                  消費ポイント:
                  <span className="ml-1 font-mono text-surface-foreground">
                    {formatNumber((lastPointsSpent ?? lastPlan?.pointsUsed) ?? 0)} pt
                  </span>
                  {lastPointsRemainder != null || lastPlan?.pointsRemainder != null ? (
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
                    onClick={handleDeliverToDiscord}
                    disabled={discordDeliveryButtonDisabled}
                  >
                    {isDiscordDeliveryInProgress ? (
                      <ArrowPathIcon className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                    ) : (
                      <PaperAirplaneIcon className="h-3.5 w-3.5" aria-hidden="true" />
                    )}
                    {discordDeliveryCompleted ? '送信済み' : 'お渡し部屋に景品を送信'}
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
                  <a
                    href={shareContent.tweetUrl}
                    className="btn aspect-square h-8 w-8 border-none bg-[#000000] p-1.5 text-white transition hover:bg-[#111111] focus-visible:ring-2 focus-visible:ring-white/70 !min-h-0"
                    target="_blank"
                    rel="noopener noreferrer"
                    title="Xで共有"
                    aria-label="Xで共有"
                  >
                    <XLogoIcon aria-hidden className="h-3.5 w-3.5" />
                    <span className="sr-only">Xで共有</span>
                  </a>
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
          <p className="text-sm leading-relaxed text-muted-foreground">
            ガチャを実行すると、このモーダル内に結果が表示され、インベントリ履歴にも保存されます。
          </p>
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
            disabled={isExecuting || !gachaOptions.length || Boolean(planErrorMessage)}
          >
            <SparklesIcon className="h-5 w-5" />
            ガチャを実行
          </button>
        ) : null}
      </ModalFooter>
    </>
  );
}
