import type { PropsWithChildren } from 'react';
import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';

import { ModalProvider } from '../modals';
import { ToolbarStateProvider } from '../features/toolbar/ToolbarStateProvider';
import { AppPersistenceProvider } from '../features/storage/AppPersistenceProvider';
import { SiteThemeProvider } from '../features/theme/SiteThemeProvider';

export function AppProviders({ children }: PropsWithChildren): JSX.Element {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 1000 * 60,
            retry: 1,
            refetchOnWindowFocus: false
          }
        }
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
        >
        <AppPersistenceProvider>
          <SiteThemeProvider>
            <ModalProvider>
              <ToolbarStateProvider>{children}</ToolbarStateProvider>
            </ModalProvider>
          </SiteThemeProvider>
        </AppPersistenceProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
