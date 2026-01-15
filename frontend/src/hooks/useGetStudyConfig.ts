import { useGetStudyApiStudySlugGet } from '../api/generated';
import type { StudyConfig } from '../schemas/study';

export const useGetStudyConfig = (
    slug?: string,
    language?: string,
    // biome-ignore lint/suspicious/noExplicitAny: generic options
    options: any = {},
    password?: string
) => {
    const searchParams = new URLSearchParams(window.location.search);
    const linkToken = searchParams.get('token') || undefined;

    return useGetStudyApiStudySlugGet<StudyConfig>(
        slug || '',
        {
            lang: language,
            link_token: linkToken,
            password: password,
        },
        {
            query: {
                enabled: !!slug,
                staleTime: 1000 * 60 * 30, // 30 minutes
                retry: 1,
                ...options,
            },
        }
    );
};
