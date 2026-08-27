import { createContext, type ReactNode } from 'react';

export interface LayoutState {
    headerAction: ReactNode;
}

export interface LayoutActions {
    setHeaderAction: (node: ReactNode) => void;
}

export const LayoutStateContext = createContext<LayoutState | undefined>(undefined);
export const LayoutActionContext = createContext<LayoutActions | undefined>(undefined);
