/*
 * Qualis - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useViewport } from '@/contexts/ViewportContext';
import { computeCardDimensions } from './useGridCalculations.helpers';

interface GridColumn {
    score: number;
    capacity: number;
}

interface UseGridCalculationsProps {
    gridColumns: GridColumn[];
    selectedCardId?: number | null;
    onDimensionsChange?: (dimensions: { width: number; height: number }) => void;
}

export const useGridCalculations = ({
    gridColumns,
    selectedCardId,
    onDimensionsChange,
}: UseGridCalculationsProps) => {
    const { isDesktop, isLandscape } = useViewport(); // Centralized viewport detection
    const wrapperRef = useRef<HTMLDivElement>(null);
    const prevLandscapeRef = useRef(isLandscape);
    const [cardDimensions, setCardDimensions] = useState({
        width: 160,
        height: 96,
    });

    const calculateOptimalSize = useCallback(() => {
        if (!wrapperRef.current) return;

        const orientationChanged = isLandscape !== prevLandscapeRef.current;
        if (orientationChanged) {
            prevLandscapeRef.current = isLandscape;
        }
        if (selectedCardId && !isDesktop && !orientationChanged) return;

        const wrapper = wrapperRef.current;
        const next = computeCardDimensions(
            { W: wrapper.clientWidth, H: wrapper.clientHeight },
            gridColumns
        );
        if (!next) return;

        setCardDimensions((prev) => {
            if (Math.abs(prev.width - next.width) < 2 && Math.abs(prev.height - next.height) < 2) {
                return prev;
            }
            return next;
        });
    }, [gridColumns, selectedCardId, isDesktop, isLandscape]);

    // Notify parent of dimension changes via Effect to avoid "setState during render" warning
    useEffect(() => {
        onDimensionsChange?.(cardDimensions);
    }, [cardDimensions, onDimensionsChange]);

    // Initial Calculation and responsive trigger
    useEffect(() => {
        // Only calculate if NOT in focus mode (anchoring)
        // Use isDesktop check from context
        if (!selectedCardId || isDesktop) {
            calculateOptimalSize();
        }
    }, [selectedCardId, calculateOptimalSize, isDesktop]);

    // Resize Observer
    useEffect(() => {
        const wrapper = wrapperRef.current;
        if (!wrapper) return;

        let rafId: number;
        const observer = new ResizeObserver(() => {
            cancelAnimationFrame(rafId);
            rafId = requestAnimationFrame(() => {
                calculateOptimalSize();
            });
        });

        observer.observe(wrapper);
        return () => {
            observer.disconnect();
            cancelAnimationFrame(rafId);
        };
    }, [calculateOptimalSize]);

    return {
        wrapperRef,
        cardDimensions,
        calculateOptimalSize,
    };
};
