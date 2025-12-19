/*
 * Open-Q - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useStudyStore } from '../store/useStudyStore';
import { RefreshCcw, AlertTriangle, Home } from 'lucide-react';

const ErrorPage: React.FC = () => {
  // const error: any = useRouteError(); // Not available in BrowserRouter
  const navigate = useNavigate();
  const { resetSession } = useStudyStore();

  const handleReset = () => {
    resetSession();
    // Also clear localStorage manually to be safe if persist fails
    localStorage.removeItem('q-method-storage');
    window.location.href = '/'; // Hard reload to clear any memory state
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center space-y-6">
        <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto text-red-600">
          <AlertTriangle size={40} />
        </div>
        
        <h1 className="text-2xl font-bold text-gray-900">Oops! Something went wrong.</h1>
        <p className="text-gray-600">
          An unexpected error occurred.
        </p>

        <div className="bg-blue-50 p-4 rounded-lg text-sm text-blue-800 text-left">
           <strong>Tip:</strong> If you're stuck, try resetting your session. This will restart the study.
        </div>

        <div className="flex flex-col gap-3">
            <button
            onClick={handleReset}
            className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-red-600 text-white font-semibold rounded-lg hover:bg-red-700 transition-colors"
            >
            <RefreshCcw size={20} />
            Reset Session
            </button>
            <button
            onClick={() => navigate('/')}
            className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-gray-100 text-gray-700 font-medium rounded-lg hover:bg-gray-200 transition-colors"
            >
            <Home size={20} />
            Go to Home
            </button>
        </div>
      </div>
    </div>
  );
};

export default ErrorPage;
