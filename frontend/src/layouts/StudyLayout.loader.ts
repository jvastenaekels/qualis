import { getStudyApiStudySlugGet, getGetStudyApiStudySlugGetQueryKey } from '@/api/generated';
import { queryClient } from '@/lib/queryClient';
import type { LoaderFunctionArgs } from 'react-router-dom';

export const studyLayoutLoader = async ({ params, request }: LoaderFunctionArgs) => {
    const { slug } = params;
    if (!slug) throw new Error('Slug is required');

    const url = new URL(request.url);
    const lang = url.searchParams.get('lang') || undefined;
    const token = url.searchParams.get('token') || undefined;

    const queryParams = {
        lang,
        link_token: token,
    };

    // Fetch and cache the data
    const response = await queryClient.fetchQuery({
        queryKey: getGetStudyApiStudySlugGetQueryKey(slug, queryParams),
        queryFn: () => getStudyApiStudySlugGet(slug, queryParams),
    });

    // biome-ignore lint/suspicious/noExplicitAny: Unwrap Orval response
    const study = (response as any).data || response;

    return {
        study,
        slug,
    };
};
