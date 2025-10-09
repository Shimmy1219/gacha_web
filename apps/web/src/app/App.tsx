import { AppHeaderShell } from '../components/app-shell/AppHeaderShell';
import { AppRoutes } from './routes/AppRoutes';

export function App(): JSX.Element {
  return (
    <div className="min-h-screen bg-surface text-surface-foreground">
      <AppHeaderShell />
      <main className="mx-auto w-full max-w-6xl px-4 pb-16 pt-6">
        <AppRoutes />
      </main>
    </div>
  );
}
