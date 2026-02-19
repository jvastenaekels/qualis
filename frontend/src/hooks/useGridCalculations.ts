/*
 * Libre-Q - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useViewport } from '@/contexts/ViewportContext';

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

        // Grid Anchoring: Do not resize cards when in Mobile Focus Mode (Deck Collapsed)
        // This prevents "Layout Thrashing" / Chaos.
        // Exception: allow recalculation when orientation changes (e.g. portrait→landscape)
        const orientationChanged = isLandscape !== prevLandscapeRef.current;
        if (orientationChanged) {
            prevLandscapeRef.current = isLandscape;
        }
        if (selectedCardId && !isDesktop && !orientationChanged) return;

        const wrapper = wrapperRef.current;
        const W = wrapper.clientWidth;
        const H = wrapper.clientHeight;
        if (W === 0 || H === 0) return;

        const numCols = gridColumns.length;
        if (numCols === 0) return;

        const maxRows = Math.max(...gridColumns.map((c) => c.capacity || 0));
        if (maxRows === 0) return;

        // Calculate max possible dimensions based on available space
        // We want to maximize card size within the viewport before applying zoom
        const GAP = 8; // gap-2
        const PADDING_X = 32; // px-4 * 2
        const PADDING_Y = 32;

        const availableW = W - PADDING_X - (numCols - 1) * GAP;
        const availableH = H - PADDING_Y - (maxRows - 1) * GAP;

        if (availableW <= 0 || availableH <= 0) return;

        // Ideal raw dimensions to just fit
        const rawW = availableW / numCols;
        const rawH = availableH / maxRows;

        // We want to maintain a reasonable Aspect Ratio (e.g. 3/2 or 4/3)
        // But also fill space.
        // Let's deduce an optimal Aspect Ratio that fits the screen shape best
        // constrained between square (1.0) and wide (2.2)
        const currentRatio = rawW / rawH; // This is the ratio if we stretch to fill perfectly

        // Clamp ratio to keep cards looking like cards
        const clampedRatio = Math.max(1.2, Math.min(currentRatio, 1.8));

        // Now calculate dimensions based on this clamped ratio
        // We fit within rawW and rawH
        let newWidth = rawW;
        let newHeight = rawW / clampedRatio;

        if (newHeight > rawH) {
            newHeight = rawH;
            newWidth = newHeight * clampedRatio;
        }

        // Enforce a minimum legible size (e.g. for mobile or small screens)
        // Zoom will handle downscaling if needed, but for layout calculation we want robust base
        newWidth = Math.max(newWidth, 140);
        newHeight = Math.max(newHeight, 90);

        setCardDimensions((prev) => {
            if (Math.abs(prev.width - newWidth) < 2 && Math.abs(prev.height - newHeight) < 2)
                return prev;
            return { width: newWidth, height: newHeight };
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
