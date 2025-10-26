import type { ReactNode } from 'react';

import '../styles/marketing.css';

interface MarketingLayoutProps {
  title: string;
  description?: string;
  children: ReactNode;
}

export function MarketingLayout({
  title,
  description,
  children
}: MarketingLayoutProps): JSX.Element {
  return (
    <div className="marketing-layout min-h-screen bg-surface text-surface-foreground">
      <header className="marketing-layout__header">
        <div className="marketing-layout__branding">
          <span className="marketing-layout__title">四遊楽ツールズ</span>
          <span className="marketing-layout__subtitle">{title}</span>
        </div>
        <nav className="marketing-layout__nav">
          <a href="/home" className="marketing-layout__nav-link">
            ホーム
          </a>
          <a href="/gacha" className="marketing-layout__nav-link">
            ガチャツール
          </a>
          <a href="/receive" className="marketing-layout__nav-link">
            受け取り
          </a>
          <a href="/privacyPolicy" className="marketing-layout__nav-link">
            プライバシーポリシー
          </a>
        </nav>
      </header>
      <main className="marketing-layout__main">
        {description ? (
          <section className="marketing-layout__lead">
            <h1 className="marketing-layout__headline">{title}</h1>
            <p className="marketing-layout__description">{description}</p>
          </section>
        ) : (
          <h1 className="marketing-layout__headline">{title}</h1>
        )}
        <div className="marketing-layout__content">{children}</div>
      </main>
      <footer className="marketing-layout__footer">
        <small>© {new Date().getFullYear()} shimmy(しゅら)</small>
      </footer>
    </div>
  );
}
