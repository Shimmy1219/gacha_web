import { SparklesIcon } from '@heroicons/react/24/outline';

import { DiscordLoginButton } from '../auth/DiscordLoginButton';

interface GachaSplashScreenProps {
  onRegisterGacha?: () => void;
  onOpenPageSettings?: () => void;
}

export function GachaSplashScreen({
  onRegisterGacha,
  onOpenPageSettings
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
      </div>
    </section>
  );
}
