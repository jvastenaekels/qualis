import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { SUPPORTED_LANGUAGES } from './languages';

const thisDir = path.dirname(fileURLToPath(import.meta.url));
const localesDir = path.resolve(thisDir, '../../public/locales');

describe('locale resources', () => {
    it('has a translation file for each supported language', () => {
        const missingLanguages = SUPPORTED_LANGUAGES.filter(
            ({ code }) => !fs.existsSync(path.join(localesDir, code, 'translation.json'))
        ).map(({ code }) => code);

        expect(missingLanguages).toEqual([]);
    });
});
