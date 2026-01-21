import {
    listStudyLinksApiAdminRecruitmentSlugLinksGet,
    getListStudyLinksApiAdminRecruitmentSlugLinksGetQueryKey,
} from '@/api/generated';
import { queryClient } from '@/lib/queryClient';
import { type LoaderFunctionArgs, redirect } from 'react-router-dom';

export const recruitmentPageLoader = async ({ params }: LoaderFunctionArgs) => {
    const slug = params.slug || params.studySlug || params.workspaceSlug;
    if (!slug) throw new Error('Slug is required (Recruitment)');

    try {
        const links = await queryClient.fetchQuery({
            queryKey: getListStudyLinksApiAdminRecruitmentSlugLinksGetQueryKey(slug),
            queryFn: () => listStudyLinksApiAdminRecruitmentSlugLinksGet(slug),
        });
        return { links, slug };
    } catch (error) {
        console.error('Failed to load recruitment links:', error);
        import('@/store/useAdminStore').then(({ useAdminStore }) => {
            useAdminStore.getState().setActiveStudy(null);
        });
        throw redirect('/admin');
    }
};
