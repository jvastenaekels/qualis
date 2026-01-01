import { useGetStudyApiStudySlugGet } from '../api/generated';
import type { StudyConfig } from '../schemas/study';

export const useGetStudyConfig = (slug?: string, language?: string) => {
    return useGetStudyApiStudySlugGet<StudyConfig>(
        slug!,
        { lang: language },
        {
            query: {
                enabled: !!slug,
                staleTime: 1000 * 60 * 30, // 30 minutes
                retry: 1,
            },
        }
    );
};
