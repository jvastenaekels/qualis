/*
 * Open-Q - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './i18n';
import './index.css';

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
