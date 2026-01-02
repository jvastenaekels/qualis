/*
 * Open-Q - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

/**
 * API Client
 *
 * Wrapper for fetch API to handle standard HTTP methods, error parsing, and automated bug reporting.
 */

export class ApiError extends Error {
    status: number;

    constructor(status: number, message: string) {
        super(message);
        this.status = status;
        this.name = 'ApiError';
    }
}

const BASE_URL = import.meta.env.VITE_API_URL || import.meta.env.VITE_API_BASE_URL || '';

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

// Default export for axios-like usage in some older components
// Note: This is a shim to allow the project to build while we transition to Orval
export default {
    get: async (
        url: string,
        options?: RequestInit & { headers?: Record<string, string>; responseType?: string }
    ) => {
        const fullUrl =
            url.startsWith('http') || url.startsWith('/api')
                ? `${BASE_URL}${url}`
                : `${BASE_URL}/api${url}`;
        const response = await fetch(fullUrl, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                ...options?.headers,
            },
            ...options,
        });
        if (!response.ok) throw new Error(await response.text());
        return {
            data: await (options?.responseType === 'blob' ? response.blob() : response.json()),
        };
    },
};
