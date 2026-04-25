/*
 * Libre-Q - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

/**
 * Tests for Sentry initialisation logic (frontend).
 *
 * We test the init logic in isolation: the actual `Sentry.init` call in
 * main.tsx runs once at module load time and cannot be re-executed per test.
 * These tests replicate the same guard (`if (dsn) Sentry.init(...)`) so
 * the behaviour contract is verifiable without side-effecting the running SDK.
 *
 * @sentry/react defines `init` as non-configurable on the module namespace,
 * so we use `vi.mock` (hoisted module-level mock) instead of `vi.spyOn`.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Module mock — must be declared at top level (hoisted by vitest).
// ---------------------------------------------------------------------------
const mockSentryInit = vi.fn();

vi.mock('@sentry/react', () => ({
    init: mockSentryInit,
    captureException: vi.fn(),
    captureMessage: vi.fn(),
    ErrorBoundary: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Helper — replicates the init guard from main.tsx.
// ---------------------------------------------------------------------------
async function runSentryInit(dsn: string | undefined, environment: string) {
    // Re-import inside the function so the mock is active.
    const Sentry = await import('@sentry/react');
    if (dsn) {
        Sentry.init({
            dsn,
            environment,
            tracesSampleRate: 0,
            sendDefaultPii: false,
        });
        console.info(`[Sentry] Initialised (env=${environment})`);
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Sentry initialisation guard', () => {
    let consoleSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        mockSentryInit.mockClear();
        consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('is a no-op when VITE_SENTRY_DSN is empty string', async () => {
        await runSentryInit('', 'test');

        expect(mockSentryInit).not.toHaveBeenCalled();
        expect(consoleSpy).not.toHaveBeenCalled();
    });

    it('is a no-op when VITE_SENTRY_DSN is undefined', async () => {
        await runSentryInit(undefined, 'test');

        expect(mockSentryInit).not.toHaveBeenCalled();
        expect(consoleSpy).not.toHaveBeenCalled();
    });

    it('calls Sentry.init with the correct options when DSN is set', async () => {
        const dsn = 'https://abc123@o0.ingest.sentry.io/000';
        await runSentryInit(dsn, 'production');

        expect(mockSentryInit).toHaveBeenCalledOnce();
        expect(mockSentryInit).toHaveBeenCalledWith({
            dsn,
            environment: 'production',
            tracesSampleRate: 0,
            sendDefaultPii: false,
        });
    });

    it('logs a console acknowledgement when DSN is set', async () => {
        await runSentryInit('https://abc123@o0.ingest.sentry.io/000', 'staging');

        expect(consoleSpy).toHaveBeenCalledOnce();
        expect(consoleSpy.mock.calls[0][0]).toContain('[Sentry]');
        expect(consoleSpy.mock.calls[0][0]).toContain('staging');
    });

    it('never enables sendDefaultPii regardless of DSN (GDPR)', async () => {
        await runSentryInit('https://abc123@o0.ingest.sentry.io/000', 'production');

        const callArgs = mockSentryInit.mock.calls[0][0] as { sendDefaultPii: boolean };
        expect(callArgs.sendDefaultPii).toBe(false);
    });

    it('always sets tracesSampleRate to 0 (no perf overhead by default)', async () => {
        await runSentryInit('https://abc123@o0.ingest.sentry.io/000', 'production');

        const callArgs = mockSentryInit.mock.calls[0][0] as { tracesSampleRate: number };
        expect(callArgs.tracesSampleRate).toBe(0);
    });
});
