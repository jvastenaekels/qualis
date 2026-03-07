/*
 * Libre-Q - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

import { Outlet, useParams, Navigate } from 'react-router-dom';
import { useGetStudyApiAdminStudiesSlugGet } from '@/api/generated';
import { Skeleton } from '@/components/ui/skeleton';
import ErrorPage from '@/pages/ErrorPage';
import { ApiError } from '@/api/client';
import { useEffect } from 'react';
import { useAdminStore } from '@/store/useAdminStore';
import { useAdminContext } from '@/hooks/useAdminContext';

/**
 * StudyFocusLayout
 *
 * Nested layout inside ProjectLayout.
 * Fetches and validates study context, ensuring it belongs to the active project.
 */
export default function StudyFocusLayout() {
    const { studySlug } = useParams<{ studySlug: string }>();
    const { project } = useAdminContext();
    const { setActiveStudy } = useAdminStore();

    const {
        data: study,
        isLoading,
        error,
    } = useGetStudyApiAdminStudiesSlugGet(studySlug ?? '', {
        query: {
            enabled: !!studySlug,
        },
    });

    // Sync store state when study is fetched
    useEffect(() => {
        if (study) {
            setActiveStudy(study.slug);
        }
    }, [study, setActiveStudy]);

    // Loading state
    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <Skeleton className="h-[600px] w-full max-w-5xl" />
            </div>
        );
    }

    // Error state
    if (error) {
        const status = (error as { status?: number })?.status || 500;
        return <ErrorPage error={new ApiError(status, 'Study not found or access denied')} />;
    }

    // No study found
    if (!study) {
        return <ErrorPage error={new ApiError(404, 'Study not found')} />;
    }

    // Validate that the study belongs to the current project
    if (project && study.project_id !== project.id) {
        return <Navigate to={`/app/${project.slug}/dashboard`} replace />;
    }

    // Render nested routes with study context
    return <Outlet context={{ project, study }} />;
}
