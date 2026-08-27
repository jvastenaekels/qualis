import {
    listStudyParticipantsApiAdminStudiesSlugParticipantsGet,
    getListStudyParticipantsApiAdminStudiesSlugParticipantsGetQueryKey,
} from '@/api/generated';
import { queryClient } from '@/lib/queryClient';
import type { LoaderFunctionArgs } from 'react-router-dom';

export const dataExportsPageLoader = async ({ params }: LoaderFunctionArgs) => {
    const slug = params.slug || params.studySlug || params.projectSlug;
    if (!slug) throw new Error('Slug is required (Data Exports)');

    try {
        const response = await queryClient.fetchQuery({
            queryKey: getListStudyParticipantsApiAdminStudiesSlugParticipantsGetQueryKey(slug),
            queryFn: () => listStudyParticipantsApiAdminStudiesSlugParticipantsGet(slug),
        });

        return { participants: response.items, slug };
    } catch (error) {
        console.error('Failed to load export data:', error);
        return { participants: [], slug };
    }
};
