/**
 * Pure helper for LegacyRedirect — resolves a legacy `/admin/*` URL into the
 * new `/app/:projectSlug/*` structure plus optional active-study/project
 * state updates. The component does the actual `<Navigate>` + Zustand calls.
 */

interface StudyLike {
    slug: string;
    project?: { slug: string; id: number } | null;
}

interface ProjectLike {
    slug: string;
    id: number;
}

export interface LegacyRedirectResolution {
    target: string;
    activeStudy?: string;
    activeProjectId?: number;
}

/** /admin (root) — prefer last visited study, then first project, else hub. */
function resolveAdminRoot(
    projects: ProjectLike[] | undefined | null,
    allStudies: StudyLike[] | undefined,
    lastVisitedStudySlug: string | null
): LegacyRedirectResolution {
    if (lastVisitedStudySlug && allStudies) {
        const study = allStudies.find((s) => s.slug === lastVisitedStudySlug);
        if (study?.project) {
            return { target: `/app/${study.project.slug}/studies/${study.slug}` };
        }
    }
    const lastProj = projects?.[0];
    if (lastProj) return { target: `/app/${lastProj.slug}/dashboard` };
    return { target: '/hub' };
}

/** /admin/studies/:slug/... → migrate sub-paths and set active state. */
function resolveStudyPath(
    slug: string,
    pathParts: string[],
    allStudies: StudyLike[] | undefined
): LegacyRedirectResolution | null {
    const study = allStudies?.find((s) => s.slug === slug);
    if (!study?.project) return null;

    const projSlug = study.project.slug;
    let subPath = pathParts.slice(3).join('/');
    if (subPath === 'exports') subPath = 'data';
    if (subPath === 'team') return { target: `/app/${projSlug}/team` };

    return {
        target: `/app/${projSlug}/studies/${slug}${subPath ? `/${subPath}` : ''}`,
        activeStudy: slug,
        activeProjectId: study.project.id,
    };
}

/** /admin/profile → first project's account or /hub. */
function resolveProfilePath(projects: ProjectLike[] | undefined | null): LegacyRedirectResolution {
    const firstProj = projects?.[0];
    if (firstProj) return { target: `/app/${firstProj.slug}/account` };
    return { target: '/hub' };
}

/**
 * Resolve a legacy `/admin/*` URL. Returns the new target path and any
 * `setActive*` state updates the caller should apply before navigating.
 */
export function resolveLegacyTarget(
    pathname: string,
    projects: ProjectLike[] | undefined | null,
    allStudies: StudyLike[] | undefined,
    lastVisitedStudySlug: string | null
): LegacyRedirectResolution {
    const pathParts = pathname.split('/').filter(Boolean);
    if (pathParts[0] !== 'admin') return { target: '/hub' };

    const slug = pathParts[2];

    if (pathParts.length === 1) {
        return resolveAdminRoot(projects, allStudies, lastVisitedStudySlug);
    }
    if (pathParts[1] === 'studies' && slug) {
        const r = resolveStudyPath(slug, pathParts, allStudies);
        if (r) return r;
    }
    if (pathParts[1] === 'w' && slug) {
        const proj = projects?.find((w) => w.slug === slug);
        return {
            target: `/app/${slug}/dashboard`,
            ...(proj ? { activeProjectId: proj.id } : {}),
        };
    }
    if (pathParts[1] === 'workspaces' && pathParts[3] === 'settings' && slug) {
        const proj2 = projects?.find((w) => w.slug === slug);
        return {
            target: `/app/${slug}/settings`,
            ...(proj2 ? { activeProjectId: proj2.id } : {}),
        };
    }
    if (pathParts[1] === 'profile') {
        return resolveProfilePath(projects);
    }
    return { target: '/hub' };
}
