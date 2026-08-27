/*
 * Qualis - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

import * as Sentry from '@sentry/react';
import { useRouteError } from 'react-router-dom';
import ErrorPage from '../pages/ErrorPage';
import { ApiError } from '../api/client';
import { classifyRouteError, shouldCaptureRouteError } from './RouteErrorBoundary.helpers';
import { recoverFromChunkError } from '../lib/chunkReload';

/**
 * RouteErrorBoundary
 *
 * Captures errors thrown during React Router data loading or rendering
 * and displays them using the branded ErrorPage component.
 */
const RouteErrorBoundary = () => {
    const error = useRouteError();

    console.error('Route error caught:', error);

    // Forward to Sentry when a DSN is configured (no-op otherwise).
    if (shouldCaptureRouteError(error)) {
        if (error instanceof Error) {
            Sentry.captureException(error);
        } else if (!(error instanceof ApiError)) {
            Sentry.captureMessage(`Route error: ${String(error)}`, 'error');
        }
    }

    const classification = classifyRouteError(
        error,
        (key) => sessionStorage.getItem(key),
        Date.now()
    );

    if (classification.kind === 'route-response') {
        return <ErrorPage error={new ApiError(classification.status, classification.message)} />;
    }

    if (classification.kind === 'api-error') {
        return <ErrorPage error={classification.error} />;
    }

    if (classification.kind === 'chunk-reload') {
        // Centralised recovery: reloads up to the shared cap within a rolling
        // window, then renders the recoverable ErrorPage instead of leaving
        // the user on a silently-frozen page.
        const outcome = recoverFromChunkError(error, {
            storage: window.sessionStorage,
            now: Date.now(),
            reload: () => window.location.reload(),
        });
        if (outcome === 'reloading') return null;
        return <ErrorPage error={error as Error} />;
    }

    if (classification.kind === 'plain-error') {
        return <ErrorPage error={classification.error} />;
    }

    return (
        <ErrorPage
            title="Navigation Error"
            message="An unexpected error occurred during navigation."
        />
    );
};

export default RouteErrorBoundary;
