import { Navigate, useRoutes } from 'react-router-dom';

import { ControlsPanel } from '../../components/dashboard/ControlsPanel';
import { DashboardShell } from '../../components/dashboard/DashboardShell';
import { ItemsSection } from '../../features/items/components/ItemsSection';
import { RaritySection } from '../../features/rarity/components/RaritySection';
import { RiaguSection } from '../../features/riagu/components/RiaguSection';
import { UsersSection } from '../../features/users/components/UsersSection';

function DashboardPage(): JSX.Element {
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

  return <DashboardShell controlsSlot={<ControlsPanel />} sections={sections} />;
}

export function AppRoutes(): JSX.Element | null {
  return useRoutes([
    { path: '/', element: <DashboardPage /> },
    { path: '*', element: <Navigate to="/" replace /> }
  ]);
}
