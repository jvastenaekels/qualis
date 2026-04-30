/*
 * Qualis - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

/**
 * Unit tests for useRoughSortLock.
 *
 * The hook mirrors the backend lock policy: a study's rough_sort_enabled
 * toggle is locked once any participant has progressed past the consent
 * step (last_step_reached > 1). A participant who only reached step 1
 * (consent) does not lock the toggle — they can be archived/deleted by
 * the admin without losing real sort data.
 */

import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useRoughSortLock } from './useRoughSortLock';

describe('useRoughSortLock', () => {
    it('unlocked when no participants', () => {
        const { result } = renderHook(() => useRoughSortLock({ studyId: 1, participants: [] }));
        expect(result.current.locked).toBe(false);
        expect(result.current.lockedCount).toBe(0);
    });

    it('unlocked when participants only reached step 1 (consent)', () => {
        const { result } = renderHook(() =>
            useRoughSortLock({
                studyId: 1,
                participants: [
                    { last_step_reached: 1 },
                    { last_step_reached: 1 },
                    { last_step_reached: null },
                    { last_step_reached: 0 },
                ],
            })
        );
        expect(result.current.locked).toBe(false);
        expect(result.current.lockedCount).toBe(0);
    });

    it('locked when at least one participant has last_step_reached > 1', () => {
        const { result } = renderHook(() =>
            useRoughSortLock({
                studyId: 1,
                participants: [
                    { last_step_reached: 1 },
                    { last_step_reached: 2 },
                    { last_step_reached: 1 },
                ],
            })
        );
        expect(result.current.locked).toBe(true);
        expect(result.current.lockedCount).toBe(1);
    });

    it('lockedCount counts only participants past consent', () => {
        const { result } = renderHook(() =>
            useRoughSortLock({
                studyId: 1,
                participants: [
                    { last_step_reached: 1 },
                    { last_step_reached: 2 },
                    { last_step_reached: 3 },
                    { last_step_reached: 4 },
                    { last_step_reached: null },
                    { last_step_reached: 5 },
                ],
            })
        );
        expect(result.current.locked).toBe(true);
        expect(result.current.lockedCount).toBe(4);
    });
});
