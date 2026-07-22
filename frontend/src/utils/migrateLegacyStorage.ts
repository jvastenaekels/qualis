/*
 * Qualis - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

/**
 * One-shot migration: rename localStorage and sessionStorage keys from the
 * pre-rename `libre-q-*` namespace to the post-rename `qualis-*` namespace
 * (project rename 2026-04). Idempotent — second and subsequent calls are
 * no-ops once the legacy keys are gone.
 *
 * Protected categories at time of writing:
 * - qualis-draft-backup-{slug}  (in-flight study designer recoveries)
 * - qualis-test-draft-{slug}    (cross-tab pilot synchronisation)
 * - qualis-test-config-{slug}   (study designer config snapshot)
 * - qualis-pilot-reset-{slug}   (pilot reset signal between tabs)
 * - qualis-pilot-mode           (sessionStorage flag)
 * - qualis-resumed-via-link     (sessionStorage flag)
 * - libre-q-{pilot-,}responses   (Zustand-persisted participant responses)
 *
 * The migration runs once at app boot from main.tsx, before any code reads
 * from the new namespace, so the first read on each existing key sees the
 * preserved value.
 */
const LEGACY_PREFIX = 'libre-q-';

function getAvailableStorages(): Storage[] {
    const storages: Storage[] = [];
    try {
        storages.push(localStorage);
    } catch {
        // SSR / disabled-storage environments: nothing to migrate.
    }
    try {
        storages.push(sessionStorage);
    } catch {
        // Same as above for sessionStorage.
    }

    return storages;
}

function collectLegacyKeys(storage: Storage): string[] {
    const legacyKeys: string[] = [];
    try {
        for (let i = 0; i < storage.length; i++) {
            const key = storage.key(i);
            if (key?.startsWith(LEGACY_PREFIX)) legacyKeys.push(key);
        }
    } catch {
        return [];
    }

    return legacyKeys;
}

function migrateLegacyKey(storage: Storage, oldKey: string): void {
    const newKey = `qualis-${oldKey.slice(LEGACY_PREFIX.length)}`;
    let value: string | null;

    try {
        value = storage.getItem(oldKey);
    } catch {
        return;
    }

    if (value !== null) {
        try {
            // Don't clobber: if post-migration code has already written the
            // qualis key in another tab, keep that newer value.
            if (storage.getItem(newKey) === null) {
                storage.setItem(newKey, value);
            }
        } catch {
            return;
        }
    }

    try {
        storage.removeItem(oldKey);
    } catch {
        // Best-effort cleanup only.
    }
}

export function migrateLegacyStorage(): void {
    const storages = getAvailableStorages();
    for (const storage of storages) {
        for (const oldKey of collectLegacyKeys(storage)) {
            migrateLegacyKey(storage, oldKey);
        }
    }
}
