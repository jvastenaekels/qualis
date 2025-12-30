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
        console.warn('Failed to report bug:', e);
    }
}

export async function post<T>(endpoint: string, data: unknown): Promise<T> {
    const response = await fetch(`${BASE_URL}${endpoint}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
    });

    if (!response.ok) {
        const errorText = await response.text();

        // Auto-report 500 Server Errors
        if (response.status >= 500) {
            reportBug(`Server Error ${response.status} at ${endpoint}: ${errorText}`, {
                endpoint,
                status: response.status,
            });
        }

        throw new ApiError(response.status, errorText || 'Request failed');
    }

    return response.json();
}

export async function get<T>(endpoint: string): Promise<T> {
    const response = await fetch(`${BASE_URL}${endpoint}`, {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json',
        },
    });

    if (!response.ok) {
        const errorText = await response.text();

        // Auto-report 500 Server Errors
        if (response.status >= 500) {
            reportBug(`Server Error ${response.status} at ${endpoint}: ${errorText}`, {
                endpoint,
                status: response.status,
            });
        }

        throw new ApiError(response.status, errorText || 'Request failed');
    }

    return response.json();
}

export async function recordConsent(
    slug: string,
    token: string,
    languageCode: string,
    consentHash?: string
) {
    return post(`/api/study/${slug}/consent`, {
        study_slug: slug,
        session_token: token,
        language_code: languageCode,
        consent_hash: consentHash,
    });
}
