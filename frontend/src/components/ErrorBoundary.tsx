/*
 * Libre-Q - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

import * as Sentry from '@sentry/react';
import type { ErrorInfo, ReactNode } from 'react';
import { Component } from 'react';

import ErrorPage from '../pages/ErrorPage';

interface Props {
    children?: ReactNode;
    fallback?: ReactNode | ((error: Error) => ReactNode);
}

interface State {
    hasError: boolean;
    error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
    public override state: State = {
        hasError: false,
        error: null,
    };

    public static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    public override componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error('Uncaught error:', error, errorInfo);

        // Forward to Sentry when a DSN is configured (no-op otherwise).
        Sentry.captureException(error, { extra: { componentStack: errorInfo.componentStack } });

        // Auto-report to backend
        // We import dynamically or rely on the imported module if accessible to avoid cycles,
        // but here direct import is fine assuming no circular deps with components.
        import('../api/client').then(({ reportBug }) => {
            reportBug(error, { componentStack: errorInfo.componentStack });
        });

        // Deployment Handling: Failed to fetch dynamically imported module
        // This happens when a new version is deployed and old chunks are 404ing.
        // We force a hard reload to get the new index.html and assets.
        if (
            error.message.includes('Failed to fetch dynamically imported module') ||
            error.message.includes('Importing a module script failed')
        ) {
            console.warn('Chunk load error detected. Reloading...');
            // Prevent infinite loops if reload doesn't fix it (e.g. persistent network issue)
            const storageKey = 'chunk_load_error_reload';
            const lastReload = sessionStorage.getItem(storageKey);
            const now = Date.now();

            if (!lastReload || now - parseInt(lastReload, 10) > 10000) {
                sessionStorage.setItem(storageKey, now.toString());
                window.location.reload();
                return;
            }
        }
    }

    public override render() {
        if (this.state.hasError) {
            if (this.props.fallback) {
                if (typeof this.props.fallback === 'function') {
                    // We can't easily pass resetErrorBoundary here unless we lift state or use the key trick from parent.
                    // But we can pass the error.
                    return this.props.fallback(this.state.error || new Error('Unknown error'));
                }
                return this.props.fallback;
            }
            return <ErrorPage error={this.state.error} />;
        }

        return this.props.children;
    }
}

export default ErrorBoundary;
