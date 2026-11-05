import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getStudyApiStudySlugGet } from '@/api/generated';
import { queryClient } from '@/lib/queryClient';
import { studyLayoutLoader, studyLayoutShouldRevalidate } from './StudyLayout.loader';

vi.mock('@/api/generated', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/api/generated')>()),
    getStudyApiStudySlugGet: vi.fn(),
}));
vi.mock('../i18n', () => ({ default: { language: 'en', changeLanguage: vi.fn() } }));

const runLoader = (url: string) =>
    studyLayoutLoader({
        params: { slug: 's' },
        request: new Request(url),
        // biome-ignore lint/suspicious/noExplicitAny: only params and request are read
    } as any);

describe('studyLayoutLoader', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        queryClient.clear();
        sessionStorage.clear();
        window.history.replaceState({}, '', '/');
        vi.mocked(getStudyApiStudySlugGet).mockResolvedValue({
            data: { slug: 's', available_languages: ['en'], language: 'en' },
            // biome-ignore lint/suspicious/noExplicitAny: Orval response wrapper
        } as any);
    });

    it('a real link still fetches the study', async () => {
        const { study } = await runLoader('http://localhost/study/s/welcome?token=abc');
        expect(getStudyApiStudySlugGet).toHaveBeenCalledTimes(1);
        expect(study).toMatchObject({ slug: 's' });
    });

    it('a test link fetches nothing, whatever window.location says yet', async () => {
        const result = await runLoader('http://localhost/study/s/welcome?mode=test&lang=fi');
        expect(getStudyApiStudySlugGet).not.toHaveBeenCalled();
        expect(result).toEqual({ study: null, slug: 's' });
    });

    it('a flagged tab fetches nothing even when the URL lost mode=test', async () => {
        sessionStorage.setItem('qualis-pilot-mode', 'true');
        const result = await runLoader('http://localhost/study/s/welcome');
        expect(getStudyApiStudySlugGet).not.toHaveBeenCalled();
        expect(result).toEqual({ study: null, slug: 's' });
    });

    it('reading the tab never arms it', async () => {
        await runLoader('http://localhost/study/s/welcome?mode=test');
        expect(sessionStorage.getItem('qualis-pilot-mode')).toBeNull();
    });
});

describe('studyLayoutShouldRevalidate', () => {
    it('a different slug revalidates', () => {
        expect(
            studyLayoutShouldRevalidate({
                currentParams: { slug: 'study-a' },
                nextParams: { slug: 'study-b' },
            })
        ).toBe(true);
    });

    it('the same slug does not, whatever happened to the query string', () => {
        expect(
            studyLayoutShouldRevalidate({
                currentParams: { slug: 'study-a' },
                nextParams: { slug: 'study-a' },
            })
        ).toBe(false);
    });
});
