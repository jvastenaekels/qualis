import type { TFunction } from 'i18next';

interface BreadcrumbParticipant {
    code?: string;
}

const SEGMENT_LABEL_KEYS: Record<string, [string, string?]> = {
    dashboard: ['admin.breadcrumbs.dashboard'],
    design: ['admin.breadcrumbs.design'],
    recruitment: ['admin.breadcrumbs.recruitment'],
    data: ['admin.breadcrumbs.data', 'Data'],
    privacy: ['admin.breadcrumbs.privacy', 'Data privacy'],
    account: ['admin.breadcrumbs.account', 'Account settings'],
    analysis: ['admin.breadcrumbs.analysis', 'Analysis'],
    exports: ['admin.breadcrumbs.exports'],
    settings: ['admin.breadcrumbs.settings'],
    participants: ['admin.breadcrumbs.participants'],
    concourses: ['admin.breadcrumbs.concourse', 'Concourse'],
    members: ['admin.breadcrumbs.members', 'Team members'],
};

/**
 * Resolve the human-readable label for the last segment of an admin URL,
 * used as the leaf of the admin breadcrumb. Pure: no React state, no fetches
 * (the participant code, when applicable, is passed in via `breadcrumbParticipant`).
 *
 * Detail routes:
 *  - `/concourses/:id` (digit-only id) → "Concourse"
 *  - `/participants/:id` (digit-only id) → "Participant <CODE>" where CODE is
 *    the participant's short display code (session_token[:8], computed
 *    server-side); falls back to the URL id while the fetch is in flight.
 */
export function resolveBreadcrumbLabel(
    pathname: string,
    activeStudyId: string | null,
    breadcrumbParticipant: BreadcrumbParticipant | undefined,
    t: TFunction
): string {
    const segments = pathname.split('/').filter(Boolean);
    const last = segments[segments.length - 1];
    if (!last) return t('admin.breadcrumbs.dashboard');

    if (last === 'admin') return t('admin.breadcrumbs.dashboard');
    if (last === activeStudyId) return t('admin.breadcrumbs.study_dashboard');
    if (last === 'new') return t('admin.project.create.title');

    const prev = segments[segments.length - 2];
    if (prev === 'concourses' && /^\d+$/.test(last)) {
        return t('admin.breadcrumbs.concourse', 'Concourse');
    }
    if (prev === 'participants' && /^\d+$/.test(last)) {
        const code = breadcrumbParticipant?.code ?? last;
        return t('admin.breadcrumbs.participant_n', 'Participant {{code}}', { code });
    }

    const labelKey = SEGMENT_LABEL_KEYS[last];
    if (labelKey) {
        const [key, fallback] = labelKey;
        return fallback ? t(key, fallback) : t(key);
    }

    return last.charAt(0).toUpperCase() + last.slice(1);
}
