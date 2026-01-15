import {
    getStudyStatsApiAdminStudiesSlugStatsGet,
    listStudyParticipantsApiAdminStudiesSlugParticipantsGet,
    getStudyApiAdminStudiesSlugGet,
    getGetStudyStatsApiAdminStudiesSlugStatsGetQueryKey,
    getListStudyParticipantsApiAdminStudiesSlugParticipantsGetQueryKey,
    getGetStudyApiAdminStudiesSlugGetQueryKey,
} from '@/api/generated';
import { queryClient } from '@/lib/queryClient';
import { type LoaderFunctionArgs, redirect } from 'react-router-dom';

export const studyOverviewPageLoader = async ({ params }: LoaderFunctionArgs) => {
    const { slug } = params;
    if (!slug) throw new Error('Slug is required');

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
        // If study is not found, clear the active study in store to prevent infinite redirects
        // and redirect to the dashboard
        import('@/store/useAdminStore').then(({ useAdminStore }) => {
            useAdminStore.getState().setActiveStudy(null);
        });

        throw redirect('/admin');
    }
};
