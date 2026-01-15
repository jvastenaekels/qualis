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
