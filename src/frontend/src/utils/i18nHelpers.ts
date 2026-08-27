/**
 * Helper to parse and translate JSON-encoded error messages from the backend
 */
export const formatBackendError = (
    raw: string,
    t: (key: string, params?: Record<string, unknown>) => string
): string => {
    try {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object' && 'key' in parsed) {
            return t(parsed.key, parsed);
        }
        return raw;
    } catch {
        return raw;
    }
};
