import { getStudyApiStudySlugGet, getGetStudyApiStudySlugGetQueryKey } from '@/api/generated';
import i18n from '../i18n';
import { browserLanguage } from '@/constants/languages';
import { queryClient } from '@/lib/queryClient';
import { isPilotSession } from '../utils/pilotMode';
import type { LoaderFunctionArgs, ShouldRevalidateFunctionArgs } from 'react-router-dom';

/**
 * Reload only for another study. Losing `?lang=` or `?token=` from the URL (consent
 * drops the token on purpose) would re-read the study in its default language.
 */
export const studyLayoutShouldRevalidate = ({
    currentParams,
    nextParams,
}: Pick<ShouldRevalidateFunctionArgs, 'currentParams' | 'nextParams'>): boolean =>
    currentParams.slug !== nextParams.slug;

export const studyLayoutLoader = async ({ params, request }: LoaderFunctionArgs) => {
    const { slug } = params;
    if (!slug) throw new Error('Slug is required');

    const url = new URL(request.url);
    // A test runs on the draft in this browser and never reads the live study. The request
    // URL, not window.location, which a client navigation has not updated yet. Read-only.
    if (url.searchParams.get('mode') === 'test' || isPilotSession(false)) {
        return { study: null, slug };
    }
    // Same request as useStudyConfig's, so the query can hit this cache. It does not
    // on a fresh visit: restoreStudySession's queryClient.clear() wipes the cache
    // first and the hook fetches again.
    const lang = url.searchParams.get('lang') || browserLanguage();
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
