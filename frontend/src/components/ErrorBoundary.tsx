/*
 * Qualis - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

import * as Sentry from '@sentry/react';
import type { ErrorInfo, ReactNode } from 'react';
import { Component } from 'react';

import ErrorPage from '../pages/ErrorPage';
import { recoverFromChunkError } from '../lib/chunkReload';

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

        // Deployment handling: a stale dynamic-import chunk (old build still
        // open when a new one deployed). Centralised recovery policy — when
        // it triggers a reload we bail here; when exhausted we fall through
        // to render the recoverable ErrorPage instead of looping.
        if (
            recoverFromChunkError(error, {
                storage: window.sessionStorage,
                now: Date.now(),
                reload: () => window.location.reload(),
            }) === 'reloading'
        ) {
            return;
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
