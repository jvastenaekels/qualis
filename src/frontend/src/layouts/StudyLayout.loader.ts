import { getStudyApiStudySlugGet, getGetStudyApiStudySlugGetQueryKey } from '@/api/generated';
import i18n from '../i18n';
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

    // If study has exactly one language, force it immediately to prevent flash of default language
    if (study.available_languages?.length === 1) {
        const lang = study.available_languages[0];
        if (i18n.language !== lang) {
            await i18n.changeLanguage(lang);
        }
    }

    return {
        study,
        slug,
    };
};
