import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
    plugins: [react()],
    test: {
        environment: 'jsdom',
        globals: true,
        setupFiles: './src/setupTests.ts',
        exclude: ['**/node_modules/**', '**/dist/**', '**/e2e/**'],
        coverage: {
            provider: 'v8',
            reporter: ['text', 'json', 'html'],
            exclude: [
                '**/node_modules/**',
                '**/dist/**',
                '**/e2e/**',
                '**/test/**',
                '**/*.config.*',
                '**/*.d.ts',
                'src/main.tsx',
                'src/vite-env.d.ts',
                'src/types/**',
            ],
            thresholds: {
                statements: 80,
                branches: 78,
                functions: 73,
                lines: 80,
            },
        },
    },
});
