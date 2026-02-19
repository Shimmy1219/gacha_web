import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent
} from 'react';
import { RadioGroup } from '@headlessui/react';
import { ArrowPathIcon, PencilSquareIcon, TrashIcon } from '@heroicons/react/24/outline';
import { clsx } from 'clsx';

import { SwitchField } from '../../pages/gacha/components/form/SwitchField';
import { useSiteTheme } from '../../features/theme/SiteThemeProvider';
import { useDiscordSession } from '../../features/discord/useDiscordSession';
import { SITE_ACCENT_PALETTE } from '../../features/theme/siteAccentPalette';
import { ConfirmDialog, ModalBody } from '..';
import { type ModalComponent } from '../ModalTypes';
import { useAppPersistence, useDomainStores } from '../../features/storage/AppPersistenceProvider';
import { deleteAllAssets } from '@domain/assets/assetStorage';
import { useStoreValue } from '@domain/stores';
import { clearAllDiscordGuildSelections } from '../../features/discord/discordGuildSelectionStorage';
import { clearAllDiscordUserStates } from '../../features/discord/discordUserStateStorage';
import { clearToolbarPreferencesStorage } from '../../features/toolbar/toolbarStorage';
import { clearDashboardControlsPositionStorage } from '../../pages/gacha/components/dashboard/dashboardControlsPositionStorage';
import { useResponsiveDashboard } from '../../pages/gacha/components/dashboard/useResponsiveDashboard';
import { useGachaDeletion } from '../../features/gacha/hooks/useGachaDeletion';
import { OfficialXAccountPanel } from '../../components/OfficialXAccountPanel';
import {
  DEFAULT_SITE_ZOOM_PERCENT,
  DEFAULT_GACHA_OWNER_SHARE_RATE,
  SITE_ZOOM_PERCENT_MAX,
  SITE_ZOOM_PERCENT_MIN,
  type DashboardDesktopLayout
} from '@domain/stores/uiPreferencesStore';
import { ReceiveIconRegistryPanel } from './ReceiveIconRegistryPanel';
import { useReceiveIconRegistry } from '../../pages/receive/hooks/useReceiveIconRegistry';

interface MenuItem {
  id: SettingsMenuKey;
  label: string;
  description: string;
}

type SettingsMenuKey = 'gacha' | 'site-theme' | 'layout' | 'receive' | 'misc';

const MENU_ITEMS: MenuItem[] = [
  {
    id: 'gacha',
    label: 'ガチャ設定',
    description: '一覧ページの並べ替えや表示項目を調整します。'
  },
  {
    id: 'site-theme',
    label: 'サイトカラー',
    description: '背景とアクセントカラーのテーマを切り替えます。'
  },
  {
    id: 'layout',
    label: 'レイアウトとズーム',
    description: 'ページ全体のレイアウトや表示方法を切り替えます。'
  },
  {
    id: 'receive',
    label: '受け取り設定',
    description: '受け取りページで使うアイコン登録などを調整します。'
  },
  {
    id: 'misc',
    label: 'その他の設定',
    description: '通知やガイドの表示方法をカスタマイズします。'
  }
];

const DASHBOARD_DESKTOP_LAYOUT_OPTIONS: Array<{
  value: DashboardDesktopLayout;
  label: string;
  description: string;
}> = [
  {
    value: 'grid',
    label: '4カラム表示',
    description: '各セクションを複数列で同時に表示します。従来のデスクトップ表示です。'
  },
  {
    value: 'sidebar',
    label: 'サイドバー表示',
    description: '左側のサイドバーでセクションを切り替えます。横幅が狭い画面でも閲覧しやすい構成です。'
  }
];

const CUSTOM_BASE_TONE_OPTIONS = [
  {
    id: 'dark',
    label: 'ダーク（黒）',
    description: '背景が暗く、文字色は白で表示されます。',
    previewBackground: '#0b0b0f',
    previewForeground: '#f5f5f6'
  },
  {
    id: 'light',
    label: 'ライト（白）',
    description: '背景が白く、文字色は黒で表示されます。',
    previewBackground: '#ffffff',
    previewForeground: '#1b1d28'
  }
] as const satisfies Array<{
  id: 'dark' | 'light';
  label: string;
  description: string;
  previewBackground: string;
  previewForeground: string;
}>;

function ReceiveSettingsContent(): JSX.Element {
  const { iconAssetIds, remainingSlots, isProcessing, error, addIcons, removeIcon } = useReceiveIconRegistry();

  return (
    <div className="page-settings-dialog__receive-settings space-y-6">
      <div className="page-settings-dialog__receive-header">
        <h2 className="page-settings-dialog__receive-title text-base font-semibold text-surface-foreground">
          受け取り設定
        </h2>
        <p className="page-settings-dialog__receive-description mt-1 text-sm text-muted-foreground">
          受け取りページで使うアイコン登録などを設定します。変更内容はすぐに適用されます。
        </p>
      </div>

      <div className="page-settings-dialog__receive-icon-panel rounded-2xl border border-border/60 bg-panel/70 p-4">
        <ReceiveIconRegistryPanel
          iconAssetIds={iconAssetIds}
          remainingSlots={remainingSlots}
          isProcessing={isProcessing}
          error={error}
          addIcons={addIcons}
          removeIcon={removeIcon}
        />
      </div>
    </div>
  );
}

function formatOwnerShareRateInput(value: number): string {
  if (!Number.isFinite(value)) {
    return '';
  }
  const percent = Math.round(value * 1000) / 10;
  return Number.isFinite(percent) ? String(percent).replace(/\.0$/, '') : '';
}

const REM_IN_PIXELS = 16;
const BASE_MODAL_MIN_HEIGHT_REM = 28;
const VIEWPORT_PADDING_REM = 12;
const BASE_MODAL_MIN_HEIGHT_PX = BASE_MODAL_MIN_HEIGHT_REM * REM_IN_PIXELS;
const VIEWPORT_PADDING_PX = VIEWPORT_PADDING_REM * REM_IN_PIXELS;
const PAGE_SETTINGS_ZOOM_PREVIEW_DATASET_KEY = 'pageSettingsZoomPreview';

function clampSiteZoomPercent(value: number): number {
  return Math.min(Math.max(Math.round(value), SITE_ZOOM_PERCENT_MIN), SITE_ZOOM_PERCENT_MAX);
}

export const PageSettingsDialog: ModalComponent = (props) => {
  const { close, push, isTop } = props;
  const modalBodyRef = useRef<HTMLDivElement | null>(null);
  const [activeMenu, setActiveMenu] = useState<SettingsMenuKey>('site-theme');
  const [showArchived, setShowArchived] = useState(true);
  const [showBetaTips, setShowBetaTips] = useState(true);
  const [confirmLogout, setConfirmLogout] = useState(true);
  const [isDeletingAllData, setIsDeletingAllData] = useState(false);
  const [isResettingDiscordServerInfo, setIsResettingDiscordServerInfo] = useState(false);
  const [maxBodyHeight, setMaxBodyHeight] = useState<number>(BASE_MODAL_MIN_HEIGHT_PX);
  const [viewportMaxHeight, setViewportMaxHeight] = useState<number | null>(null);
  const [isLargeLayout, setIsLargeLayout] = useState<boolean>(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia === 'undefined') {
      return true;
    }
    return window.matchMedia('(min-width: 1024px)').matches;
  });
  const { forceSidebarLayout, isMobile: isMobileDashboard } = useResponsiveDashboard();
  const isSidebarLayoutForced = forceSidebarLayout;
  const [activeView, setActiveView] = useState<'menu' | 'content'>(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia === 'undefined') {
      return 'content';
    }
    return window.matchMedia('(min-width: 1024px)').matches ? 'content' : 'menu';
  });
  const {
    theme,
    setTheme,
    options,
    customAccentColor,
    setCustomAccentColor,
    customBaseTone,
    setCustomBaseTone
  } = useSiteTheme();
  const [customAccentDraft, setCustomAccentDraft] = useState(() => customAccentColor.toUpperCase());
  const persistence = useAppPersistence();
  const { data: discordSession } = useDiscordSession();
  const {
    appState: appStateStore,
    catalog: catalogStore,
    rarities: rarityStore,
    riagu: riaguStore,
    ptControls: ptControlsStore,
    uiPreferences: uiPreferencesStore,
    pullHistory: pullHistoryStore,
    userInventories: userInventoriesStore,
    userProfiles: userProfilesStore
  } = useDomainStores();
  const [desktopLayout, setDesktopLayout] = useState<DashboardDesktopLayout>(() =>
    uiPreferencesStore.getDashboardDesktopLayout()
  );
  const [siteZoomPercent, setSiteZoomPercent] = useState<number>(() =>
    uiPreferencesStore.getSiteZoomPercent()
  );
  const [isZoomPreviewing, setIsZoomPreviewing] = useState(false);
  const appState = useStoreValue(appStateStore);
  const uiPreferencesState = useStoreValue(uiPreferencesStore);
  const quickSendNewOnlyPreference = useMemo(
    () => uiPreferencesStore.getQuickSendNewOnlyPreference(),
    [uiPreferencesState, uiPreferencesStore]
  );
  const quickSendNewOnly = quickSendNewOnlyPreference ?? false;
  const excludeRiaguImagesPreference = useMemo(
    () => uiPreferencesStore.getExcludeRiaguImagesPreference(),
    [uiPreferencesState, uiPreferencesStore]
  );
  const excludeRiaguImages = excludeRiaguImagesPreference ?? false;
  const completeOutOfStockPreference = useMemo(
    () => uiPreferencesStore.getCompleteGachaIncludeOutOfStockPreference(),
    [uiPreferencesState, uiPreferencesStore]
  );
  const completeOutOfStock = completeOutOfStockPreference ?? false;
  const guaranteeOutOfStockPreference = useMemo(
    () => uiPreferencesStore.getGuaranteeOutOfStockItemPreference(),
    [uiPreferencesState, uiPreferencesStore]
  );
  const guaranteeOutOfStock = guaranteeOutOfStockPreference ?? false;
  const applyLowerThresholdGuaranteesPreference = useMemo(
    () => uiPreferencesStore.getApplyLowerThresholdGuaranteesPreference(),
    [uiPreferencesState, uiPreferencesStore]
  );
  const applyLowerThresholdGuarantees = applyLowerThresholdGuaranteesPreference ?? true;
  const gachaOwnerShareRatePreference = useMemo(
    () => uiPreferencesStore.getGachaOwnerShareRatePreference(),
    [uiPreferencesState, uiPreferencesStore]
  );
  const gachaOwnerShareRate = gachaOwnerShareRatePreference ?? DEFAULT_GACHA_OWNER_SHARE_RATE;
  const confirmPermanentDeleteGacha = useGachaDeletion({ mode: 'delete' });
  const [editingGachaId, setEditingGachaId] = useState<string | null>(null);
  const [editingGachaName, setEditingGachaName] = useState('');
  const [ownerName, setOwnerName] = useState<string>(() => {
    const prefs = persistence.loadSnapshot().receivePrefs;
    return prefs?.ownerName ?? '';
  });
  const [ownerShareRateInput, setOwnerShareRateInput] = useState<string>(() =>
    formatOwnerShareRateInput(gachaOwnerShareRate)
  );
  const handleRestoreGacha = useCallback(
    (gachaId: string) => {
      appStateStore.restoreGacha(gachaId);
    },
    [appStateStore]
  );
  const handleStartEditingGacha = useCallback((gachaId: string, currentName: string) => {
    setEditingGachaId(gachaId);
    setEditingGachaName(currentName);
  }, []);
  const handleEditingGachaNameChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    setEditingGachaName(event.target.value);
  }, []);
  const handleCancelEditingGacha = useCallback(() => {
    setEditingGachaId(null);
    setEditingGachaName('');
  }, []);

  const handleOwnerShareRateChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    setOwnerShareRateInput(event.target.value);
  }, []);

  const handleOwnerShareRateCommit = useCallback(() => {
    const trimmed = ownerShareRateInput.trim();
    if (!trimmed) {
      uiPreferencesStore.setGachaOwnerShareRatePreference(null, { persist: 'immediate' });
      setOwnerShareRateInput(formatOwnerShareRateInput(DEFAULT_GACHA_OWNER_SHARE_RATE));
      return;
    }

    const normalizedInput = trimmed.replace('%', '');
    const numeric = Number(normalizedInput);
    if (!Number.isFinite(numeric)) {
      setOwnerShareRateInput(formatOwnerShareRateInput(gachaOwnerShareRate));
      return;
    }

    const clamped = Math.min(Math.max(numeric, 0), 100);
    const normalized = clamped / 100;
    uiPreferencesStore.setGachaOwnerShareRatePreference(normalized, { persist: 'immediate' });
    setOwnerShareRateInput(formatOwnerShareRateInput(normalized));
  }, [gachaOwnerShareRate, ownerShareRateInput, uiPreferencesStore]);

  const handleOwnerShareRateKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        handleOwnerShareRateCommit();
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        setOwnerShareRateInput(formatOwnerShareRateInput(gachaOwnerShareRate));
      }
    },
    [gachaOwnerShareRate, handleOwnerShareRateCommit]
  );
  const handleCommitEditingGacha = useCallback(() => {
    if (!editingGachaId) {
      return;
    }

    appStateStore.renameGacha(editingGachaId, editingGachaName);
    setEditingGachaId(null);
    setEditingGachaName('');
  }, [appStateStore, editingGachaId, editingGachaName]);

  useEffect(() => {
    const prefs = persistence.loadSnapshot().receivePrefs;
    setOwnerName(prefs?.ownerName ?? '');
  }, [discordSession?.loggedIn, discordSession?.user?.name, persistence]);

  const persistOwnerName = useCallback(
    (nextName: string) => {
      const snapshot = persistence.loadSnapshot();
      const current = snapshot.receivePrefs;
      const normalized = nextName.trim();
      const nextPrefs = {
        ...current,
        version: 3,
        intro: current?.intro ?? { skipIntro: false },
        ownerName: normalized.length > 0 ? normalized : null
      };
      persistence.saveReceivePrefsDebounced(nextPrefs);
    },
    [persistence]
  );

  const handleOwnerNameChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const value = event.target.value;
      setOwnerName(value);
      persistOwnerName(value);
    },
    [persistOwnerName]
  );
  const handleQuickSendNewOnlyChange = useCallback(
    (enabled: boolean) => {
      uiPreferencesStore.setQuickSendNewOnlyPreference(enabled, { persist: 'immediate' });
    },
    [uiPreferencesStore]
  );
  const handleExcludeRiaguImagesChange = useCallback(
    (enabled: boolean) => {
      uiPreferencesStore.setExcludeRiaguImagesPreference(enabled, { persist: 'immediate' });
    },
    [uiPreferencesStore]
  );

  const handleCompleteOutOfStockChange = useCallback(
    (enabled: boolean) => {
      uiPreferencesStore.setCompleteGachaIncludeOutOfStockPreference(enabled, { persist: 'immediate' });
    },
    [uiPreferencesStore]
  );

  const handleGuaranteeOutOfStockChange = useCallback(
    (enabled: boolean) => {
      uiPreferencesStore.setGuaranteeOutOfStockItemPreference(enabled, { persist: 'immediate' });
    },
    [uiPreferencesStore]
  );

  const handleApplyLowerThresholdGuaranteesChange = useCallback(
    (enabled: boolean) => {
      uiPreferencesStore.setApplyLowerThresholdGuaranteesPreference(enabled, { persist: 'immediate' });
    },
    [uiPreferencesStore]
  );

  const handleDesktopLayoutChange = useCallback(
    (layout: DashboardDesktopLayout) => {
      if (isSidebarLayoutForced) {
        return;
      }
      setDesktopLayout(layout);
      uiPreferencesStore.setDashboardDesktopLayout(layout);
    },
    [isSidebarLayoutForced, uiPreferencesStore]
  );

  const handleSiteZoomChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const numeric = Number(event.target.value);
      if (!Number.isFinite(numeric) || Number.isNaN(numeric)) {
        return;
      }
      const nextZoomPercent = clampSiteZoomPercent(numeric);
      setSiteZoomPercent(nextZoomPercent);
      uiPreferencesStore.setSiteZoomPercent(nextZoomPercent, { persist: 'debounced' });
    },
    [uiPreferencesStore]
  );

  const handleCommitSiteZoom = useCallback(() => {
    const normalized = clampSiteZoomPercent(siteZoomPercent);
    uiPreferencesStore.setSiteZoomPercent(normalized, { persist: 'immediate', emit: false });
  }, [siteZoomPercent, uiPreferencesStore]);

  const handleStartZoomPreview = useCallback(
    (_event: ReactPointerEvent<HTMLInputElement>) => {
      if (isMobileDashboard) {
        return;
      }
      setIsZoomPreviewing(true);
    },
    [isMobileDashboard]
  );

  const handleStopZoomPreview = useCallback(() => {
    setIsZoomPreviewing(false);
    handleCommitSiteZoom();
  }, [handleCommitSiteZoom]);

  const handleSiteZoomSliderBlur = useCallback(() => {
    handleStopZoomPreview();
  }, [handleStopZoomPreview]);

  const handleSiteZoomSliderKeyUp = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      const commitKeys = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown']);
      if (commitKeys.has(event.key)) {
        handleCommitSiteZoom();
      }
    },
    [handleCommitSiteZoom]
  );

  const handleResetSiteZoom = useCallback(() => {
    setIsZoomPreviewing(false);
    setSiteZoomPercent(DEFAULT_SITE_ZOOM_PERCENT);
    uiPreferencesStore.setSiteZoomPercent(DEFAULT_SITE_ZOOM_PERCENT, { persist: 'immediate' });
  }, [uiPreferencesStore]);

  const handleDeleteAllData = useCallback(async () => {
    if (isDeletingAllData) {
      return;
    }

    setIsDeletingAllData(true);
    let succeeded = false;

    try {
      appStateStore.setState(undefined);
      catalogStore.setState(undefined);
      rarityStore.setState(undefined);
      riaguStore.setState(undefined);
      ptControlsStore.setState(undefined);
      uiPreferencesStore.setState(undefined);
      pullHistoryStore.setState(undefined);
      userInventoriesStore.setState(undefined);
      userProfilesStore.setState(undefined);

      persistence.clearAllData();
      clearToolbarPreferencesStorage();
      clearDashboardControlsPositionStorage();
      clearAllDiscordGuildSelections();

      await deleteAllAssets();
      succeeded = true;
    } catch (error) {
      console.error('Failed to delete all data', error);
      if (typeof window !== 'undefined' && typeof window.alert === 'function') {
        window.alert('全てのデータを削除できませんでした。ブラウザのストレージ設定をご確認の上、再度お試しください。');
      }
    } finally {
      setIsDeletingAllData(false);
      if (succeeded) {
        close();
      }
    }
  }, [
    appStateStore,
    catalogStore,
    close,
    clearAllDiscordGuildSelections,
    clearDashboardControlsPositionStorage,
    clearToolbarPreferencesStorage,
    deleteAllAssets,
    isDeletingAllData,
    persistence,
    ptControlsStore,
    pullHistoryStore,
    rarityStore,
    riaguStore,
    uiPreferencesStore,
    userInventoriesStore,
    userProfilesStore
  ]);

  const handleResetDiscordServerInfo = useCallback(() => {
    if (isResettingDiscordServerInfo) {
      return;
    }

    setIsResettingDiscordServerInfo(true);

    try {
      clearAllDiscordUserStates();
      userProfilesStore.resetDiscordInfo({ persist: 'immediate' });
    } catch (error) {
      console.error('Failed to reset Discord server info', error);
      if (typeof window !== 'undefined' && typeof window.alert === 'function') {
        window.alert(
          'Discordサーバー情報のリセットに失敗しました。ブラウザのストレージ設定をご確認の上、再度お試しください。'
        );
      }
    } finally {
      setIsResettingDiscordServerInfo(false);
    }
  }, [isResettingDiscordServerInfo, userProfilesStore]);

  const handleRequestDeleteAllData = useCallback(() => {
    if (isDeletingAllData) {
      return;
    }

    push(ConfirmDialog, {
      id: 'confirm-delete-all-data',
      title: '全てのデータを削除',
      size: 'sm',
      payload: {
        message:
          '端末に保存されているガチャ、景品、ユーザー情報、履歴、設定など全てのデータを削除します。この操作は取り消せません。必要な場合は事前にバックアップを取得してください。',
        confirmLabel: '削除する',
        cancelLabel: 'キャンセル',
        onConfirm: () => {
          void handleDeleteAllData();
        }
      }
    });
  }, [handleDeleteAllData, isDeletingAllData, push]);

  const gachaEntries = useMemo(() => {
    if (!appState) {
      return [] as Array<{ id: string; name: string; isSelected: boolean; isArchived: boolean }>;
    }

    const order = appState.order ?? [];
    const meta = appState.meta ?? {};
    const seen = new Set<string>();
    const entries: Array<{ id: string; name: string; isSelected: boolean; isArchived: boolean }> = [];

    const append = (gachaId: string | undefined | null) => {
      if (!gachaId || seen.has(gachaId)) {
        return;
      }
      seen.add(gachaId);
      const displayName = meta[gachaId]?.displayName?.trim();
      entries.push({
        id: gachaId,
        name: displayName && displayName.length > 0 ? displayName : gachaId,
        isSelected: appState.selectedGachaId === gachaId,
        isArchived: meta[gachaId]?.isArchived === true
      });
    };

    order.forEach(append);
    Object.keys(meta).forEach(append);

    const active = entries.filter((entry) => !entry.isArchived);
    const archived = entries.filter((entry) => entry.isArchived);

    return [...active, ...archived];
  }, [appState]);

  useEffect(() => {
    if (!editingGachaId) {
      return;
    }

    const exists = gachaEntries.some((entry) => entry.id === editingGachaId);
    if (!exists) {
      setEditingGachaId(null);
      setEditingGachaName('');
    }
  }, [editingGachaId, gachaEntries]);

  const accentScheme: 'light' | 'dark' = theme === 'light' ? 'light' : theme === 'dark' ? 'dark' : customBaseTone;
  const normalizedAccent = customAccentColor.toLowerCase();
  const accentChoices = useMemo(
    () =>
      SITE_ACCENT_PALETTE.map((entry) => ({
        id: entry.id,
        name: entry.name,
        value: entry[accentScheme]
      })),
    [accentScheme]
  );
  const selectedPalette = useMemo(
    () =>
      SITE_ACCENT_PALETTE.find(
        (entry) =>
          entry.light.toLowerCase() === normalizedAccent || entry.dark.toLowerCase() === normalizedAccent
      ) ?? null,
    [normalizedAccent]
  );
  const desktopLayoutOptions = useMemo(() => DASHBOARD_DESKTOP_LAYOUT_OPTIONS, []);
  const effectiveDesktopLayout: DashboardDesktopLayout = isSidebarLayoutForced ? 'sidebar' : desktopLayout;

  useEffect(() => {
    if (!selectedPalette) {
      return;
    }
    const nextHex = selectedPalette[accentScheme].toLowerCase();
    if (nextHex !== normalizedAccent) {
      setCustomAccentColor(selectedPalette[accentScheme]);
    }
  }, [accentScheme, normalizedAccent, selectedPalette, setCustomAccentColor]);

  useEffect(() => {
    setDesktopLayout(uiPreferencesStore.getDashboardDesktopLayout());
  }, [uiPreferencesState, uiPreferencesStore]);

  useEffect(() => {
    setSiteZoomPercent(uiPreferencesStore.getSiteZoomPercent());
  }, [uiPreferencesState, uiPreferencesStore]);

  useEffect(() => {
    const nextValue = formatOwnerShareRateInput(gachaOwnerShareRate);
    setOwnerShareRateInput((previous) => (previous === nextValue ? previous : nextValue));
  }, [gachaOwnerShareRate]);

  const menuItems = useMemo(() => MENU_ITEMS, []);

  useEffect(() => {
    setCustomAccentDraft(customAccentColor.toUpperCase());
  }, [customAccentColor]);

  useEffect(() => {
    if (!isZoomPreviewing || typeof window === 'undefined') {
      return;
    }

    const stopPreview = () => {
      handleStopZoomPreview();
    };

    window.addEventListener('pointerup', stopPreview);
    window.addEventListener('pointercancel', stopPreview);

    return () => {
      window.removeEventListener('pointerup', stopPreview);
      window.removeEventListener('pointercancel', stopPreview);
    };
  }, [handleStopZoomPreview, isZoomPreviewing]);

  useEffect(() => {
    if (activeMenu !== 'layout' && isZoomPreviewing) {
      handleStopZoomPreview();
    }
  }, [activeMenu, handleStopZoomPreview, isZoomPreviewing]);

  useEffect(() => {
    if (isMobileDashboard && isZoomPreviewing) {
      handleStopZoomPreview();
    }
  }, [handleStopZoomPreview, isMobileDashboard, isZoomPreviewing]);

  useEffect(() => {
    if (isTop || !isZoomPreviewing) {
      return;
    }
    handleStopZoomPreview();
  }, [handleStopZoomPreview, isTop, isZoomPreviewing]);

  useEffect(() => {
    if (typeof document === 'undefined') {
      return;
    }

    const { body } = document;
    if (isZoomPreviewing) {
      body.dataset[PAGE_SETTINGS_ZOOM_PREVIEW_DATASET_KEY] = '1';
    } else {
      delete body.dataset[PAGE_SETTINGS_ZOOM_PREVIEW_DATASET_KEY];
    }

    return () => {
      delete body.dataset[PAGE_SETTINGS_ZOOM_PREVIEW_DATASET_KEY];
    };
  }, [isZoomPreviewing]);

  useLayoutEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const updateViewport = () => {
      const innerHeight = window.innerHeight;
      const next = innerHeight - VIEWPORT_PADDING_PX;
      const limit = next > 0 ? next : innerHeight;
      setViewportMaxHeight(limit > 0 ? limit : null);
    };

    updateViewport();
    window.addEventListener('resize', updateViewport);

    return () => {
      window.removeEventListener('resize', updateViewport);
    };
  }, []);

  useLayoutEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia === 'undefined') {
      return;
    }

    const mediaQuery = window.matchMedia('(min-width: 1024px)');
    const updateLayout = () => {
      const matches = mediaQuery.matches;
      setIsLargeLayout(matches);
      setActiveView(matches ? 'content' : 'menu');
    };

    updateLayout();

    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', updateLayout);
    } else {
      mediaQuery.addListener(updateLayout);
    }

    return () => {
      if (typeof mediaQuery.removeEventListener === 'function') {
        mediaQuery.removeEventListener('change', updateLayout);
      } else {
        mediaQuery.removeListener(updateLayout);
      }
    };
  }, []);

  useLayoutEffect(() => {
    if (typeof window === 'undefined' || typeof window.ResizeObserver === 'undefined') {
      return;
    }

    const element = modalBodyRef.current;
    if (!element) {
      return;
    }

    const observer = new window.ResizeObserver((entries) => {
      for (const entry of entries) {
        const nextHeight = Math.max(BASE_MODAL_MIN_HEIGHT_PX, Math.ceil(entry.contentRect.height));
        setMaxBodyHeight((previous) => (nextHeight > previous ? nextHeight : previous));
      }
    });

    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, []);

  const handleCustomAccentInputChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    setCustomAccentDraft(event.target.value);
  }, []);

  const handleCustomAccentCommit = useCallback(() => {
    const trimmed = customAccentDraft.trim();
    const candidate = trimmed.startsWith('#') ? trimmed : `#${trimmed}`;
    const normalized = candidate.toUpperCase();

    if (/^#[0-9A-F]{6}$/.test(normalized)) {
      if (theme !== 'custom') {
        setTheme('custom');
      }
      setCustomAccentColor(normalized);
      return;
    }

    setCustomAccentDraft(customAccentColor.toUpperCase());
  }, [customAccentDraft, customAccentColor, setCustomAccentColor, setTheme, theme]);

  const handleCustomAccentInputKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        handleCustomAccentCommit();
      }
    },
    [handleCustomAccentCommit]
  );

  const handleCustomAccentInputBlur = useCallback(() => {
    handleCustomAccentCommit();
  }, [handleCustomAccentCommit]);

  const showDiscordLogsPreference = useMemo(
    () => uiPreferencesStore.getDiscordAuthLogsEnabled(),
    [uiPreferencesState, uiPreferencesStore]
  );
  const [showDiscordDebugLogs, setShowDiscordDebugLogs] = useState<boolean>(showDiscordLogsPreference);

  useEffect(() => {
    setShowDiscordDebugLogs((previous) =>
      previous === showDiscordLogsPreference ? previous : showDiscordLogsPreference
    );
  }, [showDiscordLogsPreference]);

  const handleMenuSelect = useCallback(
    (menu: SettingsMenuKey) => {
      setActiveMenu(menu);
      if (!isLargeLayout) {
        setActiveView('content');
      }
    },
    [isLargeLayout]
  );

  const handleToggleDiscordDebugLogs = useCallback(
    (enabled: boolean) => {
      setShowDiscordDebugLogs(enabled);
      uiPreferencesStore.setDiscordAuthLogsEnabled(enabled, { persist: 'immediate' });
    },
    [uiPreferencesStore]
  );

  const handleBackToMenu = useCallback(() => {
    if (!isLargeLayout) {
      setActiveView('menu');
    }
  }, [isLargeLayout]);

  const renderMenuContent = () => {
    switch (activeMenu) {
      case 'gacha': {
        return (
          <div className="space-y-6">
            <div>
              <h2 className="text-base font-semibold text-surface-foreground">ガチャ設定</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                並べ替えや表示ルールを変更すると、ガチャ管理ページに即時反映されます。
              </p>
            </div>
            <div className="space-y-3">
              <SwitchField
                label="アーカイブ済みのガチャをリストに表示"
                description="過去に終了したガチャも一覧から確認できるようにします。"
                checked={showArchived}
                onChange={setShowArchived}
              />
              <SwitchField
                label="クイック送信時に新規取得したアイテムのみを送る"
                description="お渡し部屋に景品を送信する際、Newタグの付いた景品だけを対象にします。"
                checked={quickSendNewOnly}
                onChange={handleQuickSendNewOnlyChange}
              />
              <SwitchField
                label="リアグに登録した画像は送信・保存されないようにする"
                description="ONにすると保存オプションやクイック送信でリアグ対象の画像を含めません。"
                checked={excludeRiaguImages}
                onChange={handleExcludeRiaguImagesChange}
              />
              <SwitchField
                label="コンプリートガチャの時に在庫切れのアイテムも排出する"
                description="ONにするとコンプリートガチャ時に在庫切れのアイテムも排出します。在庫数をオーバーしますので、追加の発注が必要になります。"
                checked={completeOutOfStock}
                onChange={handleCompleteOutOfStockChange}
              />
              <SwitchField
                label="天井保証のアイテムに在庫が設定されている時、在庫切れでもアイテムを排出する"
                description="ONにすると、天井保証のアイテムに在庫が設定されている時、在庫切れでもアイテムを排出します。天井保証アイテムの候補が複数あるときは、在庫切れのアイテムは排出されません"
                checked={guaranteeOutOfStock}
                onChange={handleGuaranteeOutOfStockChange}
              />
              <SwitchField
                label="上位連数の天井保証に達した時に下位連数の保証も適用する"
                description="ONにすると、複数の天井保証が設定されている場合に下位の保証もすべて適用します。OFFの場合は、到達した中で最も高い連数の保証のみ適用します。"
                checked={applyLowerThresholdGuarantees}
                onChange={handleApplyLowerThresholdGuaranteesChange}
              />
            </div>
            <div className="rounded-2xl border border-border/60 bg-panel/70 p-4">
              <label htmlFor="gacha-owner-share-rate" className="text-sm font-semibold text-surface-foreground">
                配信アプリからの還元率
              </label>
              <p className="mt-1 text-xs text-muted-foreground">
                ガチャ売上のうち、オーナーに入る割合を設定します。
              </p>
              <div className="mt-3 flex items-center gap-2">
                <input
                  id="gacha-owner-share-rate"
                  type="number"
                  min={0}
                  max={100}
                  step={0.1}
                  value={ownerShareRateInput}
                  onChange={handleOwnerShareRateChange}
                  onBlur={handleOwnerShareRateCommit}
                  onKeyDown={handleOwnerShareRateKeyDown}
                  className="w-24 rounded-xl border border-border/60 bg-surface/80 px-3 py-2 text-sm text-surface-foreground outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/40"
                  inputMode="decimal"
                />
                <span className="text-xs text-muted-foreground">%</span>
              </div>
            </div>
            <div className="space-y-4 rounded-2xl border border-border/60 bg-panel-contrast/60 p-4">
              <div className="space-y-1">
                <h3 className="text-sm font-semibold text-surface-foreground">登録済みのガチャ</h3>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  現在ローカルに保存されているガチャの一覧です。不要になったガチャは削除することで、関連するアイテムやリアグ設定もまとめて整理できます。
                </p>
              </div>
              {gachaEntries.length > 0 ? (
                <ul className="space-y-2">
                  {gachaEntries
                    .filter((entry) => showArchived || !entry.isArchived)
                    .map((entry) => (
                      <li key={entry.id}>
                        <div className="rounded-xl border border-border/60 bg-panel px-4 py-3 text-sm text-surface-foreground">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="flex min-w-[200px] flex-1 flex-col gap-2">
                              {editingGachaId === entry.id ? (
                                <>
                                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                                    <input
                                      type="text"
                                      value={editingGachaName}
                                      onChange={handleEditingGachaNameChange}
                                      onKeyDown={(event) => {
                                        if (event.key === 'Enter') {
                                          event.preventDefault();
                                          handleCommitEditingGacha();
                                        }
                                        if (event.key === 'Escape') {
                                          event.preventDefault();
                                          handleCancelEditingGacha();
                                        }
                                      }}
                                      autoFocus
                                      className="w-full rounded-lg border border-border/60 bg-panel px-3 py-2 text-sm text-surface-foreground transition focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
                                    />
                                    <div className="flex flex-wrap items-center gap-2">
                                      <button
                                        type="button"
                                        className="inline-flex items-center gap-1.5 rounded-lg border border-accent/50 px-3 py-1.5 text-xs font-semibold text-accent transition hover:bg-accent/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
                                        onClick={handleCommitEditingGacha}
                                      >
                                        保存
                                      </button>
                                      <button
                                        type="button"
                                        className="inline-flex items-center gap-1.5 rounded-lg border border-border/60 px-3 py-1.5 text-xs font-semibold text-muted-foreground transition hover:bg-panel-muted hover:text-surface-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-muted-foreground/30"
                                        onClick={handleCancelEditingGacha}
                                      >
                                        キャンセル
                                      </button>
                                    </div>
                                  </div>
                                  <p className="text-xs text-muted-foreground">ID: {entry.id}</p>
                                </>
                              ) : (
                                <>
                                  <div className="flex items-center gap-2">
                                    <p className="font-semibold leading-tight">{entry.name}</p>
                                    <button
                                      type="button"
                                      className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border/60 text-muted-foreground transition hover:border-accent/40 hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
                                      onClick={() => handleStartEditingGacha(entry.id, entry.name)}
                                      aria-label={`${entry.name}を編集`}
                                    >
                                      <PencilSquareIcon className="h-4 w-4" aria-hidden="true" />
                                    </button>
                                  </div>
                                  <p className="text-xs text-muted-foreground">ID: {entry.id}</p>
                                </>
                              )}
                            </div>
                            <div className="flex flex-1 flex-wrap items-center justify-end gap-2">
                              {entry.isSelected ? (
                                <span className="inline-flex items-center rounded-full bg-accent/15 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.25em] text-accent">
                                  選択中
                                </span>
                              ) : null}
                              {entry.isArchived ? (
                                <span className="inline-flex items-center rounded-full border border-border/60 bg-panel-muted/70 px-3 py-1 text-[11px] font-semibold tracking-[0.2em] text-muted-foreground">
                                  アーカイブ済み
                                </span>
                              ) : null}
                              {entry.isArchived ? (
                                <button
                                  type="button"
                                  className="inline-flex items-center gap-1.5 rounded-lg border border-accent/50 px-3 py-1.5 text-xs font-semibold text-accent transition hover:bg-accent/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
                                  onClick={() => handleRestoreGacha(entry.id)}
                                >
                                  戻す
                                </button>
                              ) : null}
                              <button
                                type="button"
                                className="inline-flex items-center gap-1.5 rounded-lg border border-red-500/50 px-3 py-1.5 text-xs font-semibold text-red-500 transition hover:bg-red-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/40"
                                onClick={() => confirmPermanentDeleteGacha({ id: entry.id, name: entry.name })}
                              >
                                削除
                              </button>
                            </div>
                          </div>
                        </div>
                      </li>
                    ))}
                </ul>
              ) : (
                <p className="rounded-xl border border-border/50 bg-panel px-4 py-3 text-xs text-muted-foreground">
                  まだガチャが登録されていません。ガチャ管理ページから新しいガチャを作成すると、ここに表示されます。
                </p>
              )}
            </div>
          </div>
        );
      }
      case 'receive':
        return <ReceiveSettingsContent />;
      case 'layout':
        return (
          <div
            className={clsx(
              'page-settings__layout-tab space-y-6',
              isZoomPreviewing && 'page-settings__layout-tab--previewing'
            )}
          >
            <div className="page-settings__layout-intro">
              <h2 className="text-base font-semibold text-surface-foreground">レイアウトとズーム</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                デスクトップ時の表示方式を切り替えて、画面サイズに合わせた操作性を選択できます。
              </p>
            </div>
            <div className="page-settings__desktop-layout-panel space-y-4">
              <div className="page-settings__desktop-layout-header space-y-1">
                <h3 className="text-sm font-semibold text-surface-foreground">デスクトップレイアウト</h3>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  横幅の広い画面での表示スタイルを切り替えられます。サイドバー表示はノートPCなどの狭い画面でもセクションを順番に確認できます。
                </p>
              </div>
              {isSidebarLayoutForced ? (
                <p className="rounded-xl border border-accent/30 bg-accent/5 px-3 py-2 text-xs text-accent">
                  画面幅が900〜1025pxのため、サイドバーレイアウトが自動的に適用されています。
                </p>
              ) : null}
              <RadioGroup
                value={effectiveDesktopLayout}
                onChange={handleDesktopLayoutChange}
                className="space-y-2"
              >
                {desktopLayoutOptions.map((option) => {
                  const optionDisabled = isSidebarLayoutForced && option.value !== 'sidebar';
                  return (
                    <RadioGroup.Option
                      key={option.value}
                      value={option.value}
                      disabled={optionDisabled}
                      className={({ checked, active, disabled }) =>
                        clsx(
                          'flex items-start justify-between gap-4 rounded-2xl border px-4 py-3 transition',
                          checked
                            ? 'border-accent bg-accent/10'
                            : 'border-border/60 bg-panel hover:border-accent/40 hover:bg-panel-contrast/90',
                          active && !checked ? 'ring-2 ring-accent/40' : undefined,
                          disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'
                        )
                      }
                    >
                      {({ checked }) => (
                        <div className="flex w-full flex-col gap-1">
                          <div className="flex items-center justify-between gap-3">
                            <RadioGroup.Label className="text-sm font-semibold text-surface-foreground">
                              {option.label}
                            </RadioGroup.Label>
                            {checked ? (
                              <span className="text-[11px] font-semibold uppercase tracking-[0.25em] text-accent">
                                適用中
                              </span>
                            ) : null}
                          </div>
                          <RadioGroup.Description className="text-xs leading-relaxed text-muted-foreground">
                            {option.description}
                          </RadioGroup.Description>
                          {optionDisabled ? (
                            <p className="text-[11px] text-muted-foreground">
                              現在の画面幅ではサイドバーのみ利用できます。
                            </p>
                          ) : null}
                          {isSidebarLayoutForced && option.value === 'sidebar' ? (
                            <p className="text-[11px] text-accent">
                              中間幅の画面では自動的にこのレイアウトが適用されます。
                            </p>
                          ) : null}
                        </div>
                      )}
                    </RadioGroup.Option>
                  );
                })}
              </RadioGroup>
            </div>
            {!isMobileDashboard ? (
              <div
                className={clsx(
                  'page-settings__site-zoom-panel space-y-4 transition',
                  isZoomPreviewing &&
                    'page-settings__site-zoom-panel--previewing rounded-2xl border border-border/60'
                )}
              >
                <div className="page-settings__site-zoom-header space-y-1">
                  <h3 className="page-settings__site-zoom-title text-sm font-semibold text-surface-foreground">
                    サイト表示倍率
                  </h3>
                  <p className="page-settings__site-zoom-description text-xs leading-relaxed text-muted-foreground">
                    表示サイズを50%〜100%で調整できます。
                  </p>
                </div>
                <div className="page-settings__site-zoom-controls flex items-center gap-3">
                  <label className="sr-only" htmlFor="page-settings-site-zoom-range">
                    サイト表示倍率
                  </label>
                  <input
                    id="page-settings-site-zoom-range"
                    type="range"
                    min={SITE_ZOOM_PERCENT_MIN}
                    max={SITE_ZOOM_PERCENT_MAX}
                    step={1}
                    value={siteZoomPercent}
                    onChange={handleSiteZoomChange}
                    onPointerDown={handleStartZoomPreview}
                    onPointerUp={handleStopZoomPreview}
                    onPointerCancel={handleStopZoomPreview}
                    onBlur={handleSiteZoomSliderBlur}
                    onKeyUp={handleSiteZoomSliderKeyUp}
                    className="page-settings__site-zoom-slider h-2 w-full cursor-pointer appearance-none rounded-lg bg-panel-contrast accent-accent"
                    aria-valuemin={SITE_ZOOM_PERCENT_MIN}
                    aria-valuemax={SITE_ZOOM_PERCENT_MAX}
                    aria-valuenow={siteZoomPercent}
                    aria-label="サイト表示倍率"
                  />
                  <span className="page-settings__site-zoom-value min-w-[3.5rem] text-right text-sm font-semibold text-accent">
                    {siteZoomPercent}%
                  </span>
                </div>
                <div className="page-settings__site-zoom-actions flex justify-end">
                  <button
                    type="button"
                    onClick={handleResetSiteZoom}
                    className="page-settings__site-zoom-reset-button rounded-lg border border-border/60 px-3 py-1.5 text-xs font-semibold text-muted-foreground transition hover:border-accent/40 hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
                  >
                    リセット
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        );
      case 'site-theme':
        return (
          <div className="space-y-6">
            <div>
              <h2 className="text-base font-semibold text-surface-foreground">サイトカラー</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                背景とアクセントカラーを切り替えて、配信や共有に合わせた雰囲気に調整できます。
              </p>
            </div>
            <RadioGroup value={theme} onChange={setTheme} className="space-y-3">
              {options.map((option) => (
                <RadioGroup.Option
                  key={option.id}
                  value={option.id}
                  className={({ checked, active }) =>
                    clsx(
                      'flex items-start justify-between gap-4 rounded-2xl border px-4 py-4 transition',
                      checked
                        ? 'border-accent bg-accent/10'
                        : 'border-border/60 bg-panel-muted/80 hover:border-accent/40 hover:bg-panel-contrast/90',
                      active && !checked ? 'ring-2 ring-accent/40' : undefined
                    )
                  }
                >
                  {({ checked }) => (
                    <div className="flex w-full flex-col gap-5">
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                        <div className="space-y-1.5">
                          <RadioGroup.Label className="text-sm font-semibold text-surface-foreground">
                            {option.label}
                          </RadioGroup.Label>
                          <RadioGroup.Description className="text-xs text-muted-foreground">
                            {option.description}
                          </RadioGroup.Description>
                          {checked ? (
                            <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-accent">適用中</p>
                          ) : null}
                        </div>
                        <div className="flex flex-wrap items-end gap-3 sm:flex-nowrap sm:justify-end">
                          {option.swatch.map((swatch) => {
                            const backgroundColor = swatch.sampleBackground ?? swatch.color;
                            const isText = swatch.role === 'text';
                            return (
                              <div
                                key={`${option.id}-${swatch.role}`}
                                className="flex flex-col items-center gap-2"
                              >
                                <span
                                  className="flex h-12 w-12 items-center justify-center rounded-xl border border-border/40"
                                  style={{ backgroundColor, color: isText ? swatch.color : undefined }}
                                  aria-hidden="true"
                                >
                                  {isText ? <span className="text-sm font-semibold leading-none">Aa</span> : null}
                                </span>
                                <span className="text-[11px] font-semibold tracking-[0.18em] text-muted-foreground">
                                  {swatch.label}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                      {option.id === 'custom' ? (
                        <div className="space-y-5 rounded-xl border border-border/60 bg-panel-contrast p-4">
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                            <div className="space-y-1">
                              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-muted-foreground">
                                メインカラー
                              </p>
                              <p className="text-[11px] text-muted-foreground">
                                サイト全体の背景色と文字色を切り替えます。
                              </p>
                            </div>
                            <RadioGroup
                              value={customBaseTone}
                              onChange={(nextTone) => {
                                setCustomBaseTone(nextTone);
                                if (theme !== 'custom') {
                                  setTheme('custom');
                                }
                              }}
                              className="flex flex-col gap-2 sm:flex-row"
                            >
                              {CUSTOM_BASE_TONE_OPTIONS.map((baseOption) => (
                                <RadioGroup.Option
                                  key={baseOption.id}
                                  value={baseOption.id}
                                  className={({ checked, active }) =>
                                    clsx(
                                      'flex w-full min-w-[200px] items-center gap-3 rounded-xl border px-3 py-2 text-left transition focus:outline-none sm:w-auto',
                                      checked
                                        ? 'border-accent bg-accent/15'
                                        : 'border-border/60 bg-panel-contrast hover:border-accent/40 hover:bg-panel-contrast/90',
                                      active && !checked ? 'ring-2 ring-accent/40' : undefined
                                    )
                                  }
                                >
                                  <div
                                    className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg border border-border/50"
                                    style={{
                                      backgroundColor: baseOption.previewBackground,
                                      color: baseOption.previewForeground
                                    }}
                                  >
                                    <span className="text-xs font-semibold leading-none">Aa</span>
                                  </div>
                                  <div className="space-y-0.5">
                                    <RadioGroup.Label className="text-xs font-semibold text-surface-foreground">
                                      {baseOption.label}
                                    </RadioGroup.Label>
                                    <RadioGroup.Description className="text-[11px] text-muted-foreground">
                                      {baseOption.description}
                                    </RadioGroup.Description>
                                  </div>
                                </RadioGroup.Option>
                              ))}
                            </RadioGroup>
                          </div>
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div className="space-y-1">
                              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-muted-foreground">
                                アクセントカラー
                              </p>
                              <p className="text-[11px] text-muted-foreground">
                                ボタンや強調表示に使用される差し色です。
                              </p>
                            </div>
                            <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-panel-contrast px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground transition focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/40">
                              <label className="sr-only" htmlFor="page-settings-custom-accent">
                                現在のカラーコード
                              </label>
                              <span
                                className="h-4 w-4 rounded border border-border/50"
                                style={{ backgroundColor: customAccentColor }}
                                aria-hidden="true"
                              />
                              <input
                                id="page-settings-custom-accent"
                                type="text"
                                value={customAccentDraft}
                                onChange={handleCustomAccentInputChange}
                                onBlur={handleCustomAccentInputBlur}
                                onKeyDown={handleCustomAccentInputKeyDown}
                                className="w-24 bg-transparent text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground focus:outline-none"
                                spellCheck={false}
                                inputMode="text"
                              />
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {accentChoices.map((entry) => {
                              const displayColor = entry.value;
                              const isSelected = selectedPalette?.id === entry.id;
                              return (
                                <button
                                  key={entry.id}
                                  type="button"
                                  className={clsx(
                                    'group rounded-lg border border-border/60 bg-panel-contrast p-1 transition hover:border-accent/50 hover:bg-panel-contrast/90',
                                    isSelected ? 'border-accent bg-accent/15' : undefined
                                  )}
                                  onClick={() => {
                                    if (customAccentColor.toLowerCase() !== displayColor.toLowerCase()) {
                                      setCustomAccentColor(displayColor);
                                    }
                                    if (theme !== 'custom') {
                                      setTheme('custom');
                                    }
                                  }}
                                  aria-pressed={isSelected}
                                >
                                  <span className="sr-only">{entry.name}</span>
                                  <span
                                    className="block h-10 w-10 rounded-md border border-border/50 transition"
                                    style={{
                                      backgroundColor: displayColor,
                                      boxShadow: isSelected ? `0 0 0 2px ${displayColor}` : undefined
                                    }}
                                    aria-hidden="true"
                                  />
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  )}
                </RadioGroup.Option>
              ))}
            </RadioGroup>
          </div>
        );
      case 'misc':
      default:
        return (
          <div className="space-y-6">
            <div>
              <h2 className="text-base font-semibold text-surface-foreground">その他の設定</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                ガイドやセキュリティに関する動作を切り替えできます。変更内容はすぐに適用されます。
              </p>
            </div>
            <div className="space-y-4">
              <div className="rounded-2xl border border-border/60 bg-panel/70 p-4">
                <label htmlFor="owner-name" className="text-sm font-semibold text-surface-foreground">
                  オーナー名
                </label>
                <p className="mt-1 text-xs text-muted-foreground">
                  共有リンクの作成者として表示される名前です。Discordログイン時は自動で入力されます。
                </p>
                <input
                  id="owner-name"
                  type="text"
                  value={ownerName}
                  onChange={handleOwnerNameChange}
                  placeholder="例: Shimmy配信"
                  className="mt-3 w-full rounded-xl border border-border/60 bg-surface/80 px-3 py-2 text-sm text-surface-foreground outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/40"
                />
              </div>
              <SwitchField
                label="Discordデバッグログを表示"
                description="Discordログイン処理の詳細ログを画面下部に表示します。"
                checked={showDiscordDebugLogs}
                onChange={handleToggleDiscordDebugLogs}
              />
              <SwitchField
                label="最新機能のヒントを表示"
                description="開発中の機能やリリースノートをダッシュボード上で通知します。"
                checked={showBetaTips}
                onChange={setShowBetaTips}
              />
              <SwitchField
                label="ログアウト前に確認ダイアログを表示"
                description="誤操作を防ぐため、ログアウト前に確認メッセージを表示します。"
                checked={confirmLogout}
                onChange={setConfirmLogout}
              />
              <div className="space-y-3 rounded-2xl border border-border/60 bg-panel-contrast/60 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-2">
                    <h3 className="text-sm font-semibold text-surface-foreground">Discordサーバー情報のリセット</h3>
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      登録したDiscordサーバーの情報（ギルド、メンバー）をリセットします。
                    </p>
                  </div>
                  <button
                    type="button"
                    className="inline-flex items-center gap-2 rounded-xl border border-border/60 bg-panel px-4 py-2 text-sm font-semibold text-surface-foreground transition hover:border-accent/40 hover:bg-panel-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent/60"
                    onClick={handleResetDiscordServerInfo}
                    disabled={isResettingDiscordServerInfo}
                    aria-busy={isResettingDiscordServerInfo}
                  >
                    {isResettingDiscordServerInfo ? (
                      <>
                        <ArrowPathIcon className="h-4 w-4 animate-spin" aria-hidden="true" />
                        <span>リセットしています…</span>
                      </>
                    ) : (
                      <>
                        <ArrowPathIcon className="h-4 w-4" aria-hidden="true" />
                        <span>リセット</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
              <div className="space-y-3 rounded-2xl border border-red-500/40 bg-red-500/10 p-4">
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold text-surface-foreground">全てのデータを削除</h3>
                  <p className="text-xs leading-relaxed text-surface-foreground">
                    端末に保存されているガチャ、景品、ユーザー情報、履歴、設定など全てのデータを削除します。この操作は取り消せません。必要なデータがある場合は削除前に必ずバックアップを取得してください。
                  </p>
                  <p className="text-xs leading-relaxed text-surface-foreground">
                    削除が完了するとサイトは初期状態に戻ります。再度利用する場合はガチャの登録からやり直してください。
                  </p>
                </div>
                <button
                  type="button"
                  className="ml-auto inline-flex items-center gap-2 rounded-xl border border-red-500/60 bg-red-500/10 px-4 py-2 text-sm font-semibold text-red-600 transition hover:border-red-500 hover:bg-red-500/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-500 dark:text-red-100"
                  onClick={handleRequestDeleteAllData}
                  disabled={isDeletingAllData}
                  aria-busy={isDeletingAllData}
                >
                  <span className="flex items-center gap-2">
                    {isDeletingAllData ? (
                      <>
                        <ArrowPathIcon className="h-4 w-4 animate-spin" aria-hidden="true" />
                        <span>削除しています…</span>
                      </>
                    ) : (
                      <>
                        <TrashIcon className="h-4 w-4" aria-hidden="true" />
                        <span>全てのデータを削除する</span>
                      </>
                    )}
                  </span>
                </button>
              </div>
            </div>
          </div>
        );
    }
  };

  const desiredMinHeight = Math.max(BASE_MODAL_MIN_HEIGHT_PX, maxBodyHeight);
  const viewportLimit = viewportMaxHeight != null && viewportMaxHeight > 0 ? viewportMaxHeight : null;
  const effectiveMinHeight = viewportLimit ? Math.min(desiredMinHeight, viewportLimit) : desiredMinHeight;

  return (
    <ModalBody
      ref={modalBodyRef}
      className={clsx(
        'page-settings-dialog flex flex-col space-y-0 overflow-hidden p-0',
        isZoomPreviewing && 'page-settings-dialog--zoom-previewing',
        isLargeLayout ? 'mt-6' : 'mt-4 bg-panel/95'
      )}
      style={{
        minHeight: `${effectiveMinHeight}px`,
        maxHeight: viewportLimit ? `${viewportLimit}px` : undefined
      }}
    >
      <div className="page-settings__split-scroll-container flex flex-1 flex-col gap-4 overflow-hidden rounded-3xl bg-panel/95 [&>*]:min-h-0 sm:gap-6 lg:flex-row lg:items-stretch lg:gap-8 lg:rounded-none lg:bg-transparent">
        <nav
          className={clsx(
            'page-settings__menu-scroll m-2 w-[calc(100%-1rem)] min-h-0 flex-1 overflow-y-auto p-2 lg:m-0 lg:w-full lg:flex-none lg:self-stretch lg:p-0',
            isLargeLayout ? 'max-w-[220px]' : 'max-w-none',
            activeView === 'menu' ? 'block' : 'hidden',
            'lg:block'
          )}
        >
          <ul className="space-y-2">
            {menuItems.map((item) => {
              const isActive = activeMenu === item.id;
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => handleMenuSelect(item.id)}
                    className={clsx(
                      'group w-full rounded-xl border px-4 py-3 text-left transition lg:shadow-none',
                      isActive
                        ? 'border-accent bg-accent/10 text-surface-foreground shadow-sm'
                        : 'border-border/50 bg-panel/60 text-muted-foreground shadow-sm hover:border-accent/40 hover:bg-panel-contrast/80 lg:border-transparent lg:bg-transparent lg:hover:border-border/60 lg:hover:bg-panel-muted/70'
                    )}
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <span className="block text-sm font-semibold">{item.label}</span>
                        <span className="mt-1 block text-[11px] leading-relaxed text-muted-foreground">
                          {item.description}
                        </span>
                      </div>
                      <span className="text-sm text-muted-foreground lg:hidden" aria-hidden="true">
                        〉
                      </span>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="page-settings-nav__official-x-contact mt-3">
            <OfficialXAccountPanel variant="compact" />
          </div>
        </nav>
        <div
          className={clsx(
            'page-settings__content-scroll flex-1 max-h-full min-h-0 overflow-y-auto rounded-3xl border border-border/50 bg-panel/95 p-4 pr-3 shadow-md sm:p-5 lg:self-stretch lg:rounded-2xl lg:border-border/60 lg:bg-panel lg:p-6 lg:pr-4 lg:shadow-sm',
            isLargeLayout ? 'block' : activeView === 'content' ? 'block' : 'hidden'
          )}
        >
          {!isLargeLayout ? (
            <div className="mb-4 flex items-center lg:hidden">
              <button
                type="button"
                onClick={handleBackToMenu}
                className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground transition hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
              >
                <span aria-hidden="true">〈</span>
                <span>メニューに戻る</span>
              </button>
            </div>
          ) : null}
          {renderMenuContent()}
        </div>
      </div>
    </ModalBody>
  );
};
