'use client';

import React, { useState } from 'react';
import { Provider as ReduxProvider } from 'react-redux';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { store } from '@/store/store';
import { AuthProvider } from '@/context/AuthContext';
import { StoreProvider } from '@/context/StoreContext';
import { StaffAuthProvider } from '@/context/StaffAuthContext';

export const AppProviders = ({ children }: { children: React.ReactNode }) => {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        refetchOnWindowFocus: true,
        refetchOnReconnect: true,
        retry: 1,
        staleTime: 10_000,
      },
    },
  }));

  return (
    <ReduxProvider store={store}>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <StaffAuthProvider>
            <StoreProvider>
              {children}
            </StoreProvider>
          </StaffAuthProvider>
        </AuthProvider>
      </QueryClientProvider>
    </ReduxProvider>
  );
};
