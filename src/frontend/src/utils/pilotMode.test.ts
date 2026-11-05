import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isPilot, isPilotSession, leavePilot, restartPilot } from './pilotMode';

const FLAG = 'qualis-pilot-mode';

describe('pilotMode', () => {
    beforeEach(() => {
        sessionStorage.clear();
        localStorage.clear();
    });
    afterEach(() => {
        vi.restoreAllMocks();
        window.history.replaceState({}, '', '/');
    });

    it('a real link sets no flag', () => {
        window.history.replaceState({}, '', '/study/s?lang=fi&token=abc');
        expect(isPilot()).toBe(false);
        expect(isPilotSession(false)).toBe(false);
        expect(sessionStorage.getItem(FLAG)).toBeNull();
    });

    it('stays a test when the flag cannot be written', () => {
        window.history.replaceState({}, '', '/study/s?mode=test');
        vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
            throw new Error('blocked');
        });
        expect(isPilot()).toBe(true);
    });

    it.each([
        ['the store', true, '/study/s', false],
        ['the URL', false, '/study/s?mode=test', false],
        ['the tab flag', false, '/study/s', true],
    ])('a session counts as a test on %s alone', (_source, store, url, flag) => {
        window.history.replaceState({}, '', url);
        if (flag) sessionStorage.setItem(FLAG, 'true');
        expect(isPilotSession(store)).toBe(true);
    });

    it('Leave the test clears the flag and reloads the real link', () => {
        const assign = vi.spyOn(window.location, 'assign').mockImplementation(() => {});
        window.history.replaceState({}, '', '/study/s/fine-sort?mode=test&lang=fi');
        sessionStorage.setItem(FLAG, 'true');
        localStorage.setItem('qualis-pilot-session:s', '{"state":{"token":"pilot-token"}}');
        localStorage.setItem('qualis-pilot-responses:s', '{"state":{}}');
        localStorage.setItem('qualis-session:s', '{"state":{"token":"real-token"}}');

        leavePilot('s');

        expect(sessionStorage.getItem(FLAG)).toBeNull();
        expect(localStorage.getItem('qualis-pilot-session:s')).toBeNull();
        expect(localStorage.getItem('qualis-pilot-responses:s')).toBeNull();
        expect(localStorage.getItem('qualis-session:s')).not.toBeNull();
        expect(assign).toHaveBeenCalledWith('/study/s');
    });

    it('Start the test again asks for the pilot reset, stays a test, removes no flag', () => {
        const assign = vi.spyOn(window.location, 'assign').mockImplementation(() => {});
        sessionStorage.setItem(FLAG, 'true');
        localStorage.setItem('qualis-pilot-responses:s', '{"state":{}}');

        restartPilot('s', '?lang=fi');

        expect(localStorage.getItem('qualis-pilot-reset-s')).toBe('true');
        expect(sessionStorage.getItem(FLAG)).toBe('true');
        // The wipe itself belongs to the reset path in useStudyConfig, run by the reload.
        expect(localStorage.getItem('qualis-pilot-responses:s')).not.toBeNull();
        expect(assign).toHaveBeenCalledWith('/study/s?lang=fi&mode=test');
    });

    it('the reads that run while the page unloads cannot undo Leave the test', () => {
        vi.spyOn(window.location, 'assign').mockImplementation(() => {});
        window.history.replaceState({}, '', '/study/s/fine-sort?mode=test');
        sessionStorage.setItem(FLAG, 'true');

        leavePilot('s');

        // The URL still says test until the browser has navigated: no write may slip out...
        expect(isPilotSession(false)).toBe(true);
        // ...and that read must not re-arm the tab, or the reload would land in the test again.
        expect(sessionStorage.getItem(FLAG)).toBeNull();
    });
});
