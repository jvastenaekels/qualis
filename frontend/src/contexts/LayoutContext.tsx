import React, { createContext, useContext, useState, useMemo, type ReactNode } from 'react';

interface LayoutState {
  headerAction: ReactNode;
}

interface LayoutActions {
  setHeaderAction: (node: ReactNode) => void;
}

const LayoutStateContext = createContext<LayoutState | undefined>(undefined);
const LayoutActionContext = createContext<LayoutActions | undefined>(undefined);

export const LayoutProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [headerAction, setHeaderAction] = useState<ReactNode>(null);
  
  const actions = useMemo(() => ({ setHeaderAction }), []);

  return (
    <LayoutActionContext.Provider value={actions}>
      <LayoutStateContext.Provider value={{ headerAction }}>
        {children}
      </LayoutStateContext.Provider>
    </LayoutActionContext.Provider>
  );
};

export const useLayoutState = () => {
    const context = useContext(LayoutStateContext);
    if (!context) {
        throw new Error('useLayoutState must be used within a LayoutProvider');
    }
    return context;
};

export const useLayoutAction = () => {
  const context = useContext(LayoutActionContext);
  if (!context) {
    throw new Error('useLayoutAction must be used within a LayoutProvider');
  }
  return context;
};
