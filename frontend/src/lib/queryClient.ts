import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            retry: 3,
            retryDelay: (attemptIndex: number) => Math.min(1000 * 2 ** attemptIndex, 30000),
            staleTime: 5 * 60 * 1000,
            refetchOnWindowFocus: false,
        },
        mutations: {
            retry: 3,
            retryDelay: (attemptIndex: number) => Math.min(1000 * 2 ** attemptIndex, 30000),
            networkMode: 'online', // Ensures mutations are queued when offline
        },
    },
});
