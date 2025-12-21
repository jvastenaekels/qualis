/*
 * Open-Q - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

import { useState, useMemo } from 'react';

type PileType = 'disagree' | 'neutral' | 'agree';

interface UseDeckManagementProps {
    agreeCards: { id: number; text: string }[];
    disagreeCards: { id: number; text: string }[];
    neutralCards: { id: number; text: string }[];
}

export const useDeckManagement = ({
    agreeCards,
    disagreeCards,
    neutralCards
}: UseDeckManagementProps) => {
    const [activePile, setActivePile] = useState<PileType>('disagree');
    const [hasPerformedZonalFocus, setHasPerformedZonalFocus] = useState(false);

    const activeCards = useMemo(() => {
        switch(activePile) {
            case 'agree': return agreeCards;
            case 'disagree': return disagreeCards;
            case 'neutral': return neutralCards;
            default: return [];
        }
    }, [activePile, agreeCards, disagreeCards, neutralCards]);

    // Calculate optimal deck height based on longest statement
    const deckHeight = useMemo(() => {
        const allCards = [...agreeCards, ...disagreeCards, ...neutralCards];
        if (allCards.length === 0) return 180; 
        
        // Safety check for empty text
        const maxLength = Math.max(...allCards.map(card => card.text?.length || 0));
        const estimatedLines = Math.ceil(maxLength / 50);
        const calculatedHeight = 140 + (estimatedLines * 15);
        return Math.min(Math.max(calculatedHeight, 180), 280);
    }, [agreeCards, disagreeCards, neutralCards]);

    return {
        activePile,
        setActivePile,
        activeCards,
        deckHeight,
        hasPerformedZonalFocus,
        setHasPerformedZonalFocus
    };
};
