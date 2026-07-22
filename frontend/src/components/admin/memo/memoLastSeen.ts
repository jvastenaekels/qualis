/*
 * Qualis - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

import { safeBrowserLocalStorage } from '@/store/safeStorage';

const STORAGE_KEY = (userId: number, parentType: string, parentId: number): string =>
    `memo-last-seen:${userId}:${parentType}:${parentId}`;

export function getLastSeen(userId: number, parentType: string, parentId: number): string {
    return (
        safeBrowserLocalStorage.getItem(STORAGE_KEY(userId, parentType, parentId)) ??
        '1970-01-01T00:00:00Z'
    );
}

export function bumpLastSeen(userId: number, parentType: string, parentId: number): void {
    safeBrowserLocalStorage.setItem(
        STORAGE_KEY(userId, parentType, parentId),
        new Date().toISOString()
    );
}
