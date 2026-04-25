import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAdminContext } from '@/hooks/useAdminContext';
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

    const { data, isLoading } = useListConcoursesApiAdminConcoursesGet();
    const concourses = data?.items ?? [];

    const createMutation = useCreateConcourseApiAdminConcoursesPost();
    const creatingRef = useRef(false);
    const [error, setError] = useState<string | null>(null);

    const attemptCreate = useCallback(() => {
        if (creatingRef.current || createMutation.isPending || !workspace?.slug) return;
        creatingRef.current = true;
        setError(null);

        createMutation
            .mutateAsync({
                data: {
                    title: t('admin.concourse.default_title', 'Concourse'),
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
    }, [workspace?.slug, createMutation, t, navigate]);

    useEffect(() => {
        if (isLoading || !workspace?.slug) return;

        const first = concourses[0];
        if (first) {
            navigate(`/app/${workspace.slug}/concourses/${first.id}`, { replace: true });
            return;
        }

        attemptCreate();
    }, [isLoading, concourses, workspace?.slug, navigate, attemptCreate]);

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

    return (
        <div className="flex flex-1 flex-col items-center justify-center gap-2">
            <Loader2 className="size-6 animate-spin text-slate-400" />
            <p className="text-sm text-slate-400">
                {t('admin.concourse.loading', 'Setting up concourse...')}
            </p>
        </div>
    );
}
