/*
 * Libre-Q - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

import { RefreshCw } from 'lucide-react';
import type React from 'react';
import { useEffect } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useConfigStore } from '../store/useConfigStore';
import { useResponseStore } from '../store/useResponseStore';
import { useSessionStore } from '../store/useSessionStore';

const ResetPage: React.FC = () => {
    const { slug } = useParams();
    const navigate = useNavigate();
    const location = useLocation();

    // We access stores directly in useEffect to avoid unnecessary subscriptions

    useEffect(() => {
        // Atomic reset of all stores
        useSessionStore.getState().resetSession();
        useConfigStore.getState().resetConfig();
        useResponseStore.getState().resetResponses();

        // Short delay to ensure state clears before redirect
        const timer = setTimeout(() => {
            navigate(`/study/${slug}/welcome${location.search}`, { replace: true });
        }, 500);
        return () => clearTimeout(timer);
    }, [navigate, slug, location.search]);

    return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4">
            <div className="animate-spin text-blue-600">
                <RefreshCw size={48} />
            </div>
            <p className="text-slate-500 font-medium">Resetting study session...</p>
        </div>
    );
};

export default ResetPage;
