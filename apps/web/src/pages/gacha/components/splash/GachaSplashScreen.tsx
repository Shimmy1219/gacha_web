import { clsx } from 'clsx';
import { SparklesIcon } from '@heroicons/react/24/outline';
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
      viewBox="0 0 64 48"
      className="gacha-splash__layout-option-icon h-20 w-full text-current"
      aria-hidden="true"
      focusable="false"
    >
      <rect x="3" y="4" width="58" height="40" rx="8" fill="none" stroke="currentColor" strokeWidth="2" />
      <rect x="8" y="9" width="14" height="30" rx="3" fill="currentColor" opacity="0.35" />
      <rect x="26" y="10" width="29" height="6" rx="3" fill="currentColor" opacity="0.3" />
      <rect x="26" y="20" width="24" height="5" rx="2.5" fill="currentColor" opacity="0.22" />
      <rect x="26" y="29" width="29" height="5" rx="2.5" fill="currentColor" opacity="0.22" />
    </svg>
  );
}

function GridLayoutIcon(): JSX.Element {
  return (
    <svg
      viewBox="0 0 64 48"
      className="gacha-splash__layout-option-icon h-20 w-full text-current"
      aria-hidden="true"
      focusable="false"
    >
      <rect x="3" y="4" width="58" height="40" rx="8" fill="none" stroke="currentColor" strokeWidth="2" />
      <rect x="8" y="10" width="22" height="12" rx="3" fill="currentColor" opacity="0.35" />
      <rect x="34" y="10" width="22" height="12" rx="3" fill="currentColor" opacity="0.28" />
      <rect x="8" y="26" width="22" height="12" rx="3" fill="currentColor" opacity="0.28" />
      <rect x="34" y="26" width="22" height="12" rx="3" fill="currentColor" opacity="0.35" />
    </svg>
  );
}

const DESKTOP_LAYOUT_OPTIONS: readonly DesktopLayoutOption[] = [
  {
    value: 'sidebar',
    title: 'サイドバー表示',
    description: '左側のメニューを使ってセクションを切り替える表示です。',
    guidance: 'ノートパソコンの方はこちら',
    Icon: SidebarLayoutIcon
  },
  {
    value: 'grid',
    title: 'カードグリッド表示',
    description: '主要セクションを横並びに表示して一覧性を高めます。',
    guidance: 'デスクトップ画面の方はこちら',
    Icon: GridLayoutIcon
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
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-accent/20 text-accent">
        <SparklesIcon className="h-8 w-8" />
      </div>
      <div className="mt-8 max-w-2xl space-y-4">
        <h1 className="text-3xl font-bold tracking-tight text-surface-foreground sm:text-4xl">
          最初のガチャを登録
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
                      ? 'border-accent bg-accent/10 text-accent'
                      : 'border-border/60 bg-panel hover:border-accent/40 hover:bg-panel-contrast/90'
                  )}
                >
                  <div className="gacha-splash__layout-option-preview rounded-xl border border-current/20 bg-black/5 p-3">
                    <OptionIcon />
                  </div>
                  <span className="gacha-splash__layout-option-title text-sm font-semibold text-surface-foreground">
                    {option.title}
                  </span>
                  <span className="gacha-splash__layout-option-description text-xs leading-relaxed text-muted-foreground">
                    {option.description}
                  </span>
                  <span className="gacha-splash__layout-option-guidance mt-auto border-t border-current/20 pt-2 text-[11px] font-semibold text-accent">
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
