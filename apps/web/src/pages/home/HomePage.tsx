import { Link } from 'react-router-dom';

export function HomePage(): JSX.Element {
  return (
    <main className="home-page mx-auto flex min-h-screen max-w-4xl flex-col items-center justify-center px-6 py-16 text-center">
      <span className="rounded-full border border-border px-3 py-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        四遊楽ガチャツール
      </span>
      <h1 className="mt-6 text-4xl font-bold leading-tight text-foreground sm:text-5xl">景品管理と受け渡しをもっと簡単に</h1>
      <p className="mt-6 max-w-2xl text-base text-muted-foreground sm:text-lg">
        ガチャ企画の設定から景品受け取り管理まで、四遊楽ガチャツールがサポートします。利用シーンにあわせて下記のページへお進みください。
      </p>
      <div className="mt-10 flex w-full flex-col items-center justify-center gap-4 sm:flex-row">
        <Link
          to="/gacha"
          className="inline-flex w-full items-center justify-center rounded-md bg-primary px-6 py-3 text-base font-semibold text-primary-foreground shadow-sm transition hover:bg-primary/90 sm:w-auto"
        >
          ガチャ管理ページへ
        </Link>
        <Link
          to="/receive"
          className="inline-flex w-full items-center justify-center rounded-md border border-input px-6 py-3 text-base font-semibold text-foreground transition hover:bg-muted sm:w-auto"
        >
          景品受け取りページへ
        </Link>
      </div>
    </main>
  );
}
