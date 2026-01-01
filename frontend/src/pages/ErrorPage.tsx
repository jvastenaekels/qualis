/*
 * Open-Q - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

import { AlertOctagon, AlertTriangle, Home, RefreshCcw, WifiOff } from 'lucide-react';
import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { ApiError } from '../api/client';
import { useConfigStore } from '../store/useConfigStore';
import { useResponseStore } from '../store/useResponseStore';
import { useSessionStore } from '../store/useSessionStore';

interface ErrorPageProps {
    error?: Error | ApiError | null;
    title?: string;
    message?: string;
    onRetry?: () => void;
    isFullPage?: boolean;
}

const ErrorPage: React.FC<ErrorPageProps> = ({
    error,
    title: propTitle,
    message: propMessage,
    onRetry,
    isFullPage = true,
}) => {
    const navigate = useNavigate();
    const { t } = useTranslation();

    const handleReset = () => {
        useSessionStore.getState().resetSession();
        useConfigStore.getState().resetConfig();
        useResponseStore.getState().resetResponses();
        localStorage.removeItem('open-q-session');
        localStorage.removeItem('open-q-responses');
        window.location.href = '/';
    };

    const {
        title,
        message,
        icon: Icon,
        showReset,
        showHome,
        showRetry,
    } = useMemo(() => {
        // 1. Explicit Props (Higher Priority)
        if (propTitle || propMessage) {
            return {
                title: propTitle || t('common.errors.default_title'),
                message: propMessage || error?.message || t('common.errors.unknown'),
                icon: AlertTriangle,
                showReset: false,
                showHome: true,
                showRetry: !!onRetry,
            };
        }

        // 2. ApiError Handling
        if (error instanceof ApiError) {
            if (error.status === 404) {
                return {
                    title: t('common.errors.404.title'),
                    message: t('common.errors.404.message'),
                    icon: AlertOctagon, // or a Search icon
                    showReset: false,
                    showHome: true,
                    showRetry: false,
                };
            }
            if (error.status === 429) {
                return {
                    title: t('common.errors.429.title'),
                    message: t('common.errors.429.message'),
                    icon: RefreshCcw,
                    showReset: false,
                    showHome: false,
                    showRetry: true,
                };
            }
        }

        // 3. Network Errors (Fetch failures)
        if (
            error?.message?.toLowerCase().includes('network') ||
            error?.message?.toLowerCase().includes('fetch')
        ) {
            return {
                title: t('common.errors.network_title'),
                message: t('common.errors.network'),
                icon: WifiOff,
                showReset: false,
                showHome: false,
                showRetry: true,
            };
        }

        // 4. Fallback (Generic Crash)
        return {
            title: t('common.errors.default_title'),
            message: t('common.errors.unknown'),
            icon: AlertTriangle,
            showReset: true, // Only offer hard reset for unknown crashes
            showHome: true,
            showRetry: !!onRetry,
        };
    }, [error, propTitle, propMessage, onRetry, t]);

    const Container = isFullPage ? 'div' : React.Fragment;
    const containerProps = isFullPage
        ? { className: 'min-h-screen bg-gray-50 flex items-center justify-center p-4' }
        : {};

    return (
        <Container {...containerProps}>
            <div
                className={`${isFullPage ? 'max-w-md w-full bg-white rounded-2xl shadow-xl p-8' : 'w-full p-6 text-center'} text-center space-y-6`}
            >
                <div
                    className={`w-20 h-20 ${error instanceof ApiError && error.status === 404 ? 'bg-orange-100 text-orange-600' : 'bg-red-100 text-red-600'} rounded-full flex items-center justify-center mx-auto transition-colors`}
                >
                    <Icon size={40} />
                </div>

                <div className="space-y-2">
                    <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
                    <p className="text-gray-600 leading-relaxed">{message}</p>
                </div>

                {/* Debug Info (Dev Mode Only) */}
                {import.meta.env.DEV && error && (
                    <div className="mt-4 p-3 bg-red-50 rounded text-xs text-red-800 text-left font-mono overflow-auto max-h-32 border border-red-100">
                        {error.toString()}
                    </div>
                )}

                <div className="flex flex-col gap-3 pt-2">
                    {showRetry && (
                        <button
                            type="button"
                            onClick={onRetry || (() => window.location.reload())}
                            className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
                        >
                            <RefreshCcw size={18} />
                            {t('common.errors.retry')}
                        </button>
                    )}

                    {showReset && (
                        <button
                            type="button"
                            onClick={handleReset}
                            className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-red-600 text-white font-bold rounded-lg hover:bg-red-700 transition-colors shadow-sm"
                        >
                            <RefreshCcw size={18} />
                            {t('common.errors.reset')}
                        </button>
                    )}

                    {showHome && (
                        <button
                            type="button"
                            onClick={() => navigate('/')}
                            className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-gray-100 text-gray-700 font-medium rounded-lg hover:bg-gray-200 transition-colors"
                        >
                            <Home size={18} />
                            {t('common.errors.home')}
                        </button>
                    )}
                </div>
            </div>
        </Container>
    );
};

export default ErrorPage;
