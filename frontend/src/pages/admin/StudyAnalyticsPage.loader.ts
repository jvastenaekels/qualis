import type { LoaderFunction } from 'react-router-dom';
import { getStudyDumpApiAdminStudiesSlugDumpGet } from '@/api/generated';

export const studyAnalyticsPageLoader: LoaderFunction = async ({ params }) => {
    const { slug } = params;
    if (!slug) throw new Error('Slug is required');

    try {
        const dump = await getStudyDumpApiAdminStudiesSlugDumpGet(slug);
        return { dump, slug };
    } catch (error) {
        console.error('Failed to fetch study analytics dump:', error);
        throw error;
    }
};
