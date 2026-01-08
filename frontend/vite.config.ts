/// <reference types="vitest" />

import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// https://vite.dev/config/
export default defineConfig({
    plugins: [
        react({
            babel: {
                plugins: ['babel-plugin-react-compiler'],
            },
        }),
    ],
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
        },
    },
    build: {
        rollupOptions: {
            output: {
                manualChunks: (id) => {
                    // 1. Isolation of Framework Core
                    if (
                        id.includes('node_modules/react') ||
                        id.includes('node_modules/react-dom') ||
                        id.includes('node_modules/react-router') ||
                        id.includes('node_modules/zustand')
                    ) {
                        return 'vendor-react-core';
                    }

                    // 2. Heavy Charts & Tables (Admin Dashboard ONLY)
                    if (
                        id.includes('node_modules/recharts') ||
                        id.includes('node_modules/d3-') ||
                        id.includes('node_modules/@tanstack/react-table')
                    ) {
                        return 'vendor-admin-charts';
                    }

                    // 3. Interactive Libraries (Participant + Admin)
                    // Grouped to avoid waterfall requests
                    if (
                        id.includes('node_modules/framer-motion') ||
                        id.includes('node_modules/@dnd-kit')
                    ) {
                        return 'vendor-interactive';
                    }

                    // 4. UI Kit (Shared)
                    if (
                        id.includes('node_modules/@radix-ui') ||
                        id.includes('node_modules/lucide-react')
                    ) {
                        return 'vendor-ui';
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
