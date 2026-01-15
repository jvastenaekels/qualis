import {
    getStudyApiAdminStudiesSlugGet,
    getGetStudyApiAdminStudiesSlugGetQueryKey,
} from '@/api/generated';
import { queryClient } from '@/lib/queryClient';
import { type LoaderFunctionArgs, redirect } from 'react-router-dom';

export const generalSettingsPageLoader = async ({ params }: LoaderFunctionArgs) => {
    const { slug } = params;
    if (!slug) throw new Error('Slug is required');

    try {
        const study = await queryClient.fetchQuery({
            queryKey: getGetStudyApiAdminStudiesSlugGetQueryKey(slug),
            queryFn: () => getStudyApiAdminStudiesSlugGet(slug),
        });

        return { study, slug };
    } catch (error) {
        console.error('Failed to load study settings:', error);
        import('@/store/useAdminStore').then(({ useAdminStore }) => {
            useAdminStore.getState().setActiveStudy(null);
        });
        throw redirect('/admin');
    }
};
