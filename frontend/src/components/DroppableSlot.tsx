/*
 * Libre-Q - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

import { useDroppable } from '@dnd-kit/core';
import React from 'react';

interface DroppableSlotProps extends React.HTMLAttributes<HTMLDivElement> {
    id: string; // Format: "col-row"
    isOver?: boolean;
    children?: React.ReactNode;
    role?: string;
}

const DroppableSlot: React.FC<DroppableSlotProps> = React.memo(
    ({ id, children, className, onClick, style, role = 'button', ...props }) => {
        const { setNodeRef, isOver } = useDroppable({
            id,
        });

        const commonProps = {
            id,
            ref: setNodeRef,
            onClick,
            onKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    const pseudoEvent = {
                        ...e,
                        currentTarget: e.currentTarget,
                        target: e.target,
                    } as unknown as React.MouseEvent<HTMLDivElement>;
                    onClick?.(pseudoEvent);
                }
            },
            'data-testid': id,
            style,
            ...props,
            className: `
        rounded-2xl border-2
        flex items-center justify-center
        transition-colors duration-200
        cursor-pointer
        focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:outline-none
        ${
            isOver
                ? 'bg-indigo-50 border-indigo-300 ring-2 ring-indigo-200'
                : children
                  ? 'bg-white border-transparent shadow-sm'
                  : 'bg-white/40 border-dashed border-slate-400/60 hover:bg-white/60 hover:border-slate-500 transition-all'
        }
        ${className || ''}
      `,
        };

        if (role === 'gridcell') {
            return (
                <div {...commonProps} role="gridcell" tabIndex={0}>
                    {children}
                </div>
            );
        }

        return (
            <div {...commonProps} role="button" tabIndex={0}>
                {children}
            </div>
        );
    }
);

export default DroppableSlot;
