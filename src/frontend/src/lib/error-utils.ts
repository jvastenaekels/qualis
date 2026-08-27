/**
 * Centralized error parsing for API responses.
 * Extracts "detail" or "message" from JSON error bodies.
 */
// export async function parseApiError(error: unknown, defaultMessage: string): Promise<string> {
//     if (!(error instanceof Error)) {
//         return defaultMessage;
//     }
//
//     try {
//         // Many errors come from the custom mutator as a stringified JSON body
//         const body = JSON.parse(error.message);
//         return body.detail || body.message || defaultMessage;
//     } catch (_e) {
//         // Fallback to the raw error message if it's not JSON
//         return error.message || defaultMessage;
//     }
// }

/**
 * Sync version if the error message is already known to be a JSON string
 * or if we want to handle it synchronously.
 */
export function parseApiErrorSync(error: unknown, defaultMessage: string): string {
    if (!(error instanceof Error)) {
        return defaultMessage;
    }

    try {
        const body = JSON.parse(error.message);
        return body.detail || body.message || defaultMessage;
    } catch (_e) {
        return error.message || defaultMessage;
    }
}

/*
 * Maps backend stable error codes to i18n keys.
 *
 * Backend wire format: { code: string, message: string, details: object | null }.
 * Different code paths put the stable error code in different fields:
 * - HTTPException(detail="X") (e.g. OWNER_ROLE_IMMUTABLE) → code="error", message="X"
 *
 * resolveApiErrorKey checks `code` first, then `message`, returning either an
 * i18n key or null. The fallback string is the server's `message` so the user
 * sees something coherent if no key matches.
 *
 * Works with both raw ApiErrorPayload objects and ApiError instances
 * (which already have `.code` and `.message` as direct properties after
 * parseErrorBody runs in client.ts).
 */

export const ERROR_KEY: Record<string, string> = {
    OWNER_ROLE_IMMUTABLE: 'errors.owner_role_immutable',
};

export interface ApiErrorPayload {
    code?: string;
    message?: string;
    details?: unknown;
}

export function resolveApiErrorKey(payload: ApiErrorPayload | undefined): {
    key: string | null;
    fallback: string;
} {
    const code = payload?.code ?? '';
    const message = payload?.message ?? '';
    const stableCode = code in ERROR_KEY ? code : message in ERROR_KEY ? message : '';
    const key = stableCode ? (ERROR_KEY[stableCode] ?? null) : null;
    const fallback = message || code || 'An error occurred.';
    return { key, fallback };
}
