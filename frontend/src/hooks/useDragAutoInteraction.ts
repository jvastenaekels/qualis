/*
 * Qualis - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

import { useCallback, useRef } from 'react';
import type { InteractionUtils } from '../types/grid';
import { computeNextPanPosition, computeEdgePanSpeed } from './useDragAutoInteraction.helpers';

interface UseDragAutoInteractionProps {
    interactionUtils: InteractionUtils | null | undefined;
    onPan?: () => void;
}

export const useDragAutoInteraction = ({
    interactionUtils,
    onPan,
}: UseDragAutoInteractionProps) => {
    const lastPos = useRef({ x: 0, y: 0 });
    const dwellTimer = useRef<NodeJS.Timeout | null>(null);
    const panActivationTimer = useRef<NodeJS.Timeout | null>(null);
    const panInterval = useRef<NodeJS.Timeout | null>(null);
    const panSpeed = useRef({ dx: 0, dy: 0 });

    const stopPan = useCallback(() => {
        if (panActivationTimer.current) {
            clearTimeout(panActivationTimer.current);
            panActivationTimer.current = null;
        }
        if (panInterval.current) {
            clearInterval(panInterval.current);
            panInterval.current = null;
        }
    }, []);

    const startPanInterval = useCallback(() => {
        if (panInterval.current) return;

        panInterval.current = setInterval(() => {
            const transform = interactionUtils?.transformRef.current;
            const content = interactionUtils?.contentRef.current;
            const wrapper = interactionUtils?.wrapperRef.current;

            if (!transform || !content || !wrapper) return;

            const state = transform.instance.transformState;
            const gridEl = document.querySelector('[data-testid="grid-container"]');
            const gridRect = gridEl ? gridEl.getBoundingClientRect() : null;

            const next = computeNextPanPosition(
                state,
                panSpeed.current,
                lastPos.current,
                {
                    contentW: content.offsetWidth,
                    contentH: content.offsetHeight,
                    wrapperW: wrapper.clientWidth,
                    wrapperH: wrapper.clientHeight,
                },
                gridRect
            );

            if (next) {
                transform.setTransform(next.x, next.y, state.scale, 0);
                onPan?.();
            } else {
                stopPan();
            }
        }, 16);
    }, [interactionUtils, onPan, stopPan]);

    const schedulePanActivation = useCallback(() => {
        if (panInterval.current || panActivationTimer.current) return;
        panActivationTimer.current = setTimeout(() => {
            panActivationTimer.current = null;
            if (panSpeed.current.dx !== 0 || panSpeed.current.dy !== 0) {
                startPanInterval();
            }
        }, 500);
    }, [startPanInterval]);

    const updateInteraction = useCallback(
        (x: number, y: number) => {
            if (!interactionUtils || !interactionUtils.transformRef.current) return;

            const threshold = 10;
            const dist = Math.sqrt((x - lastPos.current.x) ** 2 + (y - lastPos.current.y) ** 2);

            // Dwell Zoom
            if (dist > threshold) {
                if (dwellTimer.current) clearTimeout(dwellTimer.current);
                dwellTimer.current = setTimeout(() => {
                    interactionUtils.zoomIn();
                }, 750);
                lastPos.current = { x, y };
            }

            const wrapper = interactionUtils.wrapperRef.current;
            if (!wrapper) return;

            const rect = wrapper.getBoundingClientRect();
            const { dx, dy } = computeEdgePanSpeed(x, y, rect);
            panSpeed.current = { dx, dy };

            if (dx !== 0 || dy !== 0) {
                schedulePanActivation();
            } else {
                stopPan();
            }
        },
        [interactionUtils, stopPan, schedulePanActivation]
    );

    const cleanupInteraction = useCallback(() => {
        if (dwellTimer.current) clearTimeout(dwellTimer.current);
        stopPan();
    }, [stopPan]);

    const initInteraction = useCallback((x: number, y: number) => {
        lastPos.current = { x, y };
    }, []);

    return {
        initInteraction,
        updateInteraction,
        cleanupInteraction,
    };
};
