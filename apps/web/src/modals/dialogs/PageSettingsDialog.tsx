import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent
} from 'react';
import { RadioGroup } from '@headlessui/react';
import { clsx } from 'clsx';

import { SwitchField } from '../../pages/gacha/components/form/SwitchField';
import { useSiteTheme } from '../../features/theme/SiteThemeProvider';
import { SITE_ACCENT_PALETTE } from '../../features/theme/siteAccentPalette';
import { ModalBody } from '../ModalComponents';
import { type ModalComponent } from '../ModalTypes';
import { useDomainStores } from '../../features/storage/AppPersistenceProvider';
import { useStoreValue } from '@domain/stores';
import { useGachaDeletion } from '../../features/gacha/hooks/useGachaDeletion';

interface MenuItem {
  id: SettingsMenuKey;
  label: string;
  description: string;
}

type SettingsMenuKey = 'gacha' | 'site-theme' | 'misc';

const MENU_ITEMS: MenuItem[] = [
  {
    id: 'gacha',
    label: 'ガチャ一覧',
    description: '一覧ページの並べ替えや表示項目を調整します。'
  },
  {
    id: 'site-theme',
    label: 'サイトカラー',
    description: '背景とアクセントカラーのテーマを切り替えます。'
  },
  {
    id: 'misc',
    label: 'その他の設定',
    description: '通知やガイドの表示方法をカスタマイズします。'
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

const REM_IN_PIXELS = 16;
const BASE_MODAL_MIN_HEIGHT_REM = 28;
const VIEWPORT_PADDING_REM = 12;
const BASE_MODAL_MIN_HEIGHT_PX = BASE_MODAL_MIN_HEIGHT_REM * REM_IN_PIXELS;
const VIEWPORT_PADDING_PX = VIEWPORT_PADDING_REM * REM_IN_PIXELS;

export const PageSettingsDialog: ModalComponent = () => {
  const modalBodyRef = useRef<HTMLDivElement | null>(null);
  const [activeMenu, setActiveMenu] = useState<SettingsMenuKey>('site-theme');
  const [showArchived, setShowArchived] = useState(true);
  const [groupBySeries, setGroupBySeries] = useState(false);
  const [showBetaTips, setShowBetaTips] = useState(true);
  const [confirmLogout, setConfirmLogout] = useState(true);
  const [maxBodyHeight, setMaxBodyHeight] = useState<number>(BASE_MODAL_MIN_HEIGHT_PX);
  const [viewportMaxHeight, setViewportMaxHeight] = useState<number | null>(null);
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
  const { appState: appStateStore } = useDomainStores();
  const appState = useStoreValue(appStateStore);
  const confirmDeleteGacha = useGachaDeletion();

  const gachaEntries = useMemo(() => {
    if (!appState) {
      return [] as Array<{ id: string; name: string; isSelected: boolean }>;
    }

    const order = appState.order ?? [];
    const meta = appState.meta ?? {};
    const seen = new Set<string>();
    const entries: Array<{ id: string; name: string; isSelected: boolean }> = [];

    const append = (gachaId: string | undefined | null) => {
      if (!gachaId || seen.has(gachaId)) {
        return;
      }
      seen.add(gachaId);
      const displayName = meta[gachaId]?.displayName?.trim();
      entries.push({
        id: gachaId,
        name: displayName && displayName.length > 0 ? displayName : gachaId,
        isSelected: appState.selectedGachaId === gachaId
      });
    };

    order.forEach(append);
    Object.keys(meta).forEach(append);

    return entries;
  }, [appState]);

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

  useEffect(() => {
    if (!selectedPalette) {
      return;
    }
    const nextHex = selectedPalette[accentScheme].toLowerCase();
    if (nextHex !== normalizedAccent) {
      setCustomAccentColor(selectedPalette[accentScheme]);
    }
  }, [accentScheme, normalizedAccent, selectedPalette, setCustomAccentColor]);

  const menuItems = useMemo(() => MENU_ITEMS, []);

  useEffect(() => {
    setCustomAccentDraft(customAccentColor.toUpperCase());
  }, [customAccentColor]);

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

  const renderMenuContent = () => {
    switch (activeMenu) {
      case 'gacha':
        return (
          <div className="space-y-6">
            <div>
              <h2 className="text-base font-semibold text-surface-foreground">ガチャ一覧の表示</h2>
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
                label="シリーズ別にカードをグループ化"
                description="同じシリーズのガチャをまとめて表示し、カテゴリ見出しを追加します。"
                checked={groupBySeries}
                onChange={setGroupBySeries}
              />
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
                  {gachaEntries.map((entry) => (
                    <li key={entry.id}>
                      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/60 bg-panel px-4 py-3 text-sm text-surface-foreground">
                        <div className="space-y-1">
                          <p className="font-semibold leading-tight">{entry.name}</p>
                          <p className="text-xs text-muted-foreground">ID: {entry.id}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          {entry.isSelected ? (
                            <span className="inline-flex items-center rounded-full bg-accent/15 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.25em] text-accent">
                              選択中
                            </span>
                          ) : null}
                          <button
                            type="button"
                            className="inline-flex items-center gap-1.5 rounded-lg border border-red-500/50 px-3 py-1.5 text-xs font-semibold text-red-500 transition hover:bg-red-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/40"
                            onClick={() => confirmDeleteGacha({ id: entry.id, name: entry.name })}
                          >
                            削除
                          </button>
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
            <div className="space-y-3">
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
      className="mt-6 flex flex-col space-y-0 overflow-hidden"
      style={{
        minHeight: `${effectiveMinHeight}px`,
        maxHeight: viewportLimit ? `${viewportLimit}px` : undefined
      }}
    >
      <div className="flex flex-1 flex-col gap-6 overflow-hidden [&>*]:min-h-0 lg:flex-row lg:items-start lg:gap-8">
        <nav className="w-full max-w-[220px] shrink-0">
          <ul className="space-y-2">
            {menuItems.map((item) => {
              const isActive = activeMenu === item.id;
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => setActiveMenu(item.id)}
                    className={clsx(
                      'w-full rounded-xl border px-4 py-3 text-left transition',
                      isActive
                        ? 'border-accent bg-accent/10 text-surface-foreground'
                        : 'border-transparent text-muted-foreground hover:border-border/60 hover:bg-panel-muted/70'
                    )}
                  >
                    <span className="block text-sm font-semibold">{item.label}</span>
                    <span className="mt-1 block text-[11px] leading-relaxed text-muted-foreground">
                      {item.description}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>
        <div className="flex-1 max-h-full overflow-y-auto rounded-2xl border border-border/60 bg-panel p-6 pr-4 shadow-sm">
          {renderMenuContent()}
        </div>
      </div>
    </ModalBody>
  );
};
