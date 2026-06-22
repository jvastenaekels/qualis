/*
 * Qualis - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

/**
 * API Client
 *
 * Exports ApiError (used by the orval mutator and error-handling code)
 * and reportBug (used by ErrorBoundary, ConsentPage, and the mutator).
 */

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
