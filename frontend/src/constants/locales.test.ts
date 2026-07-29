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

    /**
     * The English files are the source locale and the fallback every other locale
     * lands on, so a typo there is the one typo that reaches every participant.
     *
     * Found by the 2026-07-29 UX audit: `welcome.consent.label` read "I confirm that
     * i have read the above information and consent to the processing of my data" —
     * in the sentence a participant ticks to consent to data processing. All eight
     * translations were correct; only the source was wrong, which is exactly the
     * shape no parity check can see. `check_i18n.py` compares locales against each
     * other, so a defect present in one file and absent from the rest is invisible
     * to it, and a defect in English alone is invisible to a reader of any other
     * language.
     *
     * This asserts the class, not the instance: a standalone lowercase "i" as a
     * word. English has no such word.
     */
    it('never writes the English first-person pronoun in lower case', () => {
        const offenders: string[] = [];

        const walk = (node: unknown, trail: string, file: string) => {
            if (typeof node === 'string') {
                if (/(^|[^\p{L}'’])i([^\p{L}'’]|$)/u.test(node)) {
                    offenders.push(`${file} → ${trail}: ${node.slice(0, 80)}`);
                }
                return;
            }
            if (node && typeof node === 'object') {
                for (const [key, value] of Object.entries(node)) {
                    walk(value, trail ? `${trail}.${key}` : key, file);
                }
            }
        };

        for (const namespace of ['participant.json', 'admin.json']) {
            const file = path.join(localesDir, 'en', namespace);
            if (!fs.existsSync(file)) continue;
            walk(JSON.parse(fs.readFileSync(file, 'utf-8')), '', `en/${namespace}`);
        }

        expect(offenders).toEqual([]);
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
