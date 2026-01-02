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

    const response = await fetch(fullUrl, {
        method,
        headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...(headers as Record<string, string>),
        },
        body: data ? (data instanceof URLSearchParams ? data : JSON.stringify(data)) : undefined,
        signal,
    });

    if (!response.ok) {
        const errorText = await response.text();

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
