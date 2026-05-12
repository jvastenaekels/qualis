import { describe, expect, it } from 'vitest';

import { DEFAULT_STUDY_CONTENT } from './studyDefaults';

describe('DEFAULT_STUDY_CONTENT', () => {
    it('provides German defaults for newly created studies', () => {
        expect(DEFAULT_STUDY_CONTENT.de).toMatchObject({
            instructions: expect.stringContaining('persönlichen Standpunkt'),
            consent_title: expect.stringContaining('Einwilligung'),
            pre_instruction: expect.stringContaining('drei Stapel'),
            condition_of_instruction: expect.stringContaining('Aussagen'),
        });
        expect(DEFAULT_STUDY_CONTENT.de.process_steps).toHaveLength(4);
        expect(DEFAULT_STUDY_CONTENT.de.methodology_tips.length).toBeGreaterThan(0);
    });
});
