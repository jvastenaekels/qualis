/**
 * Global Setup for Playwright E2E Tests
 * Ensures backend is ready and database is initialized
 */

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

    // Initialize test database
    console.log('🗄️  Initializing test database...');
    try {
        await fetch(`${backendUrl}/api/test/init`, {
            method: 'POST',
        });
        console.log('✅ Database initialized');
    } catch (error) {
        console.warn('⚠️  Database init failed (may already be initialized):', error);
    }

    console.log('✅ E2E test environment ready!');
}

export default globalSetup;
