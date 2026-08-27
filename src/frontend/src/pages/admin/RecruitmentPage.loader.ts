import {
    listStudyLinksApiAdminRecruitmentSlugLinksGet,
    getListStudyLinksApiAdminRecruitmentSlugLinksGetQueryKey,
    getStudyApiAdminStudiesSlugGet,
    getGetStudyApiAdminStudiesSlugGetQueryKey,
} from '@/api/generated';
import { queryClient } from '@/lib/queryClient';
import { type LoaderFunctionArgs, redirect } from 'react-router-dom';

export const recruitmentPageLoader = async ({ params }: LoaderFunctionArgs) => {
    const slug = params.studySlug;
    if (!slug) throw new Error('Slug is required (Recruitment)');

    try {
        const [links, study] = await Promise.all([
            queryClient.fetchQuery({
                queryKey: getListStudyLinksApiAdminRecruitmentSlugLinksGetQueryKey(slug),
                queryFn: () => listStudyLinksApiAdminRecruitmentSlugLinksGet(slug),
            }),
            queryClient.fetchQuery({
                queryKey: getGetStudyApiAdminStudiesSlugGetQueryKey(slug),
                queryFn: () => getStudyApiAdminStudiesSlugGet(slug),
            }),
        ]);
        return { links, study, slug };
    } catch (error) {
        console.error('Failed to load recruitment links:', error);
        import('@/store/useAdminStore').then(({ useAdminStore }) => {
            useAdminStore.getState().setActiveStudy(null);
        });
        throw redirect('/admin');
    }
};
