/*
 * Qualis - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

import * as Sentry from '@sentry/react';
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './i18n';
import './index.css';

// ---------------------------------------------------------------------------
// Sentry — initialised here (before React render) so the SDK captures errors
// from the very first render cycle. No-op when VITE_SENTRY_DSN is not set,
// so the dev experience (and the bundle for users without a DSN) is unchanged.
// sendDefaultPii is false: GDPR — participant IPs / emails are never forwarded.
// ---------------------------------------------------------------------------
const _sentryDsn = import.meta.env.VITE_SENTRY_DSN;
if (_sentryDsn) {
    Sentry.init({
        dsn: _sentryDsn,
        environment: import.meta.env.VITE_ENVIRONMENT ?? import.meta.env.MODE,
        // Zero performance overhead by default; operators can opt in via Sentry project settings.
        tracesSampleRate: 0,
        // GDPR: do not forward participant emails / IPs to Sentry.
        sendDefaultPii: false,
    });
    console.info(
        `[Sentry] Initialised (env=${import.meta.env.VITE_ENVIRONMENT ?? import.meta.env.MODE})`
    );
}

import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './lib/queryClient';

// Handle chunk loading failures (e.g., after deployments with new asset hashes)
// This prevents users from seeing broken pages due to stale cached HTML
const handleChunkError = (error: string | Error | undefined) => {
    const errorMessage = typeof error === 'string' ? error : error?.message || '';
    if (
        errorMessage.includes('Failed to fetch dynamically imported module') ||
        errorMessage.includes('Importing a module script failed') ||
        errorMessage.includes('loading chunk') ||
        errorMessage.includes('NetworkError when attempting to fetch resource')
    ) {
        console.warn('Chunk loading failed, reloading page to fetch latest version...');
        // Store that we tried to reload to prevent infinite loops
        const reloadAttempted = sessionStorage.getItem('chunk-reload-attempted');
        if (!reloadAttempted) {
            sessionStorage.setItem('chunk-reload-attempted', 'true');
            window.location.reload();
        } else {
            // If reload already attempted, clear the flag and show error
            sessionStorage.removeItem('chunk-reload-attempted');
            console.error('Failed to load after reload, this may be a network issue');
        }
    }
};

window.addEventListener('error', (event) => {
    handleChunkError(event.message || event.error);
});

window.addEventListener('unhandledrejection', (event) => {
    handleChunkError(event.reason);
});

// Clear reload flag on successful load
window.addEventListener('load', () => {
    sessionStorage.removeItem('chunk-reload-attempted');
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
