/*
 * Open-Q - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

import React from 'react';
import { useDroppable } from '@dnd-kit/core';

interface DroppableSlotProps extends React.HTMLAttributes<HTMLDivElement> {
  id: string; // Format: "col-row"
  isOver?: boolean;
  children?: React.ReactNode;
}

const DroppableSlot: React.FC<DroppableSlotProps> = ({ id, children, className, onClick, style, ...props }) => {
  const { setNodeRef, isOver } = useDroppable({
    id,
  });

  return (
    <div
      ref={setNodeRef}
      onClick={onClick}
      data-testid={id}
      style={style} // Apply style
      {...props}
      className={`
        rounded-2xl border-2 
        flex items-center justify-center 
        transition-colors duration-200
        cursor-pointer 
        ${isOver 
            ? 'bg-indigo-50 border-indigo-300 ring-2 ring-indigo-200' 
            : children 
                ? 'bg-white border-transparent shadow-sm' 
                : 'bg-white/40 border-dashed border-slate-400/60 hover:bg-white/60 hover:border-slate-500 transition-all'
        }
        ${className || ''}
      `}
    >
      {children}
    </div>
  );
};

export default DroppableSlot;
