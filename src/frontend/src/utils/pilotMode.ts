import { safeBrowserLocalStorage, safeBrowserSessionStorage } from '../store/safeStorage';

const PILOT_FLAG = 'qualis-pilot-mode';

/** The config error of a test link that has no draft in this browser: refuse, never load the live study. */
export const PILOT_NO_DRAFT = 'pilot.no_draft';

const urlSaysTest = (): boolean =>
    new URLSearchParams(window.location.search).get('mode') === 'test';

const tabIsFlagged = (): boolean => safeBrowserSessionStorage.getItem(PILOT_FLAG) === 'true';

/** Arms the tab when the URL says test. Writes the flag: not for code that runs on unload. */
export const isPilot = (): boolean => {
    if (urlSaysTest()) {
        safeBrowserSessionStorage.setItem(PILOT_FLAG, 'true');
        return true;
    }
    return tabIsFlagged();
};

/**
 * What every write to the server asks first. Read-only: the page keeps running between
 * leavePilot() and the unload, and a read that armed the tab would bring the test back.
 * Takes the store's value because the stores import this module.
 */
export const isPilotSession = (isPilotMode: boolean): boolean =>
    isPilotMode || urlSaysTest() || tabIsFlagged();

/**
 * The only exit from a test. A full reload, because the store names are fixed at module
 * load. The store's isPilotMode stays true on purpose: writes stay off until the unload.
 */
export const leavePilot = (slug: string): void => {
    safeBrowserSessionStorage.removeItem(PILOT_FLAG);
    safeBrowserLocalStorage.removeItem(`qualis-pilot-session:${slug}`);
    safeBrowserLocalStorage.removeItem(`qualis-pilot-responses:${slug}`);
    window.location.assign(`/study/${slug}`);
};

/**
 * Start the test again: the same pilot reset signal a new Test run sends, then a reload.
 * The next load wipes the test's own progress, reads the latest draft, and writes nothing to
 * the server. The tab flag stays: leavePilot is the only way out of a test.
 */
export const restartPilot = (slug: string, search: string): void => {
    safeBrowserLocalStorage.setItem(`qualis-pilot-reset-${slug}`, 'true');
    window.location.assign(`/study/${slug}${withTestMode(search)}`);
};

/** `mode=test` added to a query string, every other parameter kept. */
export const withTestMode = (search: string): string => {
    const params = new URLSearchParams(search);
    params.set('mode', 'test');
    return `?${params}`;
};
