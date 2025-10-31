import { clsx } from 'clsx';

import { ItemsSection } from './components/items/ItemsSection';
import { RaritySection } from './components/rarity/RaritySection';
import { RiaguSection } from './components/riagu/RiaguSection';
import { UsersSection } from './components/users/UsersSection';
import { useResponsiveDashboard } from './components/dashboard/useResponsiveDashboard';

export interface GachaPageProps {
  onDrawGacha?: () => void;
}

export function GachaPage({ onDrawGacha: _onDrawGacha }: GachaPageProps): JSX.Element {
  const { isMobile } = useResponsiveDashboard();

  return (
    <div className="gacha-page space-y-6 pb-12">
      <div
        className={clsx(
          'gacha-page__sections grid gap-6',
          isMobile ? 'grid-cols-1' : 'lg:grid-cols-2 xl:grid-cols-3'
        )}
      >
        <div className="min-h-0">
          <RaritySection />
        </div>
        <div className="min-h-0">
          <ItemsSection />
        </div>
        <div className="min-h-0">
          <UsersSection />
        </div>
        <div className="min-h-0">
          <RiaguSection />
        </div>
      </div>
    </div>
  );
}
