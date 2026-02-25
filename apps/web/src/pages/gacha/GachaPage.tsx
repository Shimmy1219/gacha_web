import { useCallback } from 'react';
import { type DashboardDesktopLayout } from '@domain/stores/uiPreferencesStore';
import { useStoreValue } from '@domain/stores';

import { useDomainStores } from '../../features/storage/AppPersistenceProvider';
import { DashboardShell } from './components/dashboard/DashboardShell';
import { useResponsiveDashboard } from './components/dashboard/useResponsiveDashboard';
import { ItemsSection } from './components/items/ItemsSection';
import { RaritySection } from './components/rarity/RaritySection';
import { RiaguSection } from './components/riagu/RiaguSection';
import { UsersSection } from './components/users/UsersSection';
import { GachaSplashScreen } from './components/splash/GachaSplashScreen';
import { useGachaRegistrationState } from './hooks/useGachaRegistrationState';

export interface GachaPageProps {
  onDrawGacha?: () => void;
  onRegisterGacha?: () => void;
  onOpenPageSettings?: () => void;
}

export function GachaPage({ onDrawGacha, onRegisterGacha, onOpenPageSettings }: GachaPageProps): JSX.Element {
  const { isMobile } = useResponsiveDashboard();
  const { uiPreferences: uiPreferencesStore } = useDomainStores();
  useStoreValue(uiPreferencesStore);
  const selectedDesktopLayout = uiPreferencesStore.getDashboardDesktopLayout();
  const handleSelectDesktopLayout = useCallback(
    (layout: DashboardDesktopLayout) => {
      uiPreferencesStore.setDashboardDesktopLayout(layout, { persist: 'immediate' });
    },
    [uiPreferencesStore]
  );
  const { shouldShowSplash } = useGachaRegistrationState();

  if (shouldShowSplash) {
    return (
      <GachaSplashScreen
        onRegisterGacha={onRegisterGacha}
        onOpenPageSettings={onOpenPageSettings}
        showDesktopLayoutSelector={!isMobile}
        selectedDesktopLayout={selectedDesktopLayout}
        onSelectDesktopLayout={handleSelectDesktopLayout}
      />
    );
  }

  const sections = [
    {
      id: 'rarity',
      label: 'レアリティ',
      description: '排出率とカラーの管理',
      node: <RaritySection onRegisterGacha={onRegisterGacha} />
    },
    {
      id: 'items',
      label: 'アイテム',
      description: 'アイテム画像とリアグ同期',
      node: <ItemsSection onRegisterGacha={onRegisterGacha} />
    },
    {
      id: 'users',
      label: 'ユーザー',
      description: '獲得内訳とフィルタ',
      node: <UsersSection />
    },
    {
      id: 'riagu',
      label: 'リアグ',
      description: 'リアルグッズ管理',
      node: <RiaguSection onRegisterGacha={onRegisterGacha} />
    }
  ];

  return <DashboardShell sections={sections} onDrawGacha={onDrawGacha} />;
}
