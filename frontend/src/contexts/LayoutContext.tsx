import React, { createContext, useContext, useState, type ReactNode } from 'react';

interface LayoutContextType {
  headerAction: ReactNode;
  setHeaderAction: (node: ReactNode) => void;
}

const LayoutContext = createContext<LayoutContextType | undefined>(undefined);

export const LayoutProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [headerAction, setHeaderAction] = useState<ReactNode>(null);

  return (
    <LayoutContext.Provider value={{ headerAction, setHeaderAction }}>
      {children}
    </LayoutContext.Provider>
  );
};

export const useLayoutAction = () => {
  const context = useContext(LayoutContext);
  if (!context) {
    throw new Error('useLayoutAction must be used within a LayoutProvider');
  }
  return context;
};
