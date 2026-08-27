/*
 * Qualis - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

import { Outlet, useParams, Navigate } from 'react-router-dom';
import { useGetProjectApiAdminProjectsSlugGet } from '@/api/generated';
import { Skeleton } from '@/components/ui/skeleton';
import ErrorPage from '@/pages/ErrorPage';
import { ApiError } from '@/api/client';
import { useEffect } from 'react';
import { useAuthStore } from '@/store/useAuthStore';
import { useAdminStore } from '@/store/useAdminStore';

/**
 * ProjectLayout
 *
 * Fetches and validates project context based on URL slug.
 * Provides project data to all nested routes via context.
 */
export default function ProjectLayout() {
    const { projectSlug } = useParams<{ projectSlug: string }>();
    const { setCurrentProject } = useAuthStore();
    const { setActiveProject } = useAdminStore();

    const {
        data: project,
        isLoading,
        error,
    } = useGetProjectApiAdminProjectsSlugGet(projectSlug ?? '', {
        query: {
            enabled: !!projectSlug,
        },
    });

    // Sync store state when project is fetched
    useEffect(() => {
        if (project) {
            // biome-ignore lint/suspicious/noExplicitAny: casting for store compatibility
            setCurrentProject(project as any);
            setActiveProject(project.id);
        }
    }, [project, setCurrentProject, setActiveProject]);

    // Loading state
    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <Skeleton className="h-[600px] w-full max-w-5xl" />
            </div>
        );
    }

    // Error state - 403 means no access
    if (error) {
        const status = (error as { status?: number })?.status || 500;
        if (status === 403) {
            return <Navigate to="/hub" replace />;
        }
        return <ErrorPage error={new ApiError(status, 'Project not found or access denied')} />;
    }

    // No project found
    if (!project) {
        return <ErrorPage error={new ApiError(404, 'Project not found')} />;
    }

    // Render nested routes with project context
    return <Outlet context={{ project }} />;
}
