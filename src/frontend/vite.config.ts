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
        // No manualChunks: Rolldown's own splitting beats the hand-written one.
        //
        // The previous config forced recharts, lucide-react and react into three
        // named vendor chunks. Grouping by package means one eagerly-imported
        // module drags its whole group onto the critical path — so every
        // participant opening a sort downloaded the 374 KB charting library that
        // only the admin analysis page uses, even though AnalysisPage is already
        // behind React.lazy. Measured on `npm run build`: the JS referenced from
        // index.html drops from 2700 KB to 2237 KB (-463 KB, -17%) with these
        // rules removed. Total JS across all chunks is unchanged at 4675 KB —
        // the same code, reached when it is needed instead of upfront.
        //
        // The removed rules carried comments about circular-dependency warnings
        // (recharts) and "interaction issues" (lucide). Both predate the move to
        // Vite 8 / Rolldown, and the build is clean without them. Neither symptom
        // is reproducible here — the E2E suite runs against `npm run dev`, so it
        // never exercises a production bundle. Re-add a targeted rule if either
        // resurfaces, rather than restoring the blanket grouping.
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
