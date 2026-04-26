/// <reference types="vitest" />

import path from 'node:path';
import babel from '@rolldown/plugin-babel';
import react, { reactCompilerPreset } from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// https://vite.dev/config/
export default defineConfig({
    plugins: [react(), babel({ presets: [reactCompilerPreset()] })],
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
        },
    },
    build: {
        chunkSizeWarningLimit: 1000,
        rollupOptions: {
            output: {
                manualChunks: (id) => {
                    // Force Recharts into a single chunk to prevent circular dependency warnings/errors
                    if (id.includes('node_modules/recharts')) {
                        return 'vendor-recharts';
                    }
                    // Isolate Lucide to prevent interaction issues
                    if (id.includes('node_modules/lucide-react')) {
                        return 'vendor-lucide';
                    }
                    // Core framework
                    if (
                        id.includes('node_modules/react') ||
                        id.includes('node_modules/react-dom') ||
                        id.includes('node_modules/react-router')
                    ) {
                        return 'vendor-react';
                    }
                },
            },
        },
    },
    server: {
        proxy: {
            '/api': {
                target: 'http://127.0.0.1:8000',
                changeOrigin: true,
            },
        },
    },
});
// Updated coverage thresholds
