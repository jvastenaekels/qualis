import type { LoaderFunctionArgs } from 'react-router-dom';

// Simplified loader - workspace API endpoints exist but don't have individual query options
// The frontend can fetch workspace data using the useXXX hooks instead
export const workspaceSettingsPageLoader = async ({ params }: LoaderFunctionArgs) => {
    const { slug } = params;
    if (!slug) throw new Error('Workspace slug is required');

    // The workspace data will be fetched by the component using hooks
    // No prefetching needed since the data loads quickly
    return { slug };
};
