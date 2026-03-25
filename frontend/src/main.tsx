import { ConnectionBanner } from '@/components/shared/connection-banner';
import { queryClient, QueryClientProvider } from '@/providers/api/query-client';
import { SocketProvider } from '@/providers/socket/socket-provider';
import { routeTree } from '@/route-tree.gen';
import { UiThemeProvider } from '@fli-dgtf/flow-ui';
import { createRouter, RouterProvider } from '@tanstack/react-router';
import { createRoot } from 'react-dom/client';
import { Toaster } from 'sonner';

import '@/index.css';

export const router = createRouter({
  routeTree,
  context: {
    queryClient,
  },
  defaultPreload: false,
  defaultPreloadStaleTime: 0,
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

createRoot(document.getElementById('root')!).render(
  <QueryClientProvider>
    <SocketProvider>
      <UiThemeProvider>
        <ConnectionBanner />
        <RouterProvider router={router} />
        <Toaster position='top-right' richColors />
      </UiThemeProvider>
    </SocketProvider>
  </QueryClientProvider>,
);
