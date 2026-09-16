/*
 * Qualis - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

/**
 * DynamicIcon resolves a researcher-configured step icon by name.
 *
 * It used to do so with `import * as LucideIcons from 'lucide-react'`, a
 * namespace import that defeats tree-shaking and ships the whole icon set
 * in the chunk that renders the participant welcome page. It now resolves
 * from a finite registry. Two things must hold for that to be safe:
 *
 * - every name the application itself writes into `process_steps[].icon`
 *   (frontend and backend defaults, the "new step" placeholder) resolves to
 *   its real icon, not the fallback — `MessageSquare` in particular is a
 *   backend default that the picker's own list never contained;
 * - the component keeps its unknown-name fallback.
 */

import { render } from '@testing-library/react';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEFAULT_STUDY_CONTENT } from '../constants/studyDefaults';
import { STEP_ICONS } from '../constants/stepIcons';
import { DynamicIcon } from './DynamicIcon';

const ROOT = resolve(__dirname, '../../../..');

function lucideClass(container: HTMLElement): string {
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    return svg?.getAttribute('class') ?? '';
}

describe('DynamicIcon', () => {
    it('renders the named icon', () => {
        const { container } = render(<DynamicIcon name="MessageSquare" />);
        expect(lucideClass(container)).toContain('lucide-message-square');
    });

    it('falls back to the help icon for an unknown name', () => {
        const { container } = render(<DynamicIcon name="NoSuchIcon" />);
        expect(lucideClass(container)).toContain('lucide-circle-question-mark');
    });

    it('nothing in src/ imports the whole lucide-react barrel', () => {
        // One namespace import anywhere is enough for the bundler to keep
        // all ~1 700 icons in a chunk shared with the participant entry;
        // ProcessStepEditor had a second one that a fix to this file alone
        // did not change by a single byte.
        const offenders = execFileSync(
            'grep',
            [
                '-rlE',
                String.raw`import\s+\*\s+as\s+\w+\s+from\s+['"]lucide-react['"]`,
                resolve(__dirname, '..'),
            ],
            { encoding: 'utf8' }
        )
            .split('\n')
            .filter(Boolean)
            .filter((f) => !f.endsWith('.test.tsx') && !f.endsWith('.test.ts'));
        expect(offenders).toEqual([]);
    });
});

describe('STEP_ICONS registry', () => {
    it('covers every icon name the frontend defaults write', () => {
        const names = new Set<string>();
        for (const locale of Object.values(DEFAULT_STUDY_CONTENT)) {
            for (const step of locale.process_steps ?? []) names.add(step.icon);
        }
        names.add('Circle'); // ProcessStepEditor's placeholder for a new step
        for (const name of names) {
            expect(
                STEP_ICONS,
                `icon "${name}" is written by the app but not registered`
            ).toHaveProperty(name);
        }
    });

    it('covers every icon name the backend seeds by default', () => {
        const py = readFileSync(
            resolve(ROOT, 'src/backend/app/services/study_defaults.py'),
            'utf8'
        );
        const names = new Set([...py.matchAll(/"icon":\s*"([A-Za-z]+)"/g)].map((m) => m[1]));
        expect(names.size).toBeGreaterThan(0);
        for (const name of names) {
            expect(
                STEP_ICONS,
                `backend seeds icon "${name}" but the registry lacks it`
            ).toHaveProperty(name);
        }
    });
});
