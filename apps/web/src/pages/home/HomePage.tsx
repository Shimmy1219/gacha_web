import { featuredTools, highlights, newsItems } from '../../content/home';
import { MarketingLayout } from '../../layouts/MarketingLayout';

export function HomePage(): JSX.Element {
  return (
    <MarketingLayout
      title="四遊楽の世界をアップデート"
      description="ガチャ配信を支え、コミュニティ運営を滑らかにするためのツール群を提供します。新しい実験のハブとしてホーム画面を活用してください。"
    >
      <section className="grid gap-6 lg:grid-cols-3">
        {highlights.map((highlight) => (
          <article
            key={highlight.title}
            className="rounded-3xl bg-panel/60 p-6 shadow-xl shadow-black/10 backdrop-blur"
          >
            <h2 className="text-xl font-semibold">{highlight.title}</h2>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              {highlight.detail}
            </p>
          </article>
        ))}
      </section>

      <section className="grid gap-4">
        <h2 className="text-lg font-semibold">ツールへのショートカット</h2>
        <div className="grid gap-4 md:grid-cols-2">
          {featuredTools.map((tool) => (
            <a
              key={tool.name}
              className="group flex flex-col gap-2 rounded-3xl border border-border/40 bg-panel/40 p-5 transition hover:border-accent"
              href={tool.href}
            >
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-semibold group-hover:text-accent-foreground">
                  {tool.name}
                </h3>
                {tool.badge ? (
                  <span className="rounded-full bg-accent/20 px-3 py-1 text-xs font-semibold text-accent-foreground">
                    {tool.badge}
                  </span>
                ) : null}
              </div>
              <p className="text-sm leading-relaxed text-muted-foreground">{tool.description}</p>
            </a>
          ))}
        </div>
      </section>

      <section className="grid gap-4">
        <h2 className="text-lg font-semibold">アップデート情報</h2>
        <div className="grid gap-3">
          {newsItems.map((item) => (
            <article
              key={item.title}
              className="rounded-3xl border border-border/40 bg-panel/20 p-4 backdrop-blur"
            >
              <time className="text-xs uppercase tracking-wide text-muted-foreground">
                {item.date}
              </time>
              <h3 className="mt-2 text-base font-semibold">{item.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{item.summary}</p>
            </article>
          ))}
        </div>
      </section>
    </MarketingLayout>
  );
}
