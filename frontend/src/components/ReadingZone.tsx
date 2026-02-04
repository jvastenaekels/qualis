/*
 * Open-Q - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

import { Eye } from 'lucide-react';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { useConfigStore } from '../store/useConfigStore';
import { useUIStore } from '../store/useUIStore';
import MethodologyTips from './MethodologyTips';
import { cn } from '@/lib/utils';

interface ReadingZoneProps {
    variant: 'mobile' | 'desktop';
}
const ReadingZone: React.FC<ReadingZoneProps> = ({ variant }) => {
    const { t } = useTranslation();
    const hoveredCard = useUIStore((state) => state.hoveredCard);
    const activeCard = useUIStore((state) => state.activeCard);
    const selectedCard = useUIStore((state) => state.selectedCard);

    const config = useConfigStore((state) => state.config);
    const showCodes = config?.show_statement_codes ?? true;

    const rawDisplayCard = activeCard || hoveredCard || selectedCard;
    const displayCard = React.useDeferredValue(rawDisplayCard);
    const labelKey = activeCard
        ? 'fine.workbench.active_card'
        : hoveredCard
          ? 'fine.toolbar.preview'
          : 'fine.workbench.active_card';

    // Scroll indicator logic
    // Scroll indicator logic
    const textRef = React.useRef<HTMLDivElement>(null);
    const [hasOverflow, setHasOverflow] = React.useState(false);

    React.useEffect(() => {
        const checkOverflow = () => {
            if (textRef.current) {
                const { scrollHeight, clientHeight } = textRef.current;
                setHasOverflow(scrollHeight > clientHeight + 2);
            }
        };
        // Check overflow when content changes or during transitions
        checkOverflow();
        // Also set up a mutation observer or simpler timeout loop to catch transition ends
        const timer = setTimeout(checkOverflow, 350);

        window.addEventListener('resize', checkOverflow);
        return () => {
            window.removeEventListener('resize', checkOverflow);
            clearTimeout(timer);
        };
    }, [displayCard?.text]); // Re-run when text changes

    const ScrollIndicator = () => (
        <div className="absolute bottom-0 left-0 right-0 h-6 bg-gradient-to-t from-indigo-50 via-indigo-50/50 to-transparent pointer-events-none flex items-end justify-center pb-0.5 rounded-b-xl z-10 transition-opacity duration-300">
            <div className="animate-bounce opacity-50">
                <svg
                    aria-hidden="true"
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="text-indigo-900"
                >
                    <path d="m6 9 6 6 6-6" />
                </svg>
            </div>
        </div>
    );

    const CardHeader = ({
        label,
        code,
        className,
        iconSize,
    }: {
        label: string;
        code?: string;
        className: string;
        iconSize: number;
    }) => (
        <div
            className={cn(
                'font-bold text-indigo-400 uppercase tracking-wider flex items-center',
                className
            )}
        >
            <Eye size={iconSize} strokeWidth={2.5} />
            {label}
            {showCodes && code && (
                <>
                    <span className="text-indigo-300 mx-1">•</span>
                    {code}
                </>
            )}
        </div>
    );

    if (variant === 'mobile') {
        return (
            <div className="sticky top-0 z-30 flex-none bg-indigo-50/50 backdrop-blur-md border-b border-indigo-100 shadow-sm relative overflow-hidden h-28">
                {/* Card Content Layer */}
                <div
                    ref={textRef}
                    className={cn(
                        'transition-opacity duration-300 absolute inset-0 pl-3 pr-28 py-3 overflow-y-auto custom-scrollbar',
                        displayCard
                            ? 'opacity-100 z-10'
                            : 'opacity-0 z-0 pointer-events-none invisible'
                    )}
                    aria-hidden={!displayCard}
                >
                    {displayCard && (
                        <div className="animate-in fade-in slide-in-from-top-1 duration-300 pb-2">
                            <CardHeader
                                label={t(labelKey)}
                                code={displayCard.code}
                                className="text-[10px] mb-0.5 gap-1.5"
                                iconSize={12}
                            />
                            <div className="flex flex-col gap-0.5">
                                <p className="text-slate-800 text-sm font-medium leading-relaxed">
                                    {displayCard.text}
                                </p>
                            </div>
                        </div>
                    )}
                </div>

                {/* Tips Layer */}
                <div
                    className={cn(
                        'transition-opacity duration-500 absolute inset-0 px-12 py-3 flex items-center justify-center',
                        !displayCard
                            ? 'opacity-100 z-10 delay-100'
                            : 'opacity-0 z-0 pointer-events-none invisible'
                    )}
                    aria-hidden={!!displayCard}
                    data-testid="reading-zone-tips"
                >
                    <MethodologyTips variant="mobile" />
                </div>

                {hasOverflow && displayCard && <ScrollIndicator />}
            </div>
        );
    }

    return (
        <div className="w-full bg-indigo-50/50 backdrop-blur-md border border-indigo-100 rounded-xl h-40 relative group overflow-hidden">
            {/* Card Content Layer */}
            <div
                ref={textRef}
                className={cn(
                    'transition-opacity duration-300 absolute inset-0 p-4 overflow-y-auto custom-scrollbar',
                    displayCard ? 'opacity-100 z-10' : 'opacity-0 z-0 pointer-events-none invisible'
                )}
                aria-hidden={!displayCard}
            >
                {displayCard && (
                    <div className="animate-in fade-in zoom-in-95 duration-200 pb-2">
                        <CardHeader
                            label={t(labelKey)}
                            code={displayCard.code}
                            className="text-xs mb-1.5 gap-2"
                            iconSize={14}
                        />
                        <p className="text-slate-800 text-base font-medium leading-relaxed">
                            {displayCard.text}
                        </p>
                    </div>
                )}
            </div>

            <div
                className={cn(
                    'transition-opacity duration-500 absolute inset-0',
                    !displayCard
                        ? 'opacity-100 z-10 delay-100'
                        : 'opacity-0 z-0 pointer-events-none invisible'
                )}
                data-testid="reading-zone-tips"
            >
                <MethodologyTips variant="desktop" />
            </div>
            {hasOverflow && displayCard && <ScrollIndicator />}
        </div>
    );
};

export default React.memo(ReadingZone);
