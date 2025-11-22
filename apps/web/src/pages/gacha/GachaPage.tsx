import { DashboardShell } from './components/dashboard/DashboardShell';
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
  const { shouldShowSplash } = useGachaRegistrationState();

  if (shouldShowSplash) {
    return (
      <GachaSplashScreen
        onRegisterGacha={onRegisterGacha}
        onOpenPageSettings={onOpenPageSettings}
      />
    );
  }

  const sections = [
    {
      id: 'rarity',
      label: 'レアリティ',
      description: '排出率とカラーの管理',
      node: <RaritySection />
    },
    {
      id: 'items',
      label: 'アイテム',
      description: 'アイテム画像とリアグ同期',
      node: <ItemsSection />
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
      node: <RiaguSection />
    }
  ];

  return <DashboardShell sections={sections} onDrawGacha={onDrawGacha} />;
}
