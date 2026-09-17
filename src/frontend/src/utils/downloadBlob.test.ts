/*
 * Qualis - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { downloadBlob, downloadUrl } from './downloadBlob';

describe('downloadBlob', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('attaches an anchor, clicks it, then removes it and revokes the URL', () => {
        const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:fake');
        const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
        const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {
            // The anchor must be in the document when clicked: some browsers
            // ignore a click on a detached anchor.
            const anchors = document.querySelectorAll('a[download="report.csv"]');
            expect(anchors.length).toBe(1);
        });

        downloadBlob(new Blob(['a,b'], { type: 'text/csv' }), 'report.csv');

        expect(create).toHaveBeenCalledTimes(1);
        expect(click).toHaveBeenCalledTimes(1);
        expect(revoke).toHaveBeenCalledWith('blob:fake');
        expect(document.querySelectorAll('a[download]').length).toBe(0);
    });

    it('downloadUrl attaches, clicks and removes without touching object URLs', () => {
        const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
        const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {
            expect(document.querySelectorAll('a[download="qr.png"]').length).toBe(1);
        });

        downloadUrl('data:image/png;base64,AAAA', 'qr.png');

        expect(click).toHaveBeenCalledTimes(1);
        expect(revoke).not.toHaveBeenCalled();
        expect(document.querySelectorAll('a[download]').length).toBe(0);
    });

    it('is the only place in src/ that builds a download anchor', async () => {
        const { execFileSync } = await import('node:child_process');
        const { resolve } = await import('node:path');
        const hits = execFileSync(
            'grep',
            ['-rln', String.raw`a\.download\s*=`, resolve(__dirname, '..')],
            { encoding: 'utf8' }
        )
            .split('\n')
            .filter(Boolean)
            .filter((f) => !f.endsWith('.test.ts') && !f.endsWith('.test.tsx'));
        expect(hits.map((f) => f.split('/src/').pop())).toEqual(['utils/downloadBlob.ts']);
    });
});
