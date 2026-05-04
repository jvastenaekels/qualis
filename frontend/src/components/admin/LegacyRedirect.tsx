/*
 * Qualis - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

import { useEffect } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useListStudiesApiAdminStudiesGet } from '@/api/generated';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuthStore } from '@/store/useAuthStore';
import { useAdminStore } from '@/store/useAdminStore';
import { resolveLegacyTarget } from './LegacyRedirect.helpers';

/**
 * LegacyRedirect
 *
 * Handles redirection from old /admin/* paths to the new /app/:projectSlug/* modular architecture.
 * This ensures that bookmarks and old links continue to work seamlessly.
 */
export const LegacyRedirect = () => {
    const location = useLocation();
    const { projects } = useAuthStore();
    const { setActiveStudy, setActiveProject, lastVisitedStudySlug } = useAdminStore();
    const { data: allStudiesData, isLoading } = useListStudiesApiAdminStudiesGet();
    const allStudies = allStudiesData?.items;

    const resolution = isLoading
        ? null
        : resolveLegacyTarget(location.pathname, projects, allStudies, lastVisitedStudySlug);

    useEffect(() => {
        if (!resolution) return;
        if (resolution.activeStudy !== undefined) setActiveStudy(resolution.activeStudy);
        if (resolution.activeProjectId !== undefined) setActiveProject(resolution.activeProjectId);
    }, [resolution, setActiveStudy, setActiveProject]);

    if (isLoading || !resolution) {
        return (
            <div className="flex h-screen w-full items-center justify-center p-8">
                <div className="w-full max-w-md space-y-4">
                    <Skeleton className="h-12 w-3/4 mx-auto rounded-xl" />
                    <Skeleton className="h-4 w-1/2 mx-auto rounded-lg" />
                    <Skeleton className="h-32 w-full rounded-2xl" />
                </div>
            </div>
        );
    }

    return <Navigate to={resolution.target} replace />;
};
