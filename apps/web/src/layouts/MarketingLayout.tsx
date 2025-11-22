import { type ReactNode } from 'react';

export interface MarketingLayoutProps {
  children: ReactNode;
}

export function MarketingLayout({ children }: MarketingLayoutProps): JSX.Element {
  return <div className="marketing-layout min-h-screen bg-surface text-surface-foreground">{children}</div>;
}
