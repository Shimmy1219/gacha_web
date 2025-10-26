import { ClaimSteps } from './components/ClaimSteps';

const steps = [
  {
    title: '受け取りフォームから申請',
    detail:
      'ライブ終了後に共有される受け取りフォームへアクセスし、必要事項と配送先を入力してください。フォームは配信ごとに専用URLを発行します。'
  },
  {
    title: '運営側で内容を確認',
    detail:
      'shimmy(しゅら)が入力内容を確認し、登録済みのリアグ在庫と照合します。不備があればX(旧Twitter)のDMで個別にご連絡します。'
  },
  {
    title: '発送完了を通知',
    detail:
      '発送準備が整い次第、追跡番号と合わせてDMでご案内します。デジタルコードの場合はメールまたはDMで直接お送りします。'
  }
];

export function ReceivePage(): JSX.Element {
  return (
    <div className="receive-page min-h-screen bg-gradient-to-b from-[#0f172a] via-[#1e1b4b] to-[#111827] text-surface-foreground">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-10 px-6 py-16">
        <header className="space-y-4 text-center">
          <p className="text-sm uppercase tracking-[0.4em] text-accent-foreground/80">Receive Station</p>
          <h1 className="text-4xl font-bold tracking-tight md:text-5xl">
            景品の受け取りはこちらから
          </h1>
          <p className="mx-auto max-w-2xl text-sm leading-relaxed text-muted-foreground">
            四遊楽ガチャで当選したリアルグッズやコードを受け取るための専用ページです。
            フォームの案内や発送状況の更新は、配信内または公式Xからお知らせします。
          </p>
        </header>

        <section className="grid gap-8 rounded-3xl border border-accent/20 bg-panel/10 p-8 backdrop-blur">
          <div className="rounded-2xl border border-accent/30 bg-overlay/20 p-6 text-left">
            <h2 className="text-xl font-semibold text-accent-foreground">受け取りフォーム</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              次回配信時にフォームURLを案内します。受け取り期限や入力締切がある場合は配信内で告知するのでご注意ください。
            </p>
            <a
              href="https://forms.gle/"
              className="mt-6 inline-flex w-full items-center justify-center rounded-full bg-accent px-6 py-3 font-semibold text-accent-foreground transition hover:bg-accent-dark"
            >
              フォーム公開待ち
            </a>
          </div>

          <div className="space-y-6">
            <h2 className="text-xl font-semibold text-accent-foreground">受け取りまでの流れ</h2>
            <ClaimSteps steps={steps} />
          </div>
        </section>

        <section className="grid gap-4 rounded-3xl border border-border/40 bg-panel/20 p-6 text-left">
          <h2 className="text-lg font-semibold">お問い合わせ</h2>
          <p className="text-sm leading-relaxed text-muted-foreground">
            受け取りに関するご質問は、公式X(旧Twitter)
            <a
              href="https://twitter.com/shimmy364"
              className="ml-1 font-semibold text-accent-foreground underline underline-offset-4"
            >
              @shimmy364
            </a>
            までDMでご連絡ください。
          </p>
          <p className="text-xs text-muted-foreground">
            ※ 受け取り状況の確認には時間をいただく場合があります。1週間以上返信がない場合は再度ご連絡ください。
          </p>
        </section>
      </div>
    </div>
  );
}
