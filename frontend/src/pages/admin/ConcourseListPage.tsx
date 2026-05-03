import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAdminContext } from '@/hooks/useAdminContext';
import { usePermission } from '@/hooks/usePermission';
import {
    useListConcoursesApiAdminConcoursesGet,
    useCreateConcourseApiAdminConcoursesPost,
} from '@/api/generated';
import { parseApiErrorSync } from '@/lib/error-utils';

/**
 * Each project has exactly one concourse. This page auto-creates it
 * if it doesn't exist yet, then redirects to the detail page.
 */
export default function ConcourseListPage() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { project: workspace } = useAdminContext();
    const { can } = usePermission();
    const canCreate = can('study:create'); // owner/member only — viewers can't auto-create

    // Gate the GET on having the project context hydrated, otherwise the
    // request fires without an X-Project-ID header and the backend returns
    // a spurious 403 → "Access Denied" toast on first paint.
    const { data, isLoading } = useListConcoursesApiAdminConcoursesGet(undefined, {
        query: { enabled: !!workspace?.slug },
    });
    const concourses = data?.items ?? [];

    const createMutation = useCreateConcourseApiAdminConcoursesPost();
    const creatingRef = useRef(false);
    const [error, setError] = useState<string | null>(null);

    const attemptCreate = useCallback(() => {
        if (creatingRef.current || createMutation.isPending || !workspace?.slug || !canCreate)
            return;
        creatingRef.current = true;
        setError(null);

        // Derive the default title from the project so that listings, search
        // results, and audit logs across multiple projects show distinct names.
        // Falls back to the bare 'Concourse' when the project title is unset.
        const defaultTitle = workspace.title
            ? t('admin.concourse.default_title_for_project', '{{project}} concourse', {
                  project: workspace.title,
              })
            : t('admin.concourse.default_title', 'Concourse');

        createMutation
            .mutateAsync({
                data: {
                    title: defaultTitle,
                    description: null,
                },
            })
            .then((result) => {
                navigate(`/app/${workspace.slug}/concourses/${result.id}`, { replace: true });
            })
            .catch((err) => {
                creatingRef.current = false;
                setError(
                    parseApiErrorSync(
                        err,
                        t('admin.concourse.create_error', 'Failed to create concourse')
                    )
                );
            });
    }, [workspace?.slug, workspace?.title, createMutation, t, navigate, canCreate]);

    useEffect(() => {
        if (isLoading || !workspace?.slug) return;

        const first = concourses[0];
        if (first) {
            navigate(`/app/${workspace.slug}/concourses/${first.id}`, { replace: true });
            return;
        }

        // Viewers cannot create — show the empty-state message instead of
        // attempting a POST that the backend will reject with 403.
        if (canCreate) attemptCreate();
    }, [isLoading, concourses, workspace?.slug, navigate, attemptCreate, canCreate]);

    if (error) {
        return (
            <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center px-4">
                <p className="text-sm text-slate-600">{error}</p>
                <Button
                    variant="outline"
                    className="rounded-xl"
                    onClick={attemptCreate}
                    disabled={createMutation.isPending}
                >
                    {createMutation.isPending ? (
                        <Loader2 className="size-4 animate-spin mr-2" />
                    ) : (
                        <RefreshCw className="size-4 mr-2" />
                    )}
                    {t('common.retry', 'Retry')}
                </Button>
            </div>
        );
    }

    // Viewer landed on the page but no concourse exists yet and they can't
    // create one — show a clear empty state instead of an infinite spinner.
    if (!isLoading && concourses.length === 0 && !canCreate) {
        return (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center px-4">
                <p className="text-sm text-slate-600">
                    {t(
                        'admin.concourse.viewer_empty_state',
                        'No concourse yet. Ask the project owner or a member to create one.'
                    )}
                </p>
            </div>
        );
    }

    return (
        <div className="flex flex-1 flex-col items-center justify-center gap-2">
            <Loader2 className="size-6 animate-spin text-slate-400" />
            <p className="text-sm text-slate-400">
                {t('admin.concourse.loading', 'Setting up concourse...')}
            </p>
        </div>
    );
}
