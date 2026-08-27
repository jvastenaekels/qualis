/*
 * Qualis - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

/**
 * useRoughSort hook
 *
 * Encapsulates the durable state-and-effect logic for the Rough Sort page (step 3).
 * The RoughSortPage component receives this hook's return value and renders JSX from it.
 *
 * Framer-motion MotionValues (x, y) and their derived transforms (scaleAgree, opacityDisagree,
 * etc.) stay in the component because they are created with useMotionValue/useTransform and
 * must be passed to both <CardStack> and <motion.button> elements. The hook receives them as
 * parameters only where it needs to subscribe to changes (showTip auto-dismiss).
 */

import React, { startTransition, useCallback, useEffect } from 'react';
import type { MotionValue } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useViewport } from '@/contexts/ViewportContext';
import { useLayoutAction } from '../useLayout';
import { useResponseStore } from '../../store/useResponseStore';
import { useSessionStore } from '../../store/useSessionStore';
import { useUIStore } from '../../store/useUIStore';
import type { StudyConfig, Statement } from '../../schemas/study';
import type { CardStackHandle } from '../../components/CardStack';
import { useConfigStore } from '../../store/useConfigStore';

// ────────────────────────────────────────────────────────────────
// Public API surface
// ────────────────────────────────────────────────────────────────

export interface RoughSortApi {
    // Config
    config: StudyConfig | null;
    showCodes: boolean;

    // Derived data
    unsortedCards: Statement[];
    currentCard: Statement | undefined;
    progress: number;

    // Counts (for deck buttons)
    agreeCount: number;
    disagreeCount: number;
    neutralCount: number;

    // UI state
    showTip: boolean;
    setShowTip: (show: boolean) => void;
    hoveredCard: { id: number; text: string; code?: string } | null;
    setHoveredCard: (card: { id: number; text: string; code?: string } | null) => void;
    roughHistory: number[];

    // Font sizing helper
    sharedFontSize: string;

    // Handlers
    handleUndo: (e?: React.MouseEvent) => void;
    handleVote: (direction: 'agree' | 'disagree' | 'neutral') => void;
    onVoteComplete: (direction: 'agree' | 'disagree' | 'neutral') => void;

    // CardStack ref interop
    cardStackRef: React.RefObject<CardStackHandle | null>;

    // Router helpers
    slug: string | undefined;
    location: ReturnType<typeof useLocation>;
    navigate: ReturnType<typeof useNavigate>;
}

// ────────────────────────────────────────────────────────────────
// Hook
// ────────────────────────────────────────────────────────────────

/**
 * @param showTip         - showTip state value (lifted to component so JSX can read it)
 * @param setShowTip      - showTip setter (lifted to component so JSX can control it)
 * @param x               - framer-motion MotionValue for horizontal swipe position
 * @param y               - framer-motion MotionValue for vertical swipe position
 * @param cardStackRef    - ref to the CardStack imperative handle
 */
export function useRoughSort(
    showTip: boolean,
    setShowTip: (show: boolean) => void,
    x: MotionValue<number>,
    y: MotionValue<number>,
    cardStackRef: React.RefObject<CardStackHandle | null>
): RoughSortApi {
    const { slug } = useParams();
    const navigate = useNavigate();
    const location = useLocation();
    const { isDesktop } = useViewport();
    const { t } = useTranslation();

    // Config
    const config = useConfigStore((state) => state.config);
    const showCodes = config?.show_statement_codes ?? false;

    // Response store
    const roughHistory = useResponseStore((state) => state.rough?.history ?? []);
    const agreeCount = useResponseStore((state) => state.rough?.agree?.length ?? 0);
    const disagreeCount = useResponseStore((state) => state.rough?.disagree?.length ?? 0);
    const neutralCount = useResponseStore((state) => state.rough?.neutral?.length ?? 0);
    const undoRoughSort = useResponseStore((state) => state.undoRoughSort);
    const categorizeCard = useResponseStore((state) => state.categorizeCard);

    // Session store
    const setStep = useSessionStore((state) => state.setStep);
    const hasConsented = useSessionStore((state) => state.hasConsented);

    // UI store
    const hoveredCard = useUIStore((state) => state.hoveredCard);
    const setHoveredCard = useUIStore((state) => state.setHoveredCard);

    const { setHeaderAction } = useLayoutAction();

    // ── Step effect ───────────────────────────────────────────────
    useEffect(() => {
        setStep(3);
    }, [setStep]);

    // ── Navigation guard ──────────────────────────────────────────
    useEffect(() => {
        if (!hasConsented) {
            navigate(`/study/${slug}/welcome${location.search}`, { replace: true });
        }
    }, [hasConsented, navigate, slug, location.search]);

    // ── Header cleanup ────────────────────────────────────────────
    useEffect(() => {
        return () => setHeaderAction(null);
    }, [setHeaderAction]);

    // ── Auto-dismiss tip on first swipe gesture ───────────────────
    useEffect(() => {
        if (!showTip || isDesktop) return;

        const unsubscribeX = x.on('change', (latest) => {
            if (Math.abs(latest) > 5) {
                setShowTip(false);
            }
        });

        const unsubscribeY = y.on('change', (latest) => {
            if (Math.abs(latest) > 5) {
                setShowTip(false);
            }
        });

        return () => {
            unsubscribeX();
            unsubscribeY();
        };
    }, [showTip, x, y, isDesktop, setShowTip]);

    // ── Auto-dismiss tip after 5 sorted cards ─────────────────────
    useEffect(() => {
        if (showTip && roughHistory.length >= 5) {
            setShowTip(false);
        }
    }, [roughHistory.length, showTip, setShowTip]);

    // ── Derived data ──────────────────────────────────────────────
    const sortedIds = React.useMemo(() => new Set(roughHistory), [roughHistory]);
    const unsortedCards = React.useMemo(
        () => (config?.statements ? config.statements.filter((s) => !sortedIds.has(s.id)) : []),
        [config, sortedIds]
    );

    const currentCard = unsortedCards[0];
    const progress = config?.statements?.length
        ? ((config.statements.length - unsortedCards.length) / config.statements.length) * 100
        : 0;

    // ── Font size advisor ─────────────────────────────────────────
    const sharedFontSize = React.useMemo(() => {
        if (isDesktop) return 'text-sm';

        const labels = [t('common.disagree'), t('common.agree'), t('common.neutral')];
        const words = labels.flatMap((l) => l.split(/[\s/]+/));
        const maxWordLength = Math.max(...words.map((w) => w.length));

        if (maxWordLength > 10) return 'text-2xs';
        if (maxWordLength > 8) return 'text-xs';
        return 'text-sm';
    }, [t, isDesktop]);

    // ── Handlers ─────────────────────────────────────────────────
    const handleUndo = useCallback(
        (e?: React.MouseEvent) => {
            e?.stopPropagation();
            if (roughHistory.length > 0) {
                undoRoughSort();
            }
        },
        [undoRoughSort, roughHistory.length]
    );

    const handleVote = useCallback(
        (direction: 'agree' | 'disagree' | 'neutral') => {
            if (showTip && !isDesktop) {
                setShowTip(false);
            }
            if (cardStackRef.current) {
                cardStackRef.current.swipe(direction);
            }
        },
        [showTip, isDesktop, setShowTip, cardStackRef]
    );

    const onVoteComplete = useCallback(
        (direction: 'agree' | 'disagree' | 'neutral') => {
            if (currentCard) {
                startTransition(() => {
                    categorizeCard(currentCard.id, direction);
                });
                x.set(0);
                y.set(0);
            }
        },
        [currentCard, categorizeCard, x, y]
    );

    // ── Keyboard handler ──────────────────────────────────────────
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (!currentCard || !cardStackRef.current) return;
            switch (e.key) {
                case 'ArrowLeft':
                    cardStackRef.current.swipe('disagree');
                    break;
                case 'ArrowRight':
                    cardStackRef.current.swipe('agree');
                    break;
                case 'ArrowDown':
                    cardStackRef.current.swipe('neutral');
                    break;
                case 'z':
                    if (roughHistory.length > 0) {
                        handleUndo();
                    }
                    break;
                case 'Escape':
                    setShowTip(false);
                    setHoveredCard(null);
                    break;
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [currentCard, roughHistory.length, handleUndo, setHoveredCard, setShowTip, cardStackRef]);

    return {
        config,
        showCodes,
        unsortedCards,
        currentCard,
        progress,
        agreeCount,
        disagreeCount,
        neutralCount,
        showTip,
        setShowTip,
        hoveredCard,
        setHoveredCard,
        roughHistory,
        sharedFontSize,
        handleUndo,
        handleVote,
        onVoteComplete,
        cardStackRef,
        slug,
        location,
        navigate,
    };
}
