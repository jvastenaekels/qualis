/*
 * Qualis - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

/**
 * Root Application Component
 *
 * Sets up routing, global error handling, and lazy loading of pages.
 */

import { lazy } from 'react';
import { createBrowserRouter, Navigate, RouterProvider } from 'react-router-dom';
import { ApiError } from './api/client';
import ErrorBoundary from './components/ErrorBoundary';

import StudyLayout from './layouts/StudyLayout';
import ConsentPage from './pages/ConsentPage';
import ErrorPage from './pages/ErrorPage';
import LandingPage from './pages/LandingPage';
import PostSortPage from './pages/PostSortPage';
import PreSortPage from './pages/PreSortPage';
import ResetPage from './pages/ResetPage';
import ResumePage from './pages/ResumePage';
import WelcomePage from './pages/WelcomePage';
import { RoughSortGuard } from './components/participant/RoughSortGuard';
import { Toaster } from 'sonner';
import RouteErrorBoundary from './components/RouteErrorBoundary';

// Lazy load heavy interactive components
const FineSortPage = lazy(() => import('./pages/FineSortPage'));
const RegistrationPage = lazy(() => import('./pages/RegistrationPage'));
const EmailVerifyPage = lazy(() => import('./pages/EmailVerifyPage'));
const EmailVerificationSentPage = lazy(() => import('./pages/EmailVerificationSentPage'));
const PasswordResetRequestPage = lazy(() => import('./pages/PasswordResetRequestPage'));
const PasswordResetConfirmPage = lazy(() => import('./pages/PasswordResetConfirmPage'));
const TwoFactorRecoveryPage = lazy(() => import('./pages/TwoFactorRecoveryPage'));
const TwoFactorDisablePage = lazy(() => import('./pages/TwoFactorDisablePage'));
import LoginPage from './pages/LoginPage';

// Admin imports
import RequireAdmin from './components/auth/RequireAdmin';
import RequireSuperuser from './components/auth/RequireSuperuser';
import AdminLayout from './layouts/AdminLayout';
import ProjectLayout from './layouts/ProjectLayout';
import StudyFocusLayout from './layouts/StudyFocusLayout';
import { PublicPageLayout } from './layouts/PublicPageLayout';
const StudyOverviewPage = lazy(() => import('./pages/admin/StudyOverviewPage'));
const StudyDesignPage = lazy(() => import('./pages/admin/StudyDesignPage'));
const RecruitmentPage = lazy(() => import('./pages/admin/RecruitmentPage'));
const AnalysisPage = lazy(() => import('./pages/admin/AnalysisPage'));

const DataExportsPage = lazy(() => import('./pages/admin/DataExportsPage'));
const DataPrivacyPage = lazy(() => import('./pages/admin/DataPrivacyPage'));
const GeneralSettingsPage = lazy(() => import('./pages/admin/GeneralSettingsPage'));
const ParticipantDetailsPage = lazy(() => import('./pages/admin/ParticipantDetailsPage'));
const AccountSettingsPage = lazy(() => import('./pages/admin/AccountSettingsPage'));
const ProjectSettingsPage = lazy(() => import('./pages/admin/ProjectSettingsPage'));
const ProjectMembersPage = lazy(() => import('./pages/admin/ProjectMembersPage'));
const ConcourseListPage = lazy(() => import('./pages/admin/ConcourseListPage'));
const ConcourseDetailPage = lazy(() => import('./pages/admin/ConcourseDetailPage'));
const CreateProjectPage = lazy(() => import('./pages/admin/CreateProjectPage'));
const AdminUsersPage = lazy(() => import('./pages/admin/AdminUsersPage'));
const ResearcherHub = lazy(() => import('./pages/ResearcherHub'));
import { recruitmentPageLoader } from './pages/admin/RecruitmentPage.loader';

import { studyLayoutLoader } from './layouts/StudyLayout.loader';
import { studyOverviewPageLoader } from './pages/admin/StudyOverviewPage.loader';
import { dataExportsPageLoader } from './pages/admin/DataExportsPage.loader';
import { generalSettingsPageLoader } from './pages/admin/GeneralSettingsPage.loader';
import { projectSettingsPageLoader } from './pages/admin/ProjectSettingsPage.loader';
import { LegacyRedirect } from './components/admin/LegacyRedirect';

// Lazy load Admin Dashboard to prevent heavy libs leak
const AdminDashboard = lazy(() =>
    import('@/components/admin/AdminDashboard').then((module) => ({
        default: module.AdminDashboard,
    }))
);
import { DesignerSkeleton } from '@/components/admin/DashboardSkeleton';

const router = createBrowserRouter([
    {
        path: '/',
        element: (
            <PublicPageLayout>
                <LandingPage />
            </PublicPageLayout>
        ),
    },
    {
        path: '/login',
        element: (
            <PublicPageLayout>
                <LoginPage />
            </PublicPageLayout>
        ),
    },
    {
        path: '/register',
        element: (
            <PublicPageLayout>
                <RegistrationPage />
            </PublicPageLayout>
        ),
    },
    {
        path: '/verify-email',
        element: (
            <PublicPageLayout>
                <EmailVerifyPage />
            </PublicPageLayout>
        ),
    },
    {
        path: '/verify-email-sent',
        element: (
            <PublicPageLayout>
                <EmailVerificationSentPage />
            </PublicPageLayout>
        ),
    },
    {
        path: '/forgot-password',
        element: (
            <PublicPageLayout>
                <PasswordResetRequestPage />
            </PublicPageLayout>
        ),
    },
    {
        path: '/reset-password',
        element: (
            <PublicPageLayout>
                <PasswordResetConfirmPage />
            </PublicPageLayout>
        ),
    },
    {
        path: '/2fa/recover',
        element: (
            <PublicPageLayout>
                <TwoFactorRecoveryPage />
            </PublicPageLayout>
        ),
    },
    {
        path: '/2fa/disable',
        element: (
            <PublicPageLayout>
                <TwoFactorDisablePage />
            </PublicPageLayout>
        ),
    },
    {
        path: '/hub',
        element: <RequireAdmin />,
        children: [
            {
                index: true,
                element: (
                    <PublicPageLayout>
                        <ResearcherHub />
                    </PublicPageLayout>
                ),
            },
        ],
    },
    {
        path: '/admin',
        element: <RequireAdmin />,
        children: [
            {
                index: true,
                element: <LegacyRedirect />,
            },
            {
                path: '*',
                element: <LegacyRedirect />,
            },
        ],
    },
    // New Project-First Architecture
    {
        path: '/app/:projectSlug',
        element: <RequireAdmin />,
        children: [
            {
                element: <ProjectLayout />,
                HydrateFallback: DesignerSkeleton,
                errorElement: <RouteErrorBoundary />,
                children: [
                    {
                        element: <AdminLayout />,
                        children: [
                            // Project-level routes
                            {
                                path: 'dashboard',
                                element: <AdminDashboard />,
                            },
                            {
                                path: 'settings',
                                element: <ProjectSettingsPage />,
                                loader: projectSettingsPageLoader,
                                HydrateFallback: DesignerSkeleton,
                            },
                            {
                                path: 'members',
                                element: <ProjectMembersPage />,
                                loader: projectSettingsPageLoader,
                                HydrateFallback: DesignerSkeleton,
                            },
                            {
                                path: 'concourses',
                                element: <ConcourseListPage />,
                            },
                            {
                                path: 'concourses/:concourseId',
                                element: <ConcourseDetailPage />,
                            },
                            {
                                path: 'account',
                                element: <AccountSettingsPage />,
                            },
                        ],
                    },
                    // Study-level routes (Focus Mode)
                    {
                        path: 'studies/:studySlug',
                        element: <StudyFocusLayout />,
                        HydrateFallback: DesignerSkeleton,
                        children: [
                            {
                                element: <AdminLayout />,
                                children: [
                                    {
                                        index: true,
                                        element: <StudyOverviewPage />,
                                        loader: studyOverviewPageLoader,
                                        HydrateFallback: DesignerSkeleton,
                                    },
                                    {
                                        path: 'design',
                                        element: <StudyDesignPage />,
                                    },
                                    {
                                        path: 'recruitment',
                                        element: <RecruitmentPage />,
                                        loader: recruitmentPageLoader,
                                        HydrateFallback: DesignerSkeleton,
                                    },
                                    {
                                        path: 'data',
                                        element: <DataExportsPage />,
                                        loader: dataExportsPageLoader,
                                        HydrateFallback: DesignerSkeleton,
                                    },
                                    {
                                        path: 'privacy',
                                        element: <DataPrivacyPage />,
                                        HydrateFallback: DesignerSkeleton,
                                    },
                                    {
                                        path: 'analysis',
                                        element: <AnalysisPage />,
                                        HydrateFallback: DesignerSkeleton,
                                    },
                                    {
                                        path: 'settings',
                                        element: <GeneralSettingsPage />,
                                        loader: generalSettingsPageLoader,
                                        HydrateFallback: DesignerSkeleton,
                                    },
                                    {
                                        path: 'participants/:participantId',
                                        element: <ParticipantDetailsPage />,
                                    },
                                ],
                            },
                        ],
                    },
                ],
            },
        ],
    },
    // Global actions in App scope
    {
        path: '/app',
        element: <RequireAdmin />,
        errorElement: <RouteErrorBoundary />,
        children: [
            {
                element: <AdminLayout />,
                children: [
                    {
                        path: 'projects/new',
                        element: <CreateProjectPage />,
                    },
                    {
                        path: 'workspaces/new',
                        element: <Navigate to="../projects/new" replace />,
                    },
                ],
            },
            // Superuser-only platform routes
            {
                element: <RequireSuperuser />,
                children: [
                    {
                        element: <AdminLayout />,
                        children: [
                            {
                                path: 'users',
                                element: <AdminUsersPage />,
                            },
                        ],
                    },
                ],
            },
        ],
    },
    // Resume route (outside StudyLayout to avoid consent guards and loader)
    {
        path: '/study/:slug/resume/:token',
        element: (
            <PublicPageLayout>
                <ResumePage />
            </PublicPageLayout>
        ),
    },
    // Reset route (outside StudyLayout to avoid submission guard redirect)
    {
        path: '/study/:slug/reset',
        element: (
            <PublicPageLayout>
                <ResetPage />
            </PublicPageLayout>
        ),
    },
    // Participant routes
    {
        path: '/study/:slug',
        element: <StudyLayout />,
        loader: studyLayoutLoader,
        HydrateFallback: DesignerSkeleton,
        errorElement: <RouteErrorBoundary />,
        children: [
            { path: 'welcome', element: <WelcomePage /> },
            { path: 'consent', element: <ConsentPage /> },
            { path: 'presort', element: <PreSortPage /> },
            { path: 'rough-sort', element: <RoughSortGuard /> },
            { path: 'fine-sort', element: <FineSortPage /> },
            { path: 'post-sort', element: <PostSortPage /> },
            {
                path: '*',
                element: <ErrorPage error={new ApiError(404, 'Page not found')} />,
            },
        ],
    },
]);

import { ViewportProvider } from '@/contexts/ViewportContext';
import { usePlatformConfigBootstrap } from '@/hooks/usePlatformConfigBootstrap';
import { MotionConfig } from 'framer-motion';

const App = () => {
    usePlatformConfigBootstrap();

    return (
        <ErrorBoundary>
            <ViewportProvider>
                <MotionConfig reducedMotion="user">
                    <RouterProvider router={router} />
                </MotionConfig>
            </ViewportProvider>
            <Toaster
                richColors
                position="top-center"
                closeButton
                toastOptions={{
                    style: {
                        fontFamily: '"Google Sans Flex", "Google Sans Flex Local", sans-serif',
                        fontSize: '0.9375rem',
                    },
                }}
            />
        </ErrorBoundary>
    );
};

export default App;
