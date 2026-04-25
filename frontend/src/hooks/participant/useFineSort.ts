/*
 * Libre-Q - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

/**
 * useFineSort hook
 *
 * Encapsulates the durable state-and-effect logic for the Fine Sort page (step 4).
 * The FineSortPage component receives this hook's return value and renders JSX from it.
 *
 * Visual/layout state that is tied to JSX refs or animation values stays in the component:
 * - cardDimensions, zoomLevel, interactionUtils, renderSlotContent
 */

import type {
    CollisionDetection,
    DragEndEvent,
    DragMoveEvent,
    DragStartEvent,
    Modifier,
} from '@dnd-kit/core';
import {
    KeyboardSensor,
    MouseSensor,
    TouchSensor,
    closestCenter,
    pointerWithin,
    rectIntersection,
    useSensor,
    useSensors,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useViewport } from '@/contexts/ViewportContext';
import { useGridSanity } from '../useGridSanity';
import { useLayoutAction } from '../useLayout';
import { useFineSortDrag } from '../useFineSortDrag';
import { useConfigStore } from '../../store/useConfigStore';
import { useResponseStore } from '../../store/useResponseStore';
import { useSessionStore } from '../../store/useSessionStore';
import { useUIStore } from '../../store/useUIStore';
import type { InteractionUtils } from '../../types/grid';
import type { Statement, StudyConfig } from '../../schemas/study';

// ────────────────────────────────────────────────────────────────
// Public API surface
// ────────────────────────────────────────────────────────────────

export interface FineSortApi {
    // Config / derived data
    config: StudyConfig | null;
    gridColumns: { score: number; capacity: number }[];
    qsort: { statementId: number; col: number; row: number }[];
    unplacedAgree: Statement[];
    unplacedDisagree: Statement[];
    unplacedNeutral: Statement[];
    isAllPlaced: boolean;
    showCodes: boolean;

    // Selection state
    selectedCardId: number | null;

    // DnD
    sensors: ReturnType<typeof useSensors>;
    activeId: number | null;
    collisionStrategy: CollisionDetection;
    snapCenterToCursor: Modifier;
    handleDragStart: (event: DragStartEvent) => void;
    handleDragMove: (event: DragMoveEvent) => void;
    handleDragEnd: (event: DragEndEvent) => void;
    handleDragCancel: () => void;
    handleCardClick: (id: number) => void;
    handleSlotClick: (col: number, row: number) => void;

    // Page-level actions
    handleReset: () => void;
    handleValidate: () => void;

    // Interop: setters the component passes down for JSX-local state
    setSelectedCardId: (id: number | null) => void;
}

// ────────────────────────────────────────────────────────────────
// Hook
// ────────────────────────────────────────────────────────────────

export function useFineSort(interactionUtils: InteractionUtils | null): FineSortApi {
    const config = useConfigStore((state) => state.config);
    const { isLandscape } = useViewport();

    // Response store
    const rough = useResponseStore((state) => state.rough);
    const qsort = useResponseStore((state) => state.qsort);
    const placeCardInGrid = useResponseStore((state) => state.placeCardInGrid);
    const moveCardInGrid = useResponseStore((state) => state.moveCardInGrid);
    const swapCardsInGrid = useResponseStore((state) => state.swapCardsInGrid);
    const unplaceCard = useResponseStore((state) => state.unplaceCard);
    const resetFineSort = useResponseStore((state) => state.resetFineSort);
    const categorizeCard = useResponseStore((state) => state.categorizeCard);

    // Session store
    const setStep = useSessionStore((state) => state.setStep);
    const isCompleted = useSessionStore((state) => state.isCompleted);

    // UI store
    const setSelectedCard = useUIStore((state) => state.setSelectedCard);

    // Router
    const navigate = useNavigate();
    const location = useLocation();
    const { slug } = useParams();

    const { setHeaderAction } = useLayoutAction();
    const { t } = useTranslation();

    // ── Selection state ──────────────────────────────────────────
    const [selectedCardId, setSelectedCardId] = useState<number | null>(null);

    useEffect(() => {
        if (!config) {
            setSelectedCard(null);
            return;
        }
        const selectedCard =
            selectedCardId !== null
                ? (config.statements.find((s) => s.id === selectedCardId) ?? null)
                : null;
        setSelectedCard(selectedCard);
    }, [selectedCardId, config, setSelectedCard]);

    // ── Sensors ──────────────────────────────────────────────────
    const sensors = useSensors(
        useSensor(MouseSensor, { activationConstraint: { distance: 3 } }),
        useSensor(TouchSensor, {
            activationConstraint: { delay: 150, tolerance: 5 },
        }),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    );

    // ── Step + Navigation + Header effects ───────────────────────
    useEffect(() => {
        setStep(4);
    }, [setStep]);

    useEffect(() => {
        if (isCompleted) return;
        const totalRough = rough.agree.length + rough.disagree.length + rough.neutral.length;
        if (config && totalRough === 0) {
            navigate(`/study/${slug}/rough-sort${location.search}`, { replace: true });
        }
    }, [config, rough, navigate, slug, isCompleted, location.search]);

    useEffect(() => {
        setHeaderAction(null);
        return () => setHeaderAction(null);
    }, [setHeaderAction]);

    // ── Derived data ─────────────────────────────────────────────
    const gridColumns = useMemo(
        () =>
            config?.grid_config || [
                { score: -4, capacity: 2 },
                { score: -3, capacity: 3 },
                { score: -2, capacity: 4 },
                { score: -1, capacity: 6 },
                { score: 0, capacity: 10 },
                { score: 1, capacity: 6 },
                { score: 2, capacity: 4 },
                { score: 3, capacity: 3 },
                { score: 4, capacity: 2 },
            ],
        [config?.grid_config]
    );

    const { unplacedAgree, unplacedDisagree, unplacedNeutral, isAllPlaced } = useMemo(() => {
        const placedIds = new Set(qsort.map((c) => c.statementId));
        const statements = config?.statements || [];

        const unplacedAgree = rough.agree
            .filter((id) => !placedIds.has(id))
            .map((id) => statements.find((s) => s.id === id))
            .filter((s): s is NonNullable<typeof s> => !!s);

        const unplacedDisagree = rough.disagree
            .filter((id) => !placedIds.has(id))
            .map((id) => statements.find((s) => s.id === id))
            .filter((s): s is NonNullable<typeof s> => !!s);

        const unplacedNeutral = rough.neutral
            .filter((id) => !placedIds.has(id))
            .map((id) => statements.find((s) => s.id === id))
            .filter((s): s is NonNullable<typeof s> => !!s);

        const isAllPlaced =
            unplacedAgree.length === 0 &&
            unplacedDisagree.length === 0 &&
            unplacedNeutral.length === 0;

        return { unplacedAgree, unplacedDisagree, unplacedNeutral, isAllPlaced };
    }, [qsort, rough, config?.statements]);

    const showCodes = config?.show_statement_codes ?? false;

    // ── Actions object (stable reference for DnD hook) ───────────
    const actions = useMemo(
        () => ({
            placeCardInGrid,
            moveCardInGrid,
            swapCardsInGrid,
            unplaceCard,
            categorizeCard,
        }),
        [placeCardInGrid, moveCardInGrid, swapCardsInGrid, unplaceCard, categorizeCard]
    );

    // ── DnD ──────────────────────────────────────────────────────
    const {
        activeId,
        handleDragStart,
        handleDragMove,
        handleDragEnd,
        handleDragCancel,
        handleCardClick,
        handleSlotClick,
    } = useFineSortDrag({
        responses: { qsort },
        gridColumns,
        onSelectionChange: setSelectedCardId,
        selectedId: selectedCardId,
        interactionUtils,
        statements: config?.statements || [],
        actions,
    });

    // ── Reconciliation effect ─────────────────────────────────────
    useEffect(() => {
        if (!config || !qsort || !rough) return;
        const placedIds = new Set(qsort.map((p) => p.statementId));
        const roughIds = new Set([...rough.agree, ...rough.neutral, ...rough.disagree]);
        const missingIds = config.statements
            .map((s) => s.id)
            .filter((id) => !placedIds.has(id) && !roughIds.has(id));
        if (missingIds.length > 0) {
            console.warn('Reconciling missing cards:', missingIds);
            for (const id of missingIds) {
                actions.categorizeCard(id, 'neutral');
            }
        }
    }, [config, qsort, rough, actions]);

    // ── Grid sanity ───────────────────────────────────────────────
    useGridSanity({
        qsort,
        gridColumns,
        unplaceCard: actions.unplaceCard,
        categorizeCard: actions.categorizeCard,
    });

    // ── Keyboard handler ──────────────────────────────────────────
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && selectedCardId !== null) {
                setSelectedCardId(null);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [selectedCardId]);

    // ── Orientation change: cancel active drag ────────────────────
    const prevLandscapeRef = useRef(isLandscape);
    useEffect(() => {
        if (isLandscape !== prevLandscapeRef.current) {
            prevLandscapeRef.current = isLandscape;
            if (activeId !== null) {
                handleDragCancel();
            }
        }
    }, [isLandscape, activeId, handleDragCancel]);

    // ── Collision strategy ────────────────────────────────────────
    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: collision resolution logic inherited from FineSortPage; TODO(quality-roadmap): extract into useCollisionStrategy
    const collisionStrategy: CollisionDetection = useCallback((args) => {
        const pointerCollisions = pointerWithin(args);

        if (pointerCollisions.length > 0) {
            const targetContainer = pointerCollisions.find((c) => {
                const idStr = String(c.id);
                return idStr.startsWith('slot_') || idStr.startsWith('deck-');
            });

            if (targetContainer) return [targetContainer];

            const cardCollision = pointerCollisions.find((c) => {
                return typeof c.id === 'number' || !Number.isNaN(Number(c.id));
            });

            if (cardCollision) {
                const cardId = Number(cardCollision.id);
                const currentQsort = useResponseStore.getState().qsort;
                const placed = currentQsort.find((p) => p.statementId === cardId);
                if (placed) {
                    return [
                        {
                            id: `slot_${placed.col}_${placed.row}`,
                            data: cardCollision.data,
                        },
                    ];
                }
            }
        }

        const rectCollisions = rectIntersection(args);
        if (rectCollisions.length > 0) {
            const targetContainer = rectCollisions.find((c) => {
                const idStr = String(c.id);
                return idStr.startsWith('slot_');
            });
            if (targetContainer) return [targetContainer];
        }

        return closestCenter(args);
    }, []);

    // ── Snap modifier ─────────────────────────────────────────────
    const snapCenterToCursor: Modifier = useCallback(
        // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: pointer-event normalisation across Mouse/Pointer/Touch; TODO(quality-roadmap): simplify
        ({ activatorEvent, draggingNodeRect, transform }) => {
            if (draggingNodeRect && activatorEvent) {
                const activatorCenter = {
                    x: draggingNodeRect.left + draggingNodeRect.width / 2,
                    y: draggingNodeRect.top + draggingNodeRect.height / 2,
                };
                const event =
                    'nativeEvent' in activatorEvent ? activatorEvent.nativeEvent : activatorEvent;
                const eventX =
                    event instanceof MouseEvent || event instanceof PointerEvent
                        ? event.clientX
                        : event instanceof TouchEvent && event.touches.length > 0
                          ? event.touches[0].clientX
                          : 0;
                const eventY =
                    event instanceof MouseEvent || event instanceof PointerEvent
                        ? event.clientY
                        : event instanceof TouchEvent && event.touches.length > 0
                          ? event.touches[0].clientY
                          : 0;
                return {
                    ...transform,
                    x: transform.x + (eventX - activatorCenter.x),
                    y: transform.y + (eventY - activatorCenter.y),
                };
            }
            return transform;
        },
        []
    );

    // ── Page-level actions ────────────────────────────────────────
    const handleReset = useCallback(() => {
        if (window.confirm(t('fine.deck.confirm_reset'))) resetFineSort();
    }, [resetFineSort, t]);

    const handleValidate = useCallback(
        () => navigate(`/study/${slug}/post-sort${location.search}`),
        [navigate, slug, location.search]
    );

    return {
        config,
        gridColumns,
        qsort,
        unplacedAgree,
        unplacedDisagree,
        unplacedNeutral,
        isAllPlaced,
        showCodes,
        selectedCardId,
        setSelectedCardId,
        sensors,
        activeId,
        collisionStrategy,
        snapCenterToCursor,
        handleDragStart,
        handleDragMove,
        handleDragEnd,
        handleDragCancel,
        handleCardClick,
        handleSlotClick,
        handleReset,
        handleValidate,
    };
}
