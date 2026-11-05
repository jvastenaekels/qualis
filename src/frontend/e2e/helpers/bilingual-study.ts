/** A study in English and Finnish, shared by the specs that take it in its second language. */

import { expect, type Page } from '@playwright/test';
import { testDataBuilders, type StudyData } from '../fixtures/test-data';

const TITLE = { en: 'English study', fi: 'Suomalainen tutkimus' };
export const STATEMENT = { en: 'Statement', fi: 'Väittämä' };
const STATEMENT_COUNT = 6;

function translation(language_code: 'en' | 'fi') {
    return {
        language_code,
        title: TITLE[language_code],
        description: `${TITLE[language_code]} description`,
        instructions: `${TITLE[language_code]} instructions`,
        objective: `${TITLE[language_code]} objective`,
        condition_of_instruction: `${TITLE[language_code]} condition`,
        consent_title: `${TITLE[language_code]} consent`,
        consent_description: `${TITLE[language_code]} consent text`,
    };
}

/** Activation wants labels per language; PreSortPage finds the fields by their English ones. */
const bothLanguages = (label: string) => ({ en: label, fi: label }) as unknown as string;

function inBothLanguages<T extends { label: string; options?: unknown[] }>(field: T): T {
    return {
        ...field,
        label: bothLanguages(field.label),
        options: (field.options as string[] | undefined)?.map((value) => ({
            value,
            label: bothLanguages(value),
        })),
    };
}

export function bilingualStudy(slug: string, overrides: Partial<StudyData> = {}) {
    return {
        ...testDataBuilders.study({
            slug,
            state: 'active',
            translations: [translation('en'), translation('fi')],
            statements: Array.from({ length: STATEMENT_COUNT }, (_, i) => ({
                code: `S${i + 1}`,
                translations: [
                    { language_code: 'en', text: `${STATEMENT.en} ${i + 1}` },
                    { language_code: 'fi', text: `${STATEMENT.fi} ${i + 1}` },
                ],
            })),
            grid_config: [
                { score: -1, capacity: 2 },
                { score: 0, capacity: 2 },
                { score: 1, capacity: 2 },
            ],
            presort_config: testDataBuilders.presortConfig({
                age: inBothLanguages(
                    testDataBuilders.presortField('number', 'Age', { required: true })
                ),
                gender: inBothLanguages(
                    testDataBuilders.presortField('select', 'Gender', {
                        required: true,
                        options: ['Male', 'Female'],
                    })
                ),
                education: inBothLanguages(
                    testDataBuilders.presortField('select', 'Education', {
                        required: true,
                        options: ['High School', 'Bachelor'],
                    })
                ),
            }),
            ...overrides,
        }),
        rough_sort_enabled: false,
    };
}

/** The page is live: not dimmed, and its content is in `lang`. */
export async function expectLanguage(page: Page, lang: 'en' | 'fi') {
    await expect(page).toHaveTitle(new RegExp(TITLE[lang]));
    await expect(page.locator('html')).toHaveAttribute('lang', lang);
    await expect(page.locator('#main-scroll-container > div').first()).not.toHaveClass(
        /pointer-events-none/
    );
}
