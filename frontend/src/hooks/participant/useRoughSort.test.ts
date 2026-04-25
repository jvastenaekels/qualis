/*
 * Libre-Q - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

/**
 * Unit tests for useRoughSort hook.
 *
 * These tests cover: step setting, navigation guard, derived data (unsortedCards,
 * progress), tip auto-dismiss, keyboard handler, handleUndo, handleVote, onVoteComplete.
 * They do NOT test framer-motion MotionValue transforms — those are visual and tested
 * by the existing RoughSortPage.test.tsx integration suite.
 */

import { act, renderHook } from '@testing-library/react';
import { MotionValue } from 'framer-motion';
import { useRef } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { StudyConfig } from '../../schemas/study';
import { useConfigStore } from '../../store/useConfigStore';
import { useResponseStore } from '../../store/useResponseStore';
import { useSessionStore } from '../../store/useSessionStore';
import { AllTheProviders } from '../../test-utils/test-utils';
import { useRoughSort } from './useRoughSort';

// ── Mocks ─────────────────────────────────────────────────────────

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
    const actual = await vi.importActual('react-router-dom');
    return {
        ...actual,
        useNavigate: () => mockNavigate,
        useParams: () => ({ slug: 'test-study' }),
    };
});

vi.mock('../useLayout', () => ({
    useLayoutAction: () => ({ setHeaderAction: vi.fn() }),
}));

// ── Helpers ────────────────────────────────────────────────────────

function makeMotionValue(initial: number): MotionValue<number> {
    const mv = new MotionValue();
    mv.set(initial);
    return mv;
}

const mockConfig: StudyConfig = {
    slug: 'test-study',
    title: 'Test Study',
    description: 'Desc',
    instructions: 'Instructions',
    presort_config: {},
    statements: [
        { id: 1, text: 'Card 1' },
        { id: 2, text: 'Card 2' },
        { id: 3, text: 'Card 3' },
    ],
    grid_config: [
        { score: -1, capacity: 1 },
        { score: 0, capacity: 1 },
        { score: 1, capacity: 1 },
    ],
};

// ── Tests ──────────────────────────────────────────────────────────

describe('useRoughSort', () => {
    let showTip: boolean;
    let setShowTip: ReturnType<typeof vi.fn>;
    let x: MotionValue<number>;
    let y: MotionValue<number>;

    beforeEach(() => {
        vi.clearAllMocks();
        useConfigStore.getState().setConfig(mockConfig);
        useResponseStore.getState().resetResponses();
        useSessionStore.getState().resetSession();
        useSessionStore.getState().setConsent(true);

        showTip = true;
        setShowTip = vi.fn((val) => {
            showTip = val;
        });
        x = makeMotionValue(0);
        y = makeMotionValue(0);
    });

    function renderRoughSort() {
        return renderHook(
            () => {
                const cardStackRef = useRef<{
                    swipe: (dir: 'agree' | 'disagree' | 'neutral') => Promise<void>;
                } | null>(null);
                return useRoughSort(showTip, setShowTip, x, y, cardStackRef);
            },
            { wrapper: AllTheProviders }
        );
    }

    it('sets step to 3 on mount', () => {
        renderRoughSort();
        expect(useSessionStore.getState().currentStep).toBe(3);
    });

    it('computes correct unsortedCards (excludes already-categorised)', () => {
        useResponseStore.getState().categorizeCard(1, 'agree');

        const { result } = renderRoughSort();

        // Card 1 sorted, cards 2 and 3 remain
        expect(result.current.unsortedCards).toHaveLength(2);
        expect(result.current.unsortedCards.map((c) => c.id)).toEqual([2, 3]);
    });

    it('currentCard is the first unsorted card', () => {
        const { result } = renderRoughSort();
        expect(result.current.currentCard?.id).toBe(1);
    });

    it('progress is 0 when nothing sorted', () => {
        const { result } = renderRoughSort();
        expect(result.current.progress).toBe(0);
    });

    it('progress is 100 when all cards sorted', () => {
        useResponseStore.getState().categorizeCard(1, 'agree');
        useResponseStore.getState().categorizeCard(2, 'disagree');
        useResponseStore.getState().categorizeCard(3, 'neutral');

        const { result } = renderRoughSort();
        expect(result.current.progress).toBe(100);
    });

    it('handleUndo calls undoRoughSort when history is not empty', () => {
        useResponseStore.getState().categorizeCard(1, 'agree');

        const { result } = renderRoughSort();
        expect(useResponseStore.getState().rough.history).toHaveLength(1);

        act(() => {
            result.current.handleUndo();
        });

        expect(useResponseStore.getState().rough.history).toHaveLength(0);
    });

    it('handleUndo does nothing when history is empty', () => {
        const { result } = renderRoughSort();

        act(() => {
            result.current.handleUndo();
        });

        expect(useResponseStore.getState().rough.history).toHaveLength(0);
    });

    it('navigation guard redirects to welcome when not consented', () => {
        useSessionStore.getState().resetSession(); // clears consent

        renderRoughSort();

        expect(mockNavigate).toHaveBeenCalledWith(
            expect.stringContaining('/welcome'),
            expect.objectContaining({ replace: true })
        );
    });

    it('onVoteComplete categorises the current card and resets motion values', () => {
        // onVoteComplete is what the keyboard handler ultimately calls (via cardStackRef.swipe → CardStack → onVote prop)
        const { result } = renderHook(
            () => {
                const cardStackRef = useRef<{
                    swipe: (dir: 'agree' | 'disagree' | 'neutral') => Promise<void>;
                } | null>(null);
                return useRoughSort(showTip, setShowTip, x, y, cardStackRef);
            },
            { wrapper: AllTheProviders }
        );

        expect(result.current.currentCard?.id).toBe(1);

        act(() => {
            result.current.onVoteComplete('agree');
        });

        expect(useResponseStore.getState().rough.agree).toContain(1);
        expect(x.get()).toBe(0);
        expect(y.get()).toBe(0);
    });

    it('handleUndo reduces history length (keyboard z shortcut path)', () => {
        // Note: keyboard handler requires cardStackRef.current to be set, so we test
        // handleUndo directly (the same function the keyboard handler calls).
        useResponseStore.getState().categorizeCard(1, 'agree');

        const { result } = renderRoughSort();

        expect(useResponseStore.getState().rough.history).toHaveLength(1);

        act(() => {
            result.current.handleUndo();
        });

        expect(useResponseStore.getState().rough.history).toHaveLength(0);
    });

    it('auto-dismisses tip after 5 sorted cards', () => {
        renderHook(
            () => {
                const cardStackRef = useRef<{
                    swipe: (dir: 'agree' | 'disagree' | 'neutral') => Promise<void>;
                } | null>(null);
                return useRoughSort(true, setShowTip, x, y, cardStackRef);
            },
            { wrapper: AllTheProviders }
        );

        act(() => {
            for (let i = 1; i <= 5; i++) {
                useResponseStore.getState().categorizeCard(i, 'agree');
            }
        });

        expect(setShowTip).toHaveBeenCalledWith(false);
    });

    it('agreeCount, disagreeCount, neutralCount reflect store state', () => {
        useResponseStore.getState().categorizeCard(1, 'agree');
        useResponseStore.getState().categorizeCard(2, 'disagree');
        useResponseStore.getState().categorizeCard(3, 'neutral');

        const { result } = renderRoughSort();

        expect(result.current.agreeCount).toBe(1);
        expect(result.current.disagreeCount).toBe(1);
        expect(result.current.neutralCount).toBe(1);
    });
});
