/*
 * Open-Q - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

import { renderHook, act } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useDeckManagement } from './useDeckManagement';

describe('useDeckManagement', () => {
    const mockCards = [
        { id: 1, text: 'Card 1' },
        { id: 2, text: 'Longer Statement card 2' },
        {
            id: 3,
            text: 'Very very very long statement card 3 that should increase deck height significantly',
        },
    ];

    it('should initialize with disagree pile', () => {
        const { result } = renderHook(() =>
            useDeckManagement({
                agreeCards: [mockCards[0]],
                disagreeCards: [mockCards[1]],
                neutralCards: [mockCards[2]],
            })
        );

        expect(result.current.activePile).toBe('disagree');
        expect(result.current.activeCards).toEqual([mockCards[1]]);
    });

    it('should switch piles correctly', () => {
        const { result } = renderHook(() =>
            useDeckManagement({
                agreeCards: [mockCards[0]],
                disagreeCards: [mockCards[1]],
                neutralCards: [mockCards[2]],
            })
        );

        act(() => {
            result.current.setActivePile('agree');
        });

        expect(result.current.activePile).toBe('agree');
        expect(result.current.activeCards).toEqual([mockCards[0]]);

        act(() => {
            result.current.setActivePile('neutral');
        });

        expect(result.current.activePile).toBe('neutral');
        expect(result.current.activeCards).toEqual([mockCards[2]]);
    });

    it('should calculate deck height based on card text length', () => {
        const { result: lowResult } = renderHook(() =>
            useDeckManagement({
                agreeCards: [{ id: 1, text: 'short' }],
                disagreeCards: [],
                neutralCards: [],
            })
        );

        const { result: highResult } = renderHook(() =>
            useDeckManagement({
                agreeCards: [{ id: 1, text: 'a'.repeat(1000) }],
                disagreeCards: [],
                neutralCards: [],
            })
        );

        // lowResult should be around 220 + (5/50)*20 = 222 -> clamped to 280
        // highResult should be around 220 + (1000/50)*20 = 220 + 400 = 620 -> clamped to 420
        expect(highResult.current.deckHeight).toBeGreaterThan(lowResult.current.deckHeight);
        expect(highResult.current.deckHeight).toBe(420);
        expect(lowResult.current.deckHeight).toBe(280);
    });

    it('should maintain zonal focus state', () => {
        const { result } = renderHook(() =>
            useDeckManagement({
                agreeCards: [],
                disagreeCards: [],
                neutralCards: [],
            })
        );

        expect(result.current.hasPerformedZonalFocus).toBe(false);

        act(() => {
            result.current.setHasPerformedZonalFocus(true);
        });

        expect(result.current.hasPerformedZonalFocus).toBe(true);
    });
});
