import { toast } from 'sonner';
import { ApiError, reportBug } from './client';
import i18n from '../i18n';
import { resolveApiErrorKey } from '../lib/error-utils';
import { useAuthStore } from '../store/useAuthStore';
import { useSessionStore } from '../store/useSessionStore';
import { useResponseStore } from '../store/useResponseStore';

// Re-using the logic from client.ts but adaptable for Orval's signature
const getBaseUrl = () => {
    try {
        return import.meta.env.VITE_API_URL || import.meta.env.VITE_API_BASE_URL || '';
    } catch {
        return '';
    }
};
export const BASE_URL = getBaseUrl();

interface ParsedErrorBody {
    message: string;
    code?: string;
    details?: unknown;
}

/** Parse the body of an error response. Falls back to the raw text if not JSON. */
function parseErrorBody(errorText: string): ParsedErrorBody {
    try {
        const parsed = JSON.parse(errorText);
        let message = errorText;
        if (parsed.message) {
            message = parsed.message;
        } else if (parsed.detail) {
            message =
                typeof parsed.detail === 'string' ? parsed.detail : JSON.stringify(parsed.detail);
        }
        return {
            message,
            code: parsed.code,
            details: parsed.details,
        };
    } catch {
        return { message: errorText };
    }
}

function buildRequestHeaders(
    data: unknown,
    token: string | null | undefined,
    projectId: string | undefined,
    headers: HeadersInit | undefined
): Record<string, string> {
    const isFormData = data instanceof URLSearchParams || data instanceof FormData;
    const requestHeaders: Record<string, string> = {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(projectId ? { 'X-Project-ID': projectId } : {}),
        ...(headers as Record<string, string>),
    };

    // FormData: let the browser set Content-Type (with boundary). A manual
    // multipart/form-data header would kill the boundary and break parsing.
    if (isFormData) {
        if (requestHeaders['Content-Type']?.includes('multipart/form-data')) {
            delete requestHeaders['Content-Type'];
        }
    } else if (!requestHeaders['Content-Type']) {
        requestHeaders['Content-Type'] = 'application/json';
    }
    return requestHeaders;
}

function handle401(_method: string, url: string): void {
    if (url.includes('/api/token') || url.includes('/api/study/')) return;
    // biome-ignore lint/suspicious/noExplicitAny: window hack to suppress unsaved-changes dialog
    (window as any).__isAutoLogout = true;

    // Distinguish "had a token, lost it" (session_expired) from
    // "never authenticated" (auth_required) — the latter occurs
    // when a cold visitor opens /admin and is bounced through 401.
    const hadToken = useAuthStore.getState().token !== null;
    useAuthStore.getState().logout();
    useSessionStore.getState().resetSession();
    useResponseStore.getState().resetResponses();
    if (!window.location.pathname.includes('/login')) {
        const reason = hadToken ? 'session_expired' : 'auth_required';
        window.location.href = `/login?reason=${reason}`;
    }
}

function handle403(
    method: string,
    url: string,
    parsedMessage: string,
    parsedCode: string | undefined
): void {
    console.warn('Access Forbidden:', method, url);
    // Skip toast for GETs — those are background fetches; surfacing a
    // toast for every read-side 403 is noise (e.g. a viewer landing on
    // a page that pre-fetches data they're not entitled to). Mutations
    // are user-triggered, so the toast is informative there.
    if (method.toUpperCase() === 'GET') return;
    const { key, fallback } = resolveApiErrorKey({ code: parsedCode, message: parsedMessage });
    const description = key
        ? i18n.t(key, fallback)
        : parsedMessage ||
          i18n.t(
              'errors.access_denied_description',
              'You do not have permission to perform this action.'
          );
    toast.error(i18n.t('errors.access_denied_title', 'Access Denied'), {
        id: `403:${method}:${url}`, // dedupe identical 403s on the same endpoint
        description,
    });
}

function handle409(
    method: string,
    url: string,
    parsedMessage: string,
    parsedCode: string | undefined
): void {
    const { key, fallback } = resolveApiErrorKey({ code: parsedCode, message: parsedMessage });
    toast.error(i18n.t('errors.conflict_title', 'Conflict'), {
        id: `409:${method}:${url}`,
        description: key
            ? i18n.t(key, fallback)
            : parsedMessage ||
              i18n.t(
                  'errors.conflict_description',
                  'The resource has been modified or already exists.'
              ),
    });
}

function handle429(url: string): void {
    toast.error(i18n.t('errors.rate_limited_title', 'Too Many Requests'), {
        id: `429:${url}`,
        description: i18n.t(
            'errors.rate_limited_description',
            'Please wait a moment before trying again.'
        ),
    });
}

/** Side effects (toasts, redirect, bug-report) for error responses. */
function handleErrorStatus(
    status: number,
    method: string,
    url: string,
    errorText: string,
    parsedMessage: string,
    parsedCode: string | undefined
): void {
    if (status === 401) handle401(method, url);
    else if (status === 403) handle403(method, url, parsedMessage, parsedCode);
    else if (status === 409) handle409(method, url, parsedMessage, parsedCode);
    else if (status === 429) handle429(url);
    if (status >= 500) {
        reportBug(`Server Error ${status} at ${url}: ${errorText}`, { endpoint: url, status });
    }
}

function buildRequestBody(data: unknown, isFormData: boolean): BodyInit | undefined {
    if (!data) return undefined;
    return isFormData ? (data as BodyInit) : JSON.stringify(data);
}

async function processResponse<T>(response: Response, method: string, url: string): Promise<T> {
    if (!response.ok) {
        const errorText = await response.text();
        const { message, code, details } = parseErrorBody(errorText);
        handleErrorStatus(response.status, method, url, errorText, message, code);
        throw new ApiError(response.status, message, code, details);
    }
    if (response.status === 204) {
        return {} as T;
    }
    return response.json();
}

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
    const cleanParams = Object.fromEntries(
        Object.entries(params || {}).filter(([_, v]) => v !== undefined && v !== null)
    ) as Record<string, string>;
    const query = new URLSearchParams(cleanParams).toString();
    const fullUrl = `${BASE_URL}${url}${query ? `?${query}` : ''}`;

    const adminToken = useAuthStore.getState().token;
    const sessionToken = useSessionStore.getState().token;
    const token = adminToken || sessionToken;

    const currentProject = useAuthStore.getState().currentProject;
    const projectId = currentProject?.id ? String(currentProject.id) : undefined;

    const timeout = 30000;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    if (signal) {
        signal.addEventListener('abort', () => controller.abort());
    }

    try {
        const isFormData = data instanceof URLSearchParams || data instanceof FormData;
        const requestHeaders = buildRequestHeaders(data, token, projectId, headers);

        const response = await fetch(fullUrl, {
            method,
            headers: requestHeaders,
            body: buildRequestBody(data, isFormData),
            signal: controller.signal,
        });

        clearTimeout(timeoutId);
        return await processResponse<T>(response, method, url);
    } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
            // External-signal abort vs our own timeout
            if (signal?.aborted) throw error;
            throw new ApiError(408, 'Request timed out', 'timeout');
        }
        throw error;
    } finally {
        clearTimeout(timeoutId);
    }
};
