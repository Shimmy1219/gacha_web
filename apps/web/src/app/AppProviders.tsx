import type { PropsWithChildren } from 'react';
import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';

import { ModalProvider } from '../components/modal';
import { ToolbarStateProvider } from '../features/toolbar/ToolbarStateProvider';

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
      <BrowserRouter>
        <ModalProvider>
          <ToolbarStateProvider>{children}</ToolbarStateProvider>
        </ModalProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
