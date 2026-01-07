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
    params?: Record<string, string | number | boolean | undefined>;
    data?: unknown;
    headers?: HeadersInit;
    signal?: AbortSignal;
}): Promise<T> => {
    // Filter undefined params
    const cleanParams = Object.fromEntries(
        Object.entries(params || {}).filter(([_, v]) => v !== undefined)
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

    const response = await fetch(fullUrl, {
        method,
        headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...(workspaceId ? { 'X-Workspace-ID': workspaceId } : {}),
            ...(headers as Record<string, string>),
        },
        body: data ? (data instanceof URLSearchParams ? data : JSON.stringify(data)) : undefined,
        signal,
    });

    if (!response.ok) {
        const errorText = await response.text();

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

        // 403 Forbidden: Show error toast but don't logout immediately
        // (Handled by React Mutation/Query error states usually, but unexpected 403s should be visible)
        if (response.status === 403) {
            // We can let the UI handle specific 403s, but logging it is good.
            console.warn('Access Forbidden:', url);
        }

        // Auto-report 500 Server Errors
        if (response.status >= 500) {
            reportBug(`Server Error ${response.status} at ${url}: ${errorText}`, {
                endpoint: url,
                status: response.status,
            });
        }

        throw new ApiError(response.status, errorText || 'Request failed');
    }

    // Handle 204 No Content
    if (response.status === 204) {
        return {} as T;
    }

    return response.json();
};
