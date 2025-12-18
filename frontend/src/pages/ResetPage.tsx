import React, { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useStudyStore } from '../store/useStudyStore';
import { RefreshCw } from 'lucide-react';

const ResetPage: React.FC = () => {
    const { slug } = useParams();
    const navigate = useNavigate();
    const { resetSession } = useStudyStore();

    useEffect(() => {
        // Atomic reset
        resetSession();
        // Short delay to ensure state clears before redirect
        const timer = setTimeout(() => {
            navigate(`/study/${slug}/welcome`, { replace: true });
        }, 500);
        return () => clearTimeout(timer);
    }, [resetSession, navigate, slug]);

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
