import {
    listStudyParticipantsApiAdminStudiesSlugParticipantsGet,
    getListStudyParticipantsApiAdminStudiesSlugParticipantsGetQueryKey,
} from '@/api/generated';
import { queryClient } from '@/lib/queryClient';
import { type LoaderFunctionArgs, redirect } from 'react-router-dom';

export const dataExportsPageLoader = async ({ params }: LoaderFunctionArgs) => {
    const { slug } = params;
    if (!slug) throw new Error('Slug is required');

    try {
        const participants = await queryClient.fetchQuery({
            queryKey: getListStudyParticipantsApiAdminStudiesSlugParticipantsGetQueryKey(slug),
            queryFn: () => listStudyParticipantsApiAdminStudiesSlugParticipantsGet(slug),
        });

        return { participants, slug };
    } catch (error) {
        console.error('Failed to load export data:', error);
        import('@/store/useAdminStore').then(({ useAdminStore }) => {
            useAdminStore.getState().setActiveStudy(null);
        });
        throw redirect('/admin');
    }
};
