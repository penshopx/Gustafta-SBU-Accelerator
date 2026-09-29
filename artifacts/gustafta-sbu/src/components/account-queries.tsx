import { useEffect, useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

export function createAccountQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: 1, staleTime: 25000 } },
  });
}

export function AccountQueries({ children }: { children: ReactNode }) {
  const [client] = useState(createAccountQueryClient);

  // A keyed instance is created for each signed-in identity (and for signed-out).
  // Cancel outstanding requests and remove private data when that instance leaves.
  useEffect(() => () => {
    client.clear();
  }, [client]);

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}