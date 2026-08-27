import type { LoaderFunctionArgs } from 'react-router-dom';

// Simplified loader - project API endpoints exist but don't have individual query options
// The frontend can fetch project data using the useXXX hooks instead
export const projectSettingsPageLoader = async ({ params }: LoaderFunctionArgs) => {
    const slug = params.slug || params.projectSlug;
    if (!slug) throw new Error('Project slug is required');

    // The project data will be fetched by the component using hooks
    // No prefetching needed since the data loads quickly
    return { slug };
};
