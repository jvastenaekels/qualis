import { describe, expect, it } from 'vitest';
import { studyLayoutShouldRevalidate } from './StudyLayout.loader';

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
