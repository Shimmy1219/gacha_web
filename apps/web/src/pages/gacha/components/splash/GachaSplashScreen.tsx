import { clsx } from 'clsx';
import { type DashboardDesktopLayout } from '@domain/stores/uiPreferencesStore';

import { OfficialXAccountPanel } from '../../../../components/OfficialXAccountPanel';
import { DiscordLoginButton } from '../auth/DiscordLoginButton';

interface GachaSplashScreenProps {
  onRegisterGacha?: () => void;
  onOpenPageSettings?: () => void;
  showDesktopLayoutSelector?: boolean;
  selectedDesktopLayout?: DashboardDesktopLayout;
  onSelectDesktopLayout?: (layout: DashboardDesktopLayout) => void;
}

interface DesktopLayoutOption {
  value: DashboardDesktopLayout;
  title: string;
  description: string;
  guidance: string;
  Icon: () => JSX.Element;
}

function SidebarLayoutIcon(): JSX.Element {
  return (
    <svg
      viewBox="0 0 80 52"
      className="gacha-splash__layout-option-icon h-20 w-full text-current"
      aria-hidden="true"
      focusable="false"
    >
      <rect x="2.5" y="3.5" width="75" height="45" rx="9" fill="none" stroke="currentColor" strokeWidth="2.5" />
      <rect x="8" y="9" width="19" height="34" rx="4" fill="currentColor" opacity="0.28" />
      <rect x="11" y="13" width="13" height="4" rx="2" fill="currentColor" opacity="0.65" />
      <rect x="11" y="21" width="13" height="4" rx="2" fill="currentColor" opacity="0.65" />
      <rect x="11" y="29" width="13" height="4" rx="2" fill="currentColor" opacity="0.65" />
      <rect x="31" y="9" width="41" height="34" rx="5" fill="currentColor" opacity="0.12" />
      <rect x="35" y="13" width="16" height="26" rx="3" fill="currentColor" opacity="0.46" />
      <rect x="55" y="13" width="13" height="11" rx="3" fill="currentColor" opacity="0.3" />
      <rect x="55" y="28" width="13" height="11" rx="3" fill="currentColor" opacity="0.3" />
    </svg>
  );
}

function FourColumnLayoutIcon(): JSX.Element {
  return (
    <svg
      viewBox="0 0 80 52"
      className="gacha-splash__layout-option-icon h-20 w-full text-current"
      aria-hidden="true"
      focusable="false"
    >
      <rect x="2.5" y="3.5" width="75" height="45" rx="9" fill="none" stroke="currentColor" strokeWidth="2.5" />
      <rect x="8" y="9" width="13" height="34" rx="3" fill="currentColor" opacity="0.2" />
      <rect x="8" y="12" width="13" height="4" rx="2" fill="currentColor" opacity="0.52" />
      <rect x="25" y="9" width="13" height="34" rx="3" fill="currentColor" opacity="0.22" />
      <rect x="25" y="12" width="13" height="4" rx="2" fill="currentColor" opacity="0.56" />
      <rect x="42" y="9" width="13" height="34" rx="3" fill="currentColor" opacity="0.24" />
      <rect x="42" y="12" width="13" height="4" rx="2" fill="currentColor" opacity="0.6" />
      <rect x="59" y="9" width="13" height="34" rx="3" fill="currentColor" opacity="0.26" />
      <rect x="59" y="12" width="13" height="4" rx="2" fill="currentColor" opacity="0.64" />
    </svg>
  );
}

const DESKTOP_LAYOUT_OPTIONS: readonly DesktopLayoutOption[] = [
  {
    value: 'sidebar',
    title: 'サイドバー表示',
    description: '左サイドのメニューから表示するカラムを切り替えます。',
    guidance: 'ノートPCの方はこちら',
    Icon: SidebarLayoutIcon
  },
  {
    value: 'grid',
    title: '４カラム表示',
    description: 'セクションを横並びにします。',
    guidance: 'モニター画面が広い方・デスクトップPCの方はこちら',
    Icon: FourColumnLayoutIcon
  }
] as const;

export function GachaSplashScreen({
  onRegisterGacha,
  onOpenPageSettings,
  showDesktopLayoutSelector = false,
  selectedDesktopLayout = 'grid',
  onSelectDesktopLayout
}: GachaSplashScreenProps): JSX.Element {
  return (
    <section className="gacha-splash relative isolate mx-auto flex w-full max-w-5xl flex-col items-center overflow-hidden rounded-3xl border border-border/70 bg-surface/80 px-6 py-16 text-center shadow-xl">
      <div className="pointer-events-none absolute -inset-x-20 -top-32 -z-20 h-64 rounded-full bg-accent/10 blur-3xl" aria-hidden="true" />
      <div className="pointer-events-none absolute -bottom-40 left-1/2 -z-20 h-72 w-72 -translate-x-1/2 rounded-full bg-surface-deep/30 blur-3xl" aria-hidden="true" />
      <div className="gacha-splash__intro max-w-2xl space-y-4">
        <h1 className="text-3xl font-bold tracking-tight text-surface-foreground sm:text-4xl">
          最初のガチャを作成
        </h1>
        <p className="text-base leading-relaxed text-muted-foreground">
          ようこそ四遊楽ガチャへ
          <br />
          このサイトは配信者のためのガチャツールです。設定・確率・景品・リアグ・すべて設定出来ます。Discordにログインすると、引いた景品を直接リスナーにお届け出来ます。まずはガチャを登録してください！
        </p>
      </div>
      {showDesktopLayoutSelector ? (
        <div className="gacha-splash__layout-selector mt-10 w-full max-w-3xl rounded-3xl border border-border/70 bg-panel/60 p-4 text-left sm:p-6">
          <div className="gacha-splash__layout-selector-header">
            <h2 className="gacha-splash__layout-selector-title text-lg font-semibold text-surface-foreground">
              PC表示レイアウト
            </h2>
            <p className="gacha-splash__layout-selector-description mt-1 text-sm text-muted-foreground">
              ガチャ画面で使う表示方式を先に選べます。あとからページ設定でも変更可能です。
            </p>
          </div>
          <div className="gacha-splash__layout-selector-grid mt-4 grid gap-3 sm:grid-cols-2">
            {DESKTOP_LAYOUT_OPTIONS.map((option) => {
              const isSelected = selectedDesktopLayout === option.value;
              const OptionIcon = option.Icon;
              return (
                <button
                  key={option.value}
                  type="button"
                  data-layout={option.value}
                  onClick={() => onSelectDesktopLayout?.(option.value)}
                  aria-pressed={isSelected}
                  className={clsx(
                    'gacha-splash__layout-option group flex h-full flex-col gap-2 rounded-2xl border p-4 text-left transition',
                    isSelected
                      ? 'border-accent bg-accent/10'
                      : 'border-border/60 bg-panel hover:border-accent/40 hover:bg-panel-contrast/90'
                  )}
                >
                  <div
                    className={clsx(
                      'gacha-splash__layout-option-preview rounded-xl border p-3',
                      isSelected
                        ? 'border-accent/35 bg-accent/5 text-accent'
                        : 'border-border/70 bg-panel-contrast/50 text-muted-foreground'
                    )}
                  >
                    <OptionIcon />
                  </div>
                  <span className="gacha-splash__layout-option-title text-sm font-semibold text-surface-foreground">
                    {option.title}
                  </span>
                  <span className="gacha-splash__layout-option-description text-xs leading-relaxed text-muted-foreground">
                    {option.description}
                  </span>
                  <span className="gacha-splash__layout-option-guidance mt-auto border-t border-accent/35 pt-2 text-[11px] font-semibold text-accent">
                    {option.guidance}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
      <div className="mt-12 flex w-full flex-col items-center gap-6">
        <button
          type="button"
          onClick={() => onRegisterGacha?.()}
          className="btn btn-primary w-full max-w-md rounded-3xl px-8 py-4 text-lg font-semibold shadow-xl transition hover:-translate-y-0.5 hover:shadow-2xl"
        >
          ガチャを登録
        </button>
        <div className="w-full max-w-md">
          <DiscordLoginButton
            placement="splash"
            onOpenPageSettings={onOpenPageSettings}
            className="w-full justify-center"
          />
        </div>
        <div className="gacha-splash__official-x-contact w-full max-w-2xl">
          <OfficialXAccountPanel />
        </div>
      </div>
    </section>
  );
}
