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
