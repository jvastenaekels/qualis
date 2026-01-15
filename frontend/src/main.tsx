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
