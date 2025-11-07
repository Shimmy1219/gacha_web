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
      <div className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-br from-accent/15 via-surface/40 to-transparent" />
      <div className="pointer-events-none absolute -inset-x-20 -top-32 -z-20 h-64 rounded-full bg-accent/10 blur-3xl" aria-hidden="true" />
      <div className="pointer-events-none absolute -bottom-40 left-1/2 -z-20 h-72 w-72 -translate-x-1/2 rounded-full bg-surface-deep/30 blur-3xl" aria-hidden="true" />
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-accent/20 text-accent">
        <SparklesIcon className="h-8 w-8" />
      </div>
      <div className="mt-8 max-w-2xl space-y-4">
        <h1 className="text-3xl font-bold tracking-tight text-surface-foreground sm:text-4xl">
          最初のガチャを登録してみましょう
        </h1>
        <p className="text-base leading-relaxed text-muted-foreground">
          まだガチャが登録されていません。ガチャの登録やDiscordログイン、サイトカラーの設定からスタートできます。
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
        <div className="flex w-full flex-col gap-3 sm:max-w-2xl sm:flex-row sm:items-stretch sm:justify-center">
          <div className="flex-1">
            <DiscordLoginButton
              placement="splash"
              onOpenPageSettings={onOpenPageSettings}
              className="w-full justify-center"
            />
          </div>
          <button
            type="button"
            onClick={() => onOpenPageSettings?.()}
            className="btn btn-muted flex-1 rounded-2xl px-6 py-3 text-base font-semibold shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
          >
            サイトカラーの設定
          </button>
        </div>
      </div>
    </section>
  );
}
