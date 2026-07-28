/**
 * Global Setup for Playwright E2E Tests
 * Ensures backend is ready and database is initialized
 */

/**
 * Prove the test router is mounted before anything relies on it.
 *
 * `main.py` mounts it only when `settings.ENVIRONMENT in ["test", "development"]`,
 * and `ENVIRONMENT` defaults to `"production"`. When it is absent every
 * `/api/test/*` call fails — and this file used to swallow that: the cleanup
 * logged a warning and continued, and the init never checked its response at
 * all, printing "✅ Database initialized" on a 404. The suite then announced
 * "✅ E2E test environment ready!" and every spec failed downstream on missing
 * data, pointing anywhere but here.
 *
 * Probe with GET, not POST: the SPA middleware answers unknown POST paths with
 * 405, so a POST cannot distinguish "router absent" from "wrong method".
 * GET /api/test/health returns a clean 404 when unmounted.
 */
async function assertTestRouterMounted(backendUrl: string): Promise<void> {
    console.log('🔎 Checking the test router is mounted...');

    let probe: Response;
    try {
        probe = await fetch(`${backendUrl}/api/test/health`);
    } catch (error) {
        throw new Error(
            `Could not reach ${backendUrl}/api/test/health: ${error}\n` +
                'The backend answered /health, so it is running but unreachable on this route.'
        );
    }

    if (!probe.ok) {
        throw new Error(
            `The test router is not mounted (GET /api/test/health returned ${probe.status}).\n\n` +
                'The backend must run with ENVIRONMENT=test (or development) — main.py gates\n' +
                'include_router(test_router) on it, and ENVIRONMENT defaults to "production".\n' +
                'TESTING=true does NOT mount it; that variable only disables the rate limiter.\n\n' +
                'If Playwright started the server, playwright.config.ts webServer.env should set\n' +
                'ENVIRONMENT: "test". If you started it yourself, restart it with that variable —\n' +
                'note reuseExistingServer:true means Playwright will happily reuse a server that\n' +
                'was started without it.'
        );
    }

    console.log('✅ Test router mounted');
}

async function globalSetup() {
    const backendUrl = process.env.API_BASE_URL || 'http://localhost:8000';
    const maxRetries = 30;
    const retryDelay = 2000;

    console.log('🚀 Starting E2E test environment setup...');

    // Wait for backend to be ready
    console.log('⏳ Waiting for backend to be ready...');
    for (let i = 0; i < maxRetries; i++) {
        try {
            const response = await fetch(`${backendUrl}/health`);
            if (response.ok) {
                console.log('✅ Backend is ready');
                break;
            }
        } catch (_error) {
            if (i === maxRetries - 1) {
                console.error('❌ Backend failed to start');
                throw new Error('Backend not ready after maximum retries');
            }
            await new Promise((resolve) => setTimeout(resolve, retryDelay));
        }
    }

    await assertTestRouterMounted(backendUrl);

    // Clean up stale data from previous runs
    console.log('🧹 Cleaning up stale data from previous runs...');
    try {
        const cleanupRes = await fetch(`${backendUrl}/api/test/cleanup-all`, {
            method: 'POST',
        });
        if (cleanupRes.ok) {
            console.log('✅ Previous data cleaned up');
        } else {
            // Tolerated: the router is mounted (proven above), so a non-OK here
            // is a data-state problem, not a wiring one — an empty database is
            // the common case and is harmless.
            console.warn(`⚠️  Cleanup returned ${cleanupRes.status} (continuing anyway)`);
        }
    } catch (error) {
        console.warn('⚠️  Cleanup failed (continuing anyway):', error);
    }

    // Initialize test database
    console.log('🗄️  Initializing test database...');
    try {
        const initRes = await fetch(`${backendUrl}/api/test/init`, {
            method: 'POST',
        });
        // Not tolerated: every spec depends on this having run. The previous
        // version discarded this response and printed success unconditionally.
        if (!initRes.ok) {
            throw new Error(
                `POST /api/test/init returned ${initRes.status}: ${await initRes.text()}`
            );
        }
        console.log('✅ Database initialized');
    } catch (error) {
        throw new Error(
            `Test database initialization failed: ${error}\n` +
                'Every spec depends on this; continuing would fail them all with unrelated errors.'
        );
    }

    console.log('✅ E2E test environment ready!');
}

export default globalSetup;
