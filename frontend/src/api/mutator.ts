import { toast } from 'sonner';
import { ApiError, reportBug } from './client';
import { useAuthStore } from '../store/useAuthStore';
import { useSessionStore } from '../store/useSessionStore';

// Re-using the logic from client.ts but adaptable for Orval's signature
const BASE_URL = import.meta.env.VITE_API_URL || import.meta.env.VITE_API_BASE_URL || '';

export const customInstance = async <T>({
    url,
    method,
    params,
    data,
    headers,
    signal,
}: {
    url: string;
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
    params?: Record<string, string | number | boolean | undefined | null>;
    data?: unknown;
    headers?: HeadersInit;
    signal?: AbortSignal;
}): Promise<T> => {
    // Filter undefined params
    const cleanParams = Object.fromEntries(
        Object.entries(params || {}).filter(([_, v]) => v !== undefined && v !== null)
    ) as Record<string, string>;

    const query = new URLSearchParams(cleanParams).toString();
    const fullUrl = `${BASE_URL}${url}${query ? `?${query}` : ''}`;

    // Get token from either admin store or participant session store
    const adminToken = useAuthStore.getState().token;
    const sessionToken = useSessionStore.getState().token;
    const token = adminToken || sessionToken;

    // Get current workspace ID
    const currentWorkspace = useAuthStore.getState().currentWorkspace;
    const workspaceId = currentWorkspace?.id ? String(currentWorkspace.id) : undefined;

    // Timeout Logic
    const timeout = 30000; // 30 seconds
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    // If an external signal is provided, listen to it
    if (signal) {
        signal.addEventListener('abort', () => controller.abort());
    }

    try {
        const response = await fetch(fullUrl, {
            method,
            headers: {
                'Content-Type': 'application/json',
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
                ...(workspaceId ? { 'X-Workspace-ID': workspaceId } : {}),
                ...(headers as Record<string, string>),
            },
            body: data
                ? data instanceof URLSearchParams
                    ? data
                    : JSON.stringify(data)
                : undefined,
            signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
            const errorText = await response.text();
            let message = errorText;
            let code: string | undefined;
            let details: unknown | undefined;

            try {
                const parsed = JSON.parse(errorText);
                if (parsed.message) {
                    message = parsed.message;
                } else if (parsed.detail) {
                    message =
                        typeof parsed.detail === 'string'
                            ? parsed.detail
                            : JSON.stringify(parsed.detail);
                }
                if (parsed.code) code = parsed.code;
                if (parsed.details !== undefined) details = parsed.details;
            } catch (_e) {
                // Not JSON
            }

            // 401 Unauthorized: Clear session and redirect to login
            if (response.status === 401) {
                // Set flag to prevent unsaved changes dialog
                // biome-ignore lint/suspicious/noExplicitAny: window hack
                (window as any).__isAutoLogout = true;

                useAuthStore.getState().logout();
                useSessionStore.getState().resetSession();
                // Optional: Redirect to login if not already there
                if (!window.location.pathname.includes('/login')) {
                    window.location.href = '/login?reason=session_expired';
                }
            }

            // 403 Forbidden: Show error toast
            if (response.status === 403) {
                console.warn('Access Forbidden:', url);
                toast.error('Access Denied', {
                    description: 'You do not have permission to perform this action.',
                });
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

            // Auto-report 500 Server Errors
            if (response.status >= 500) {
                reportBug(`Server Error ${response.status} at ${url}: ${errorText}`, {
                    endpoint: url,
                    status: response.status,
                });
            }
            throw new ApiError(response.status, message, code, details);
        }

        // Handle 204 No Content
        if (response.status === 204) {
            return {} as T;
        }

        return response.json();
    } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
            // Check if it was our timeout or the external signal
            if (signal?.aborted) {
                throw error;
            }
            throw new ApiError(408, 'Request timed out', 'timeout');
        }
        throw error;
    } finally {
        clearTimeout(timeoutId);
    }
};
