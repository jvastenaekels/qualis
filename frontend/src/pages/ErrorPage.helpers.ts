import type { TFunction } from 'i18next';
import { ApiError } from '../api/client';

export type ErrorIconKey = 'AlertTriangle' | 'AlertOctagon' | 'RefreshCcw' | 'WifiOff';

export interface ValidationErrorItem {
    loc: (string | number)[];
    msg: string;
}

export interface ErrorDisplayConfig {
    title: string;
    message: string;
    iconKey: ErrorIconKey;
    showReset: boolean;
    showHome: boolean;
    showRetry: boolean;
    validationErrors?: ValidationErrorItem[];
}

interface ComputeArgs {
    error?: Error | ApiError | null;
    propTitle?: string;
    propMessage?: string;
    hasOnRetry: boolean;
    t: TFunction;
}

function fromExplicitProps(args: ComputeArgs): ErrorDisplayConfig {
    return {
        title: args.propTitle || args.t('common.errors.default_title'),
        message: args.propMessage || args.error?.message || args.t('common.errors.unknown'),
        iconKey: 'AlertTriangle',
        showReset: false,
        showHome: true,
        showRetry: args.hasOnRetry,
    };
}

function fromApiError(error: ApiError, t: TFunction): ErrorDisplayConfig | null {
    if (error.code === 'validation_error' && Array.isArray(error.details)) {
        return {
            title: t('common.errors.validation_title') || 'Validation Error',
            message: t('common.errors.validation_message') || 'Please check your input.',
            iconKey: 'AlertTriangle',
            showReset: false,
            showHome: false,
            showRetry: true,
            validationErrors: error.details as ValidationErrorItem[],
        };
    }
    if (error.status === 404) {
        return {
            title: t('common.errors.404.title'),
            message: t('common.errors.404.message'),
            iconKey: 'AlertOctagon',
            showReset: false,
            showHome: true,
            showRetry: false,
        };
    }
    if (error.status === 429) {
        return {
            title: t('common.errors.429.title'),
            message: t('common.errors.429.message'),
            iconKey: 'RefreshCcw',
            showReset: false,
            showHome: false,
            showRetry: true,
        };
    }
    if (error.status === 408) {
        return {
            title: t('common.errors.timeout.title', 'Request Timeout'),
            message: t(
                'common.errors.timeout.message',
                'The server took too long to respond. Please check your connection and try again.'
            ),
            iconKey: 'WifiOff',
            showReset: false,
            showHome: false,
            showRetry: true,
        };
    }
    if (error.code === 'conflict') {
        return {
            title: t('common.errors.conflict_title') || 'Conflict',
            message: error.message || t('common.errors.conflict_message'),
            iconKey: 'AlertTriangle',
            showReset: false,
            showHome: false,
            showRetry: true,
        };
    }
    return null;
}

function isNetworkError(error?: Error | ApiError | null): boolean {
    const msg = error?.message?.toLowerCase() ?? '';
    return msg.includes('network') || msg.includes('fetch');
}

/**
 * Pure dispatcher: maps the various ErrorPage inputs (explicit props,
 * ApiError variants, network heuristics, fallback) to a DisplayConfig.
 */
export function computeErrorDisplay(args: ComputeArgs): ErrorDisplayConfig {
    if (args.propTitle || args.propMessage) {
        return fromExplicitProps(args);
    }
    if (args.error instanceof ApiError) {
        const fromApi = fromApiError(args.error, args.t);
        if (fromApi) return fromApi;
    }
    if (isNetworkError(args.error)) {
        return {
            title: args.t('common.errors.network_title'),
            message: args.t('common.errors.network'),
            iconKey: 'WifiOff',
            showReset: false,
            showHome: false,
            showRetry: true,
        };
    }
    // Fallback (generic crash)
    return {
        title: args.t('common.errors.default_title'),
        message: args.error?.message || args.t('common.errors.unknown'),
        iconKey: 'AlertTriangle',
        showReset: true,
        showHome: true,
        showRetry: args.hasOnRetry,
    };
}
