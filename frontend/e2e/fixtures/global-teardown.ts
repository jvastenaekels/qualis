/**
 * Global Teardown for Playwright E2E Tests
 * Cleanup after all tests complete
 */

async function globalTeardown() {
    const backendUrl = process.env.API_BASE_URL || 'http://localhost:8000';

    console.log('🧹 Starting E2E test environment cleanup...');

    // Final cleanup
    try {
        await fetch(`${backendUrl}/api/test/cleanup-all`, {
            method: 'POST',
        });
        console.log('✅ Test environment cleaned up');
    } catch (error) {
        console.warn('⚠️  Cleanup failed:', error);
    }

    console.log('👋 E2E test environment teardown complete');
}

export default globalTeardown;
