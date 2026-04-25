/*
 * Qualis - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

/**
 * API Client
 *
 * Wrapper for fetch API to handle standard HTTP methods, error parsing, and automated bug reporting.
 */

import { toast } from 'sonner';

export class ApiError extends Error {
    status: number;
    code?: string;
    details?: unknown;

    constructor(status: number, message: string, code?: string, details?: unknown) {
        super(message);
        this.status = status;
        this.code = code;
        this.details = details;
        this.name = 'ApiError';
    }
}

const getBaseUrl = () => {
    try {
        return import.meta.env.VITE_API_URL || import.meta.env.VITE_API_BASE_URL || '';
    } catch {
        return '';
    }
};
const BASE_URL = getBaseUrl();

// --- Error Reporting ---

interface ErrorContext {
    url?: string;
    userAgent?: string;
    [key: string]: unknown;
}

/**
 * Report an error to the backend logs.
 * Silently fails if reporting fails to avoid infinite loops.
 */
export async function reportBug(error: Error | string, context?: ErrorContext) {
    // Prevent recursive reporting (if the report endpoint itself fails)
    if (typeof error === 'string' && error.includes('/api/logs')) return;
    if (error instanceof Error && error.message.includes('/api/logs')) return;

    try {
        const message = error instanceof Error ? error.message : String(error);
        const stack = error instanceof Error ? error.stack : undefined;

        await fetch(`${BASE_URL}/api/logs`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                level: 'error',
                message,
                stack,
                url: window.location.href,
                userAgent: navigator.userAgent,
                context,
            }),
            keepalive: true, // Ensure request is sent even if page unloads
        });
    } catch (e) {
        console.warn('Failed to report bug to /api/logs:', e);
    }
}

import { useAuthStore } from '../store/useAuthStore';
import { useSessionStore } from '../store/useSessionStore';

// Default export for axios-like usage in some older components
// Note: This is a shim to allow the project to build while we transition to Orval
export default {
    get: async (
        url: string,
        options?: RequestInit & {
            headers?: Record<string, string>;
            responseType?: string;
        }
    ) => request(url, { ...options, method: 'GET' }),

    post: async (
        url: string,
        data?: unknown,
        options?: RequestInit & { headers?: Record<string, string> }
    ) => request(url, { ...options, method: 'POST', body: JSON.stringify(data) }),

    patch: async (
        url: string,
        data?: unknown,
        options?: RequestInit & { headers?: Record<string, string> }
    ) => request(url, { ...options, method: 'PATCH', body: JSON.stringify(data) }),

    delete: async (url: string, options?: RequestInit & { headers?: Record<string, string> }) =>
        request(url, { ...options, method: 'DELETE' }),
};

async function request(
    url: string,
    options: RequestInit & {
        headers?: Record<string, string>;
        responseType?: string;
    }
) {
    const fullUrl =
        url.startsWith('http') || url.startsWith('/api')
            ? `${BASE_URL}${url}`
            : `${BASE_URL}/api${url}`;

    // Get token from either admin store or participant session store
    const adminToken = useAuthStore.getState().token;
    const sessionToken = useSessionStore.getState().token;
    const token = adminToken || sessionToken;

    // Get current project ID
    const currentProject = useAuthStore.getState().currentProject;
    const projectId = currentProject?.id ? String(currentProject.id) : undefined;

    const headers = {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(projectId ? { 'X-Project-ID': projectId } : {}),
        ...options?.headers,
    };

    const controller = new AbortController();
    const timeout = 30000; // 30 seconds
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    let response: Response;
    try {
        response = await fetch(fullUrl, {
            ...options,
            headers,
            signal: controller.signal,
        });
    } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
            throw new ApiError(408, 'Request timed out', 'timeout');
        }
        throw error;
    } finally {
        clearTimeout(timeoutId);
    }

    if (!response.ok) {
        const errorText = await response.text();
        let message = errorText;
        let code: string | undefined;
        let details: unknown | undefined;

        try {
            const parsed = JSON.parse(errorText);

            // Standard Error Schema Parsing
            if (parsed.message) {
                message = parsed.message;
            } else if (parsed.detail) {
                // Fallback for legacy/fastapi default errors if any remain
                message =
                    typeof parsed.detail === 'string'
                        ? parsed.detail
                        : JSON.stringify(parsed.detail);
            }

            if (parsed.code) {
                code = parsed.code;
            }
            if (parsed.details !== undefined) {
                details = parsed.details;
            }
        } catch (_e) {
            // Keep original errorText if not JSON (e.g. 502 Bad Gateway HTML)
            if (response.status === 502) {
                message = 'Service unavailable (Bad Gateway)';
                code = 'bad_gateway';
            } else if (response.status === 504) {
                message = 'Gateway Timeout';
                code = 'gateway_timeout';
            }
        }

        if (response.status === 401 && !url.includes('/api/token')) {
            // Handle session expiry for manual fetches too
            useAuthStore.getState().logout();
            if (!window.location.pathname.includes('/login')) {
                window.location.href = '/login?reason=session_expired';
            }
        }

        // 429 Too Many Requests
        if (response.status === 429) {
            toast.error('Too Many Requests', {
                description: 'Please wait a moment before trying again.',
            });
        }

        // 409 Conflict
        if (response.status === 409) {
            toast.error('Conflict', {
                description: message || 'The resource has been modified or already exists.',
            });
        }

        throw new ApiError(response.status, message, code, details);
    }
    return {
        data: await (options?.responseType === 'blob' ? response.blob() : response.json()),
    };
}
