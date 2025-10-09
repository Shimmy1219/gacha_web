import { useState } from 'react';

import { DiscordLoginButton } from '../auth/DiscordLoginButton';
import { HeaderBrand } from './HeaderBrand';
import { MobileMenuButton } from './MobileMenuButton';
import { ResponsiveToolbarRail } from './ResponsiveToolbarRail';
import { ToolbarActions } from './ToolbarActions';
import { ToolbarFilters } from './ToolbarFilters';
import { ToolbarSummary } from './ToolbarSummary';

export function AppHeaderShell(): JSX.Element {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-30 border-b border-border/60 bg-surface/75 backdrop-blur shadow-header">
      <div className="mx-auto flex w-full max-w-6xl items-center gap-4 px-4 py-4">
        <HeaderBrand />
        <ToolbarSummary variant="desktop" />
        <ToolbarActions variant="desktop" />
        <div className="hidden lg:block">
          <DiscordLoginButton />
        </div>
        <MobileMenuButton open={open} onToggle={() => setOpen((prev) => !prev)} />
      </div>
      <div className="mx-auto hidden w-full max-w-6xl px-4 pb-4 lg:block">
        <ToolbarFilters />
      </div>
      <ResponsiveToolbarRail open={open} onClose={() => setOpen(false)}>
        <ToolbarSummary variant="mobile" />
        <ToolbarActions variant="mobile" />
        <div className="lg:hidden">
          <DiscordLoginButton />
        </div>
        <ToolbarFilters />
      </ResponsiveToolbarRail>
    </header>
  );
}
