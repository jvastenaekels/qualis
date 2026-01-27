/*
 * Open-Q - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

import { useRouteError, isRouteErrorResponse } from 'react-router-dom';
import ErrorPage from '../pages/ErrorPage';
import { ApiError } from '../api/client';

/**
 * RouteErrorBoundary
 *
 * Captures errors thrown during React Router data loading or rendering
 * and displays them using the branded ErrorPage component.
 */
const RouteErrorBoundary = () => {
    const error = useRouteError();

    console.error('Route error caught:', error);

    if (isRouteErrorResponse(error)) {
        return (
            <ErrorPage
                error={
                    new ApiError(
                        error.status,
                        error.statusText || error.data?.detail || 'Route error'
                    )
                }
            />
        );
    }

    if (error instanceof ApiError) {
        return <ErrorPage error={error} />;
    }

    if (error instanceof Error) {
        // Handle chunk load errors after new deployments
        if (
            error.message.includes('Failed to fetch dynamically imported module') ||
            error.message.includes('Importing a module script failed')
        ) {
            console.warn('Chunk load error detected in RouteErrorBoundary. Reloading...');
            const storageKey = 'chunk_load_error_reload';
            const lastReload = sessionStorage.getItem(storageKey);
            const now = Date.now();

            if (!lastReload || now - Number.parseInt(lastReload, 10) > 10000) {
                sessionStorage.setItem(storageKey, now.toString());
                window.location.reload();
                return null;
            }
        }
        return <ErrorPage error={error} />;
    }

    return (
        <ErrorPage
            title="Navigation Error"
            message="An unexpected error occurred during navigation."
        />
    );
};

export default RouteErrorBoundary;
