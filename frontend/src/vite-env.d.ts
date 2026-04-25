/*
 * Libre-Q - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

/// <reference types="vite/client" />

interface ImportMetaEnv {
    /**
     * Sentry DSN for frontend error reporting.
     * Leave empty (or unset) to disable Sentry — no-op in dev by default.
     * Set at build time via VITE_SENTRY_DSN environment variable.
     * GDPR: send_default_pii is always false; no participant IPs/emails forwarded.
     */
    readonly VITE_SENTRY_DSN: string | undefined;

    /**
     * Runtime environment name forwarded to Sentry as the "environment" tag.
     * Falls back to import.meta.env.MODE ("development" | "production" | "test").
     * Set at build time via VITE_ENVIRONMENT environment variable.
     */
    readonly VITE_ENVIRONMENT: string | undefined;
}

interface ImportMeta {
    readonly env: ImportMetaEnv;
}
