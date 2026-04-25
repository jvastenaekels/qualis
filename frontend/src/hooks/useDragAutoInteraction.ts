/*
 * Qualis - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

import { useCallback, useRef } from 'react';
import type { InteractionUtils } from '../types/grid';

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

            if (transform && content && wrapper) {
                const state = transform.instance.transformState;
                const scale = state.scale;
                const { dx: currentDx, dy: currentDy } = panSpeed.current;

                let speedFactor = 1.0;
                const gridEl = document.querySelector('[data-testid="grid-container"]');
                if (gridEl) {
                    const gridRect = gridEl.getBoundingClientRect();
                    const { x: curX, y: curY } = lastPos.current;
                    if (
                        curX < gridRect.left ||
                        curX > gridRect.right ||
                        curY < gridRect.top ||
                        curY > gridRect.bottom
                    ) {
                        speedFactor = 0.3;
                    }
                }

                const effectiveDx = currentDx * speedFactor;
                const effectiveDy = currentDy * speedFactor;

                const contentW = content.offsetWidth * scale;
                const contentH = content.offsetHeight * scale;
                const wrapperW = wrapper.clientWidth;
                const wrapperH = wrapper.clientHeight;

                const minX = wrapperW - contentW - wrapperW * 0.2;
                const maxX = wrapperW * 0.2;
                const minY = wrapperH - contentH - wrapperH * 0.2;
                const maxY = wrapperH * 0.2;

                const newX = Math.max(minX, Math.min(maxX, state.positionX + effectiveDx));
                const newY = Math.max(minY, Math.min(maxY, state.positionY + effectiveDy));

                if (newX !== state.positionX || newY !== state.positionY) {
                    transform.setTransform(newX, newY, scale, 0);
                    onPan?.();
                } else {
                    stopPan();
                }
            }
        }, 16);
    }, [interactionUtils, onPan, stopPan]);

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
            const edgeThreshold = 60;
            const maxPanSpeed = 15;

            let dx = 0;
            let dy = 0;

            if (x < rect.left + edgeThreshold) {
                dx = maxPanSpeed * Math.min((rect.left + edgeThreshold - x) / edgeThreshold, 1);
            } else if (x > rect.right - edgeThreshold) {
                dx = -maxPanSpeed * Math.min((x - (rect.right - edgeThreshold)) / edgeThreshold, 1);
            }

            if (y < rect.top + edgeThreshold) {
                dy = maxPanSpeed * Math.min((rect.top + edgeThreshold - y) / edgeThreshold, 1);
            } else if (y > rect.bottom - edgeThreshold) {
                dy =
                    -maxPanSpeed * Math.min((y - (rect.bottom - edgeThreshold)) / edgeThreshold, 1);
            }

            panSpeed.current = { dx, dy };

            if (dx !== 0 || dy !== 0) {
                if (!panInterval.current && !panActivationTimer.current) {
                    panActivationTimer.current = setTimeout(() => {
                        panActivationTimer.current = null;
                        if (panSpeed.current.dx !== 0 || panSpeed.current.dy !== 0) {
                            startPanInterval();
                        }
                    }, 500);
                }
            } else {
                stopPan();
            }
        },
        [interactionUtils, stopPan, startPanInterval]
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
