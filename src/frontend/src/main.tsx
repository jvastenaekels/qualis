/*
 * Qualis - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './i18n';
import './index.css';
import { migrateLegacyStorage } from './utils/migrateLegacyStorage';
import { recoverFromChunkError } from './lib/chunkReload';

// Run the libre-q-* → qualis-* storage rename before any code touches the
// new namespace. Idempotent; no-op once the legacy keys are gone.
migrateLegacyStorage();

import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './lib/queryClient';

// Handle chunk loading failures (e.g., after deployments with new asset hashes)
// This prevents users from seeing broken pages due to stale cached HTML.
// Recovery policy is centralised in lib/chunkReload (single sessionStorage
// key + rolling window) so the global listeners, ErrorBoundary, and
// RouteErrorBoundary cannot race each other with divergent throttles.
const handleChunkError = (error: unknown) => {
    recoverFromChunkError(error, {
        storage: window.sessionStorage,
        now: Date.now(),
        reload: () => window.location.reload(),
    });
};

window.addEventListener('error', (event) => {
    handleChunkError(event.error ?? event.message);
});

window.addEventListener('unhandledrejection', (event) => {
    handleChunkError(event.reason);
});

const rootContainer = document.getElementById('root');
if (rootContainer) {
    ReactDOM.createRoot(rootContainer).render(
        <React.StrictMode>
            <QueryClientProvider client={queryClient}>
                <App />
                {/* <ReactQueryDevtools initialIsOpen={false} /> */}
            </QueryClientProvider>
        </React.StrictMode>
    );
}
