import type { TFunction } from 'i18next';

interface AxiosErrorShape {
    response?: { data?: { detail?: unknown } };
}

/** Suggested slug for a title: accents fall back to their base letter. */
export function slugifyTitle(title: string): string {
    return title
        .toLowerCase()
        .normalize('NFD')
        .replace(/\p{M}/gu, '')
        .replace(/[^a-z0-9]+/g, '-')
        .slice(0, 50)
        .replace(/^-|-$/g, '');
}

/**
 * Parse the various error shapes that can come back from the create-study
 * mutation into a user-displayable string. Handles:
 * - axios-style validation errors (Pydantic detail array)
 * - axios-style string detail
 * - axios-style object detail (stringified)
 * - Error.message fallback
 * - generic fallback (i18n default)
 */
export function parseStudyCreationError(error: unknown, t: TFunction): string {
    const fallback = t('admin.dialogs.create_study.error', 'Failed to create study');
    if (!error || typeof error !== 'object') return fallback;

    const axiosError = error as AxiosErrorShape;
    const detail = axiosError.response?.data?.detail;

    if (detail !== undefined) {
        if (Array.isArray(detail)) {
            const fieldErrors = detail
                .map((err: { loc: string[]; msg: string }) => `${err.loc.join('.')}: ${err.msg}`)
                .join('\n');
            return `Validation errors:\n${fieldErrors}`;
        }
        if (typeof detail === 'string') return detail;
        if (typeof detail === 'object') return JSON.stringify(detail, null, 2);
    }

    if ('message' in error && typeof (error as { message?: unknown }).message === 'string') {
        return (error as { message: string }).message;
    }

    return fallback;
}
