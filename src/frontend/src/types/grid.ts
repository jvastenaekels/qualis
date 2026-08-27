import type React from 'react';
import type { ReactZoomPanPinchRef } from 'react-zoom-pan-pinch';

export interface DragCard {
    statementId: number;
    col: number;
    row: number;
}

export interface InteractionUtils {
    zoomIn: (step?: number) => void;
    zoomOut: (step?: number) => void;
    performAutoFit: () => void;
    transformRef: React.RefObject<ReactZoomPanPinchRef | null>;
    wrapperRef: React.RefObject<HTMLDivElement | null>;
    contentRef: React.RefObject<HTMLDivElement | null>;
}
