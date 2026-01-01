/*
 * Open-Q - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

import type React from 'react';
import { useTranslation } from 'react-i18next';
import SortableCard from './SortableCard';

interface CardPileProps {
    type: 'agree' | 'disagree' | 'neutral';
    count: number;
    topCard?: { id: number; text: string; code?: string };
}

const CardPile: React.FC<CardPileProps> = ({ type, count, topCard }) => {
    const { t } = useTranslation();

    // Config based on type
    const config = {
        agree: {
            label: t('fine.legend.agree'),
            borderColor: 'border-green-300',
            bgColor: 'bg-green-50',
        },
        disagree: {
            label: t('fine.legend.disagree'),
            borderColor: 'border-red-300',
            bgColor: 'bg-red-50',
        },
        neutral: {
            label: t('fine.legend.neutral'),
            borderColor: 'border-gray-300',
            bgColor: 'bg-gray-50',
        },
    }[type];

    // If no cards, show empty state placeholder
    const isEmpty = count === 0;

    const labelId = `pile-label-${type}`;

    return (
        <section
            className="relative w-24 h-32 sm:w-28 sm:h-36 flex flex-col items-center"
            aria-labelledby={labelId}
        >
            {/* 1. Underlying Stack Visuals (Pseudo-depth) */}
            {!isEmpty && (
                <div aria-hidden="true">
                    <div
                        className={`absolute top-1 left-1 w-full h-full rounded-2xl border ${config.borderColor} bg-white opacity-50 z-0`}
                    />
                    <div
                        className={`absolute top-2 left-2 w-full h-full rounded-2xl border ${config.borderColor} bg-white opacity-30 z-[-1]`}
                    />
                </div>
            )}

            {/* 2. Top Card (Draggable) OR Placeholder */}
            <div className="relative w-full h-full z-10">
                {topCard ? (
                    <SortableCard id={topCard.id} text={topCard.text} code={topCard.code} />
                ) : (
                    // Empty State
                    <div
                        role="img"
                        className={`
                      w-full h-full rounded-2xl border-2 border-dashed ${config.borderColor} ${config.bgColor}
                      flex flex-col items-center justify-center gap-2 opacity-50
                  `}
                        aria-label={t('fine.deck.all_placed')}
                    >
                        <span
                            className="text-xs font-bold uppercase text-gray-400"
                            aria-hidden="true"
                        >
                            {t('fine.deck.all_placed')}
                        </span>
                    </div>
                )}
            </div>

            {/* 3. Badge */}
            <div className="absolute -top-2 -right-2 z-20 pointer-events-none">
                <output
                    className="bg-slate-800 text-white text-[10px] sm:text-xs font-bold px-2 py-0.5 rounded-full shadow-md min-w-[20px] text-center border border-white"
                    aria-label={`${count} ${t('common.cards', 'cards')}`}
                >
                    {count}
                </output>
            </div>

            {/* Label below */}
            <div
                id={labelId}
                className="mt-2 text-[10px] sm:text-xs font-bold uppercase tracking-wide text-gray-500"
            >
                {config.label}
            </div>
        </section>
    );
};

export default CardPile;
