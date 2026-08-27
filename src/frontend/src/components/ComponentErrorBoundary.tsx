import React from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, RefreshCcw } from 'lucide-react';
import ErrorBoundary from './ErrorBoundary';

interface Props {
    children: React.ReactNode;
    fallback?: React.ReactNode;
    title?: string;
    onReset?: () => void;
}

/**
 * A wrapper for granular error boundaries.
 * Displays a small inline error message instead of crashing the whole page.
 */
export const ComponentErrorBoundary: React.FC<Props> = ({ children, fallback, title, onReset }) => {
    const { t } = useTranslation();

    const DefaultFallback = ({
        error,
        resetErrorBoundary,
    }: {
        error: Error;
        resetErrorBoundary: () => void;
    }) => (
        <div className="p-4 border border-red-200 bg-red-50 rounded-lg flex flex-col items-center justify-center text-center gap-3 animate-in fade-in zoom-in-95 duration-200">
            <div className="bg-red-100 p-2 rounded-full text-red-600">
                <AlertTriangle size={20} />
            </div>
            <div className="space-y-1">
                <h3 className="text-sm font-semibold text-red-900">
                    {title || t('common.errors.component_error', 'Something went wrong')}
                </h3>
                <p
                    className="text-xs text-red-700 max-w-[200px] mx-auto line-clamp-2"
                    title={error.message}
                >
                    {error.message}
                </p>
            </div>
            <button
                type="button"
                onClick={() => {
                    onReset?.();
                    resetErrorBoundary();
                }}
                className="text-xs font-medium bg-white border border-red-200 text-red-700 px-3 py-1.5 rounded-md hover:bg-red-50 shadow-sm flex items-center gap-1.5 transition-colors"
            >
                <RefreshCcw size={12} />
                {t('common.retry', 'Retry')}
            </button>
        </div>
    );

    return (
        // We use a library like react-error-boundary for easier functional component usage
        // But since we have a custom class ErrorBoundary, let's wrap it or implement a simple functional one.
        // Actually, our custom ErrorBoundary class doesn't support render props or easy reset for children yet.
        // Let's assume we want to use the existing ErrorBoundary class but customizable.
        // Wait, standard ErrorBoundary in React only catches errors in children.
        // To support "Reset", we need the key-change trick or a custom implementation.
        // Let's use a key-based reset wrapper around our class ErrorBoundary.

        <ResetWrapper onReset={onReset}>
            {(reset, key) => (
                <ErrorBoundary
                    key={key}
                    fallback={(error) =>
                        fallback ? (
                            fallback
                        ) : (
                            <DefaultFallback error={error} resetErrorBoundary={reset} />
                        )
                    }
                >
                    {children}
                </ErrorBoundary>
            )}
        </ResetWrapper>
    );
};

// Helper for resetting state
const ResetWrapper: React.FC<{
    onReset?: () => void;
    children: (reset: () => void, key: number) => React.ReactNode;
}> = ({ onReset, children }) => {
    const [key, setKey] = React.useState(0);
    const reset = () => {
        onReset?.();
        setKey((k) => k + 1);
    };
    return <>{children(reset, key)}</>;
};

// Modify existing ErrorBoundary to accept a fallback prop!
// Wait, I need to check if existing ErrorBoundary accepts fallback.
// It currently renders <ErrorPage /> directly if hasError is true.
// I need to modify ErrorBoundary.tsx to accept `fallback` prop which can be a ReactNode or a function.
