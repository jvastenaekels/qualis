import React, { type ReactNode, useMemo, useState } from 'react';
import { LayoutActionContext, LayoutStateContext } from './LayoutContext.context';

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
