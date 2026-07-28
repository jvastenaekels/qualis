import type { TFunction } from 'i18next';

interface BreadcrumbParticipant {
    code?: string;
}

/**
 * One entry per static URL segment reachable inside `<AdminLayout>`, per
 * CLAUDE.md's admin header policy. Each fallback is the canonical English
 * label for that section — the same string carried by `admin.sidebar.<s>` and
 * `admin.<s>.title` (the naming canon).
 *
 * Exhaustiveness over the real route table is enforced by
 * `AdminLayout.breadcrumb-coverage.test.tsx`. `settings` is deliberately absent:
 * two different pages own that segment, so it is resolved by context below.
 */
const SEGMENT_LABEL_KEYS: Record<string, [string, string]> = {
    dashboard: ['admin.breadcrumbs.dashboard', 'Dashboard'],
    design: ['admin.breadcrumbs.design', 'Design'],
    recruitment: ['admin.breadcrumbs.recruitment', 'Access'],
    data: ['admin.breadcrumbs.data', 'Data'],
    privacy: ['admin.breadcrumbs.privacy', 'Data privacy'],
    account: ['admin.breadcrumbs.account', 'Account settings'],
    analysis: ['admin.breadcrumbs.analysis', 'Analysis'],
    participants: ['admin.breadcrumbs.participants', 'Participants'],
    concourses: ['admin.breadcrumbs.concourse', 'Concourse'],
    members: ['admin.breadcrumbs.members', 'Team members'],
    users: ['admin.breadcrumbs.users', 'Users'],
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
 *
 * Context-sensitive segment:
 *  - `settings` → "Study settings" inside `/studies/:slug/…`, "Project settings"
 *    otherwise. A bare "Settings" leaf on both would make the breadcrumb — the
 *    single source of truth for hierarchy — unable to say which page you are on.
 */
export function resolveBreadcrumbLabel(
    pathname: string,
    activeStudyId: string | null,
    breadcrumbParticipant: BreadcrumbParticipant | undefined,
    t: TFunction
): string {
    const segments = pathname.split('/').filter(Boolean);
    const last = segments[segments.length - 1];
    if (!last) return t('admin.breadcrumbs.dashboard', 'Dashboard');

    if (last === 'admin') return t('admin.breadcrumbs.dashboard', 'Dashboard');
    if (last === activeStudyId) return t('admin.breadcrumbs.study_dashboard', 'Overview');
    if (last === 'new') return t('admin.project.create.title', 'Create project');

    // `settings` is owned by two pages. Resolve it from the URL rather than from
    // `activeStudyId`, which is store state and can lag a route change.
    if (last === 'settings') {
        return segments.includes('studies')
            ? t('admin.breadcrumbs.study_settings', 'Study settings')
            : t('admin.breadcrumbs.project_settings', 'Project settings');
    }

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
        return t(key, fallback);
    }

    // Unreachable for any route that exists: the mapping's exhaustiveness over
    // the real route table is asserted by AdminLayout.breadcrumb-coverage.test.tsx.
    // Deliberately returns the segment verbatim rather than Title-casing it —
    // a fabricated "Banana" reads like a real section name and hid the missing
    // `users` entry for as long as the fallback existed (CLAUDE.md forbids it).
    return last;
}
