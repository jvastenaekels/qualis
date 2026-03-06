/*
 * Libre-Q - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

/**
 * Root Application Component
 *
 * Sets up routing, global error handling, and lazy loading of pages.
 */

import { lazy } from 'react';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
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
import RoughSortPage from './pages/RoughSortPage';
import WelcomePage from './pages/WelcomePage';
import { Toaster } from 'sonner';
import GeneralSettingsPage from '@/pages/admin/GeneralSettingsPage'; // Added import
import RouteErrorBoundary from './components/RouteErrorBoundary';

// Lazy load heavy interactive components
const FineSortPage = lazy(() => import('./pages/FineSortPage'));
const RegistrationPage = lazy(() => import('./pages/RegistrationPage'));
import LoginPage from './pages/LoginPage';

// Admin imports
import RequireAdmin from './components/auth/RequireAdmin';
import AdminLayout from './layouts/AdminLayout';
import WorkspaceLayout from './layouts/WorkspaceLayout';
import StudyFocusLayout from './layouts/StudyFocusLayout';
const StudyOverviewPage = lazy(() => import('./pages/admin/StudyOverviewPage'));
const StudyDesignPage = lazy(() => import('./pages/admin/StudyDesignPage'));
const TeamManagementPage = lazy(() => import('./pages/admin/TeamManagementPage'));
const RecruitmentPage = lazy(() => import('./pages/admin/RecruitmentPage'));
const AnalysisPage = lazy(() => import('./pages/admin/AnalysisPage'));

// const DataExportsPage = lazy(() => import('./pages/admin/DataExportsPage'));
import DataExportsPage from './pages/admin/DataExportsPage';
const ParticipantDetailsPage = lazy(() => import('./pages/admin/ParticipantDetailsPage'));
const ProfilePage = lazy(() => import('./pages/admin/ProfilePage'));
const WorkspaceSettingsPage = lazy(() => import('./pages/admin/WorkspaceSettingsPage'));
const ConcourseListPage = lazy(() => import('./pages/admin/ConcourseListPage'));
const ConcourseDetailPage = lazy(() => import('./pages/admin/ConcourseDetailPage'));
const CreateWorkspacePage = lazy(() => import('./pages/admin/CreateWorkspacePage'));
const ResearcherHub = lazy(() => import('./pages/ResearcherHub'));
import { recruitmentPageLoader } from './pages/admin/RecruitmentPage.loader';

import { studyLayoutLoader } from './layouts/StudyLayout.loader';
import { studyOverviewPageLoader } from './pages/admin/StudyOverviewPage.loader';
import { teamManagementPageLoader } from './pages/admin/TeamManagementPage.loader';
import { dataExportsPageLoader } from './pages/admin/DataExportsPage.loader';
import { generalSettingsPageLoader } from './pages/admin/GeneralSettingsPage.loader';
import { workspaceSettingsPageLoader } from './pages/admin/WorkspaceSettingsPage.loader';
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
        element: <LandingPage />,
    },
    {
        path: '/login',
        element: <LoginPage />,
    },
    {
        path: '/register',
        element: <RegistrationPage />,
    },
    {
        path: '/hub',
        element: <RequireAdmin />,
        children: [
            {
                index: true,
                element: <ResearcherHub />,
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
    // New Workspace-First Architecture
    {
        path: '/app/:workspaceSlug',
        element: <RequireAdmin />,
        children: [
            {
                element: <WorkspaceLayout />,
                HydrateFallback: DesignerSkeleton,
                errorElement: <RouteErrorBoundary />,
                children: [
                    {
                        element: <AdminLayout />,
                        children: [
                            // Workspace-level routes
                            {
                                path: 'dashboard',
                                element: <AdminDashboard />,
                            },
                            {
                                path: 'team',
                                element: <TeamManagementPage />,
                                loader: teamManagementPageLoader,
                                HydrateFallback: DesignerSkeleton,
                            },
                            {
                                path: 'settings',
                                element: <WorkspaceSettingsPage />,
                                loader: workspaceSettingsPageLoader,
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
                                path: 'profile',
                                element: <ProfilePage />,
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
                        path: 'workspaces/new',
                        element: <CreateWorkspacePage />,
                    },
                ],
            },
        ],
    },
    // Resume route (outside StudyLayout to avoid consent guards and loader)
    {
        path: '/study/:slug/resume/:token',
        element: <ResumePage />,
    },
    // Reset route (outside StudyLayout to avoid submission guard redirect)
    {
        path: '/study/:slug/reset',
        element: <ResetPage />,
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
            { path: 'rough-sort', element: <RoughSortPage /> },
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
import { MotionConfig } from 'framer-motion';

const App = () => {
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
