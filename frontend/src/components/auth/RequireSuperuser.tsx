/*
 * Qualis - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

/**
 * Route guard: renders children only for authenticated superusers.
 *
 * - Loading → skeleton (no flash of restricted content).
 * - Not authenticated → redirect to /login (with ?redirect=…).
 * - Authenticated but not superuser → redirect to /app (admin home).
 * - Superuser → <Outlet />.
 */

import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Skeleton } from '@/components/ui/skeleton';

const RequireSuperuser = () => {
    const { isLoading, isAuthenticated, isSuperuser } = useAuth();
    const location = useLocation();

    if (isLoading) {
        return (
            <div className="flex flex-col space-y-3 p-8">
                <Skeleton className="h-[125px] w-full rounded-xl" />
                <div className="space-y-2">
                    <Skeleton className="h-4 w-[250px]" />
                    <Skeleton className="h-4 w-[200px]" />
                </div>
            </div>
        );
    }

    if (!isAuthenticated) {
        return <Navigate to={`/login?redirect=${location.pathname}`} replace />;
    }

    if (!isSuperuser) {
        return <Navigate to="/app" replace />;
    }

    return <Outlet />;
};

export default RequireSuperuser;
