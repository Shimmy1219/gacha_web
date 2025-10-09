import { useCallback, useId, useState } from 'react';

import { DiscordLoginButton } from '../auth/DiscordLoginButton';
import { HeaderBrand } from './HeaderBrand';
import { MobileMenuButton } from './MobileMenuButton';
import { ResponsiveToolbarRail } from './ResponsiveToolbarRail';
import { ToolbarActions } from './ToolbarActions';
import { ToolbarFilters } from './ToolbarFilters';
import { ToolbarSummary } from './ToolbarSummary';

export interface AppHeaderShellProps {
  title: string;
  tagline?: string;
  summaryLabel: string;
  summaryVariant?: 'default' | 'warning' | 'success';
  summaryDescription?: string;
  onOpenRealtime?: () => void;
  onExportAll?: () => void;
  onImportAll?: (files: FileList) => void;
  importBusy?: boolean;
  onOpenPageSettings?: () => void;
}

export function AppHeaderShell({
  title,
  tagline,
  summaryLabel,
  summaryVariant = 'default',
  summaryDescription,
  onOpenRealtime,
  onExportAll,
  onImportAll,
  importBusy,
  onOpenPageSettings
}: AppHeaderShellProps): JSX.Element {
  const [open, setOpen] = useState(false);
  const drawerId = useId();
  const drawerTitleId = useId();

  const handleClose = useCallback(() => setOpen(false), []);

  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-[#05040a]/90 shadow-header">
      <div className="mx-auto flex w-full max-w-6xl items-center gap-4 px-4 py-4 sm:px-6 lg:grid lg:grid-cols-[auto,1fr,auto,auto] lg:items-center">
        <HeaderBrand title={title} tagline={tagline} />
        <ToolbarSummary
          mode="desktop"
          label={summaryLabel}
          variant={summaryVariant}
          description={summaryDescription}
          className="justify-self-end"
        />
        <ToolbarActions
          mode="desktop"
          onOpenRealtime={onOpenRealtime}
          onExportAll={onExportAll}
          onImportAll={onImportAll}
          importBusy={importBusy}
        />
        <div className="hidden lg:block">
          <DiscordLoginButton onOpenPageSettings={onOpenPageSettings} />
        </div>
        <MobileMenuButton
          open={open}
          onToggle={() => setOpen((prev) => !prev)}
          controlsId={drawerId}
        />
      </div>
      <div className="mx-auto hidden w-full max-w-6xl px-4 pb-5 sm:px-6 lg:block">
        <ToolbarFilters />
      </div>
      <ResponsiveToolbarRail
        open={open}
        onClose={handleClose}
        id={drawerId}
        labelledBy={drawerTitleId}
      >
        <div className="flex items-center justify-between">
          <h2 id={drawerTitleId} className="text-xs font-semibold uppercase tracking-[0.3em] text-muted-foreground">
            ツールバー
          </h2>
          <button
            type="button"
            onClick={handleClose}
            className="text-sm text-muted-foreground transition hover:text-surface-foreground"
          >
            閉じる
          </button>
        </div>
        <ToolbarSummary
          mode="mobile"
          label={summaryLabel}
          variant={summaryVariant}
          description={summaryDescription}
        />
        <ToolbarActions
          mode="mobile"
          onOpenRealtime={onOpenRealtime}
          onExportAll={onExportAll}
          onImportAll={onImportAll}
          importBusy={importBusy}
        />
        <div className="lg:hidden">
          <DiscordLoginButton onOpenPageSettings={onOpenPageSettings} />
        </div>
        <ToolbarFilters />
      </ResponsiveToolbarRail>
    </header>
  );
}
