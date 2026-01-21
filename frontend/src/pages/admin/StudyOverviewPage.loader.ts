import {
    getStudyStatsApiAdminStudiesSlugStatsGet,
    listStudyParticipantsApiAdminStudiesSlugParticipantsGet,
    getStudyApiAdminStudiesSlugGet,
    getGetStudyStatsApiAdminStudiesSlugStatsGetQueryKey,
    getListStudyParticipantsApiAdminStudiesSlugParticipantsGetQueryKey,
    getGetStudyApiAdminStudiesSlugGetQueryKey,
} from '@/api/generated';
import { queryClient } from '@/lib/queryClient';
import { useAdminStore } from '@/store/useAdminStore';
import { type LoaderFunctionArgs, redirect } from 'react-router-dom';

export const studyOverviewPageLoader = async ({ params }: LoaderFunctionArgs) => {
    const slug = params.slug || params.studySlug || params.workspaceSlug;
    if (!slug) throw new Error('Slug is required (Study Overview)');

    try {
        // Pre-fetch all data in parallel
        const [stats, participants, study] = await Promise.all([
            queryClient.fetchQuery({
                queryKey: getGetStudyStatsApiAdminStudiesSlugStatsGetQueryKey(slug),
                queryFn: () => getStudyStatsApiAdminStudiesSlugStatsGet(slug),
            }),
            queryClient.fetchQuery({
                queryKey: getListStudyParticipantsApiAdminStudiesSlugParticipantsGetQueryKey(slug),
                queryFn: () => listStudyParticipantsApiAdminStudiesSlugParticipantsGet(slug),
            }),
            queryClient.fetchQuery({
                queryKey: getGetStudyApiAdminStudiesSlugGetQueryKey(slug),
                queryFn: () => getStudyApiAdminStudiesSlugGet(slug),
            }),
        ]);

        return { stats, participants, study, slug };
    } catch (error) {
        console.error('Failed to load study overview:', error);

        // Synchronously clear the active study in store to prevent infinite redirects
        // before we move away from this route.
        useAdminStore.getState().setActiveStudy(null);

        throw redirect('/admin');
    }
};
