/*
 * Open-Q - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

/**
 * Root Application Component
 *
 * Sets up routing, global error handling, and lazy loading of pages.
 */

import { lazy, Suspense } from 'react';
import { Route, BrowserRouter as Router, Routes, Navigate } from 'react-router-dom';
import { ApiError } from './api/client';
import ErrorBoundary from './components/ErrorBoundary';
import { useAdminStore } from './store/useAdminStore';
import StudyLayout from './layouts/StudyLayout';
import ConsentPage from './pages/ConsentPage';
import ErrorPage from './pages/ErrorPage';
import LandingPage from './pages/LandingPage';
import PostSortPage from './pages/PostSortPage';
import PreSortPage from './pages/PreSortPage';
import ResetPage from './pages/ResetPage';
import RoughSortPage from './pages/RoughSortPage';
import WelcomePage from './pages/WelcomePage';
import { Toaster } from 'sonner';

// Lazy load heavy interactive components
const FineSortPage = lazy(() => import('./pages/FineSortPage'));
const RegistrationPage = lazy(() => import('./pages/RegistrationPage'));
const LoginPage = lazy(() => import('./pages/LoginPage'));

// Admin imports
import RequireAdmin from './components/auth/RequireAdmin';
const AdminLayout = lazy(() => import('./layouts/AdminLayout'));
const StudyOverviewPage = lazy(() => import('./pages/admin/StudyOverviewPage'));
const StudyDesignPage = lazy(() => import('./pages/admin/StudyDesignPage'));
const TeamManagementPage = lazy(() => import('./pages/admin/TeamManagementPage'));

const AdminIndex = () => {
    const { activeStudyId } = useAdminStore();

    if (activeStudyId) {
        return <Navigate to={`/admin/studies/${activeStudyId}`} replace />;
    }
    return <div className="p-8 text-muted-foreground">Please select a study from the sidebar.</div>;
};

const App = () => {
    return (
        <Router>
            <ErrorBoundary>
                <Suspense
                    fallback={
                        <div className="h-screen w-screen flex items-center justify-center bg-slate-50 text-slate-400 font-medium">
                            Loading session...
                        </div>
                    }
                >
                    <Routes>
                        <Route path="/" element={<LandingPage />} />
                        <Route path="/login" element={<LoginPage />} />
                        <Route path="/register" element={<RegistrationPage />} />

                        {/* Admin Routes */}
                        <Route path="/admin" element={<RequireAdmin />}>
                            <Route element={<AdminLayout />}>
                                <Route index element={<AdminIndex />} />
                                <Route path="studies/:slug" element={<StudyOverviewPage />} />
                                <Route path="studies/:slug/design" element={<StudyDesignPage />} />
                                <Route path="studies/:slug/team" element={<TeamManagementPage />} />
                            </Route>
                        </Route>

                        {/* Study Routes */}
                        <Route path="/study/:slug" element={<StudyLayout />}>
                            <Route path="welcome" element={<WelcomePage />} />
                            <Route path="consent" element={<ConsentPage />} />
                            <Route path="presort" element={<PreSortPage />} />
                            <Route path="rough-sort" element={<RoughSortPage />} />
                            <Route path="fine-sort" element={<FineSortPage />} />
                            <Route path="post-sort" element={<PostSortPage />} />
                            <Route path="reset" element={<ResetPage />} />

                            <Route
                                path="*"
                                element={<ErrorPage error={new ApiError(404, 'Page not found')} />}
                            />
                        </Route>
                    </Routes>
                </Suspense>
            </ErrorBoundary>
            <Toaster richColors position="top-center" closeButton />
        </Router>
    );
};

export default App;
