import React, { Suspense, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import StudyLayout from './layouts/StudyLayout';
import WelcomePage from './pages/WelcomePage';
import PreSortPage from './pages/PreSortPage';
import RoughSortPage from './pages/RoughSortPage';
import PostSortPage from './pages/PostSortPage';
import ErrorPage from './pages/ErrorPage';
import LandingPage from './pages/LandingPage';
import ResetPage from './pages/ResetPage';

// Lazy load heavy interactive components
const FineSortPage = lazy(() => import('./pages/FineSortPage'));

const App = () => {
  return (
    <Router>
      <Suspense fallback={<div className="h-screen w-screen flex items-center justify-center bg-slate-50 text-slate-400 font-medium">Loading session...</div>}>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          
          <Route path="/study/:slug" element={<StudyLayout />}>
            <Route path="welcome" element={<WelcomePage />} />
            <Route path="presort" element={<PreSortPage />} />
            <Route path="rough-sort" element={<RoughSortPage />} />
            <Route path="sort" element={<FineSortPage />} /> 
            <Route path="post-sort" element={<PostSortPage />} />
            <Route path="reset" element={<ResetPage />} /> 

            <Route path="*" element={<ErrorPage />} />
          </Route>
        </Routes>
      </Suspense>
    </Router>
  );
};

export default App;
