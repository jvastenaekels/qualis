/*
 * Open-Q - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

import { useMemo, useState, useTransition } from 'react';

type PileType = 'disagree' | 'neutral' | 'agree';

interface UseDeckManagementProps<T extends { id: number; text: string }> {
    agreeCards: T[];
    disagreeCards: T[];
    neutralCards: T[];
}

export const useDeckManagement = <T extends { id: number; text: string }>({
    agreeCards,
    disagreeCards,
    neutralCards,
}: UseDeckManagementProps<T>) => {
    const [activePile, setActivePile] = useState<PileType>('disagree');
    const [isPending, startTransition] = useTransition();
    const [hasPerformedZonalFocus, setHasPerformedZonalFocus] = useState(false);

    const setActivePileTransition = (pile: PileType) => {
        startTransition(() => {
            setActivePile(pile);
        });
    };

    const activeCards = useMemo(() => {
        switch (activePile) {
            case 'agree':
                return agreeCards;
            case 'disagree':
                return disagreeCards;
            case 'neutral':
                return neutralCards;
            default:
                return [];
        }
    }, [activePile, agreeCards, disagreeCards, neutralCards]);

    // Calculate optimal deck height based on longest statement
    const deckHeight = useMemo(() => {
        const allCards = [...agreeCards, ...disagreeCards, ...neutralCards];
        if (allCards.length === 0) return 220;

        // Safety check for empty text
        const maxLength = Math.max(...allCards.map((card) => card.text?.length || 0));
        const estimatedLines = Math.ceil(maxLength / 50);
        const calculatedHeight = 220 + estimatedLines * 20;
        return Math.min(Math.max(calculatedHeight, 280), 420);
    }, [agreeCards, disagreeCards, neutralCards]);

    return {
        activePile,
        setActivePile: setActivePileTransition,
        activeCards,
        deckHeight,
        hasPerformedZonalFocus,
        setHasPerformedZonalFocus,
        isPending,
    };
};
