/*
 * Open-Q - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

import { useDroppable } from '@dnd-kit/core';
import { rectSortingStrategy, SortableContext } from '@dnd-kit/sortable';
import { motion } from 'framer-motion';
import type React from 'react';
import { useState } from 'react';
import SortableCard from './SortableCard';

interface Card {
    id: number;
    text: string;
    code?: string;
}

interface SourceDeckProps {
    agree: Card[];
    disagree: Card[];
    neutral: Card[];
}

const SourceDeck: React.FC<SourceDeckProps> = ({ agree, disagree, neutral }) => {
    const [activeTab, setActiveTab] = useState<'disagree' | 'neutral' | 'agree'>('neutral');

    const tabs = [
        {
            id: 'disagree',
            label: 'Disagree',
            cards: disagree,
            color: 'text-red-600',
            bg: 'bg-red-50',
        },
        {
            id: 'neutral',
            label: 'Neutral',
            cards: neutral,
            color: 'text-gray-600',
            bg: 'bg-gray-50',
        },
        { id: 'agree', label: 'Agree', cards: agree, color: 'text-green-600', bg: 'bg-green-50' },
    ];

    const activeCards = tabs.find((t) => t.id === activeTab)?.cards || [];

    // The entire deck area is NOT a single droppable, but a SortableContext.
    // The dropping happens if user moves a card back to this area.
    // We can wrap the card list in a droppable 'source-zone'.
    const { setNodeRef } = useDroppable({ id: 'source-deck' });

    return (
        <div className="flex flex-col h-full bg-white border-b border-gray-200 shadow-sm z-30">
            {/* Tabs */}
            <div className="flex w-full border-b border-gray-200">
                {tabs.map((tab) => (
                    <button
                        key={tab.id}
                        type="button"
                        onClick={() => setActiveTab(tab.id as 'disagree' | 'neutral' | 'agree')}
                        className={`
                            flex-1 py-3 text-xs sm:text-sm font-bold tracking-wide
                            transition-colors relative
                            ${activeTab === tab.id ? tab.color : 'text-gray-400 hover:text-gray-600'}
                        `}
                    >
                        {tab.label} ({tab.cards.length})
                        {activeTab === tab.id && (
                            <motion.div
                                layoutId="activeTab"
                                className={`absolute bottom-0 left-0 right-0 h-1 ${tab.color.replace('text', 'bg')}`}
                            />
                        )}
                    </button>
                ))}
            </div>

            {/* Card Scroller */}
            <div
                ref={setNodeRef}
                className={`flex-1 overflow-x-auto overflow-y-hidden p-4 flex items-center gap-4 ${tabs.find((t) => t.id === activeTab)?.bg}`}
            >
                <SortableContext
                    items={activeCards.map((c) => c.id)}
                    strategy={rectSortingStrategy}
                >
                    {activeCards.length === 0 ? (
                        <div className="w-full text-center text-sm text-gray-400 italic">
                            Empty Pile
                        </div>
                    ) : (
                        activeCards.map((card) => (
                            <div
                                key={card.id}
                                className="min-w-[100px] w-[100px] h-[133px] sm:min-w-[120px] sm:w-[120px] sm:h-[160px]"
                            >
                                <SortableCard id={card.id} text={card.text} code={card.code} />
                            </div>
                        ))
                    )}
                </SortableContext>
            </div>
        </div>
    );
};

export default SourceDeck;
