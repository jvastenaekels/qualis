import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
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

    useEffect(() => {
        if (isLoading || !workspace?.slug) return;

        if (concourses.length > 0) {
            navigate(`/app/${workspace.slug}/concourses/${concourses[0].id}`, { replace: true });
            return;
        }

        if (creatingRef.current || createMutation.isPending) return;
        creatingRef.current = true;

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
                toast.error(
                    parseApiErrorSync(
                        err,
                        t('admin.concourse.create_error', 'Failed to create concourse')
                    )
                );
            });
    }, [isLoading, concourses, workspace?.slug, navigate, t, createMutation]);

    return (
        <div className="flex flex-1 items-center justify-center">
            <Loader2 className="size-6 animate-spin text-slate-400" />
        </div>
    );
}
