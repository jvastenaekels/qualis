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
            // Mutations must NOT auto-retry: a POST/PUT/DELETE that times out
            // may have already committed server-side, so a blind replay can
            // duplicate non-idempotent writes (recruitment links, project
            // creates, force-password-reset side effects). retry:0 is
            // react-query's intended default; hooks that genuinely need a retry
            // can opt in explicitly.
            retry: 0,
            networkMode: 'online', // Ensures mutations are queued when offline
        },
    },
});
