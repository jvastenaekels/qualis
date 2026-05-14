import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { SUPPORTED_LANGUAGES } from './languages';

const thisDir = path.dirname(fileURLToPath(import.meta.url));
const localesDir = path.resolve(thisDir, '../../public/locales');

describe('locale resources', () => {
    it('has a participant.json for each supported language (mandatory)', () => {
        const missing = SUPPORTED_LANGUAGES.filter(
            ({ code }) => !fs.existsSync(path.join(localesDir, code, 'participant.json'))
        ).map(({ code }) => code);

        expect(missing).toEqual([]);
    });

    it('admin.json is optional but, if present, must be valid JSON', () => {
        for (const { code } of SUPPORTED_LANGUAGES) {
            const adminPath = path.join(localesDir, code, 'admin.json');
            if (!fs.existsSync(adminPath)) {
                continue; // best-effort: locale may legitimately skip admin
            }
            expect(() => JSON.parse(fs.readFileSync(adminPath, 'utf-8'))).not.toThrow();
        }
    });
});
