/*
 * Qualis - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

import { use } from 'react';
import { LayoutActionContext, LayoutStateContext } from '../contexts/LayoutContext.context';

export const useLayoutState = () => {
    const context = use(LayoutStateContext);
    if (!context) {
        throw new Error('useLayoutState must be used within a LayoutProvider');
    }
    return context;
};

export const useLayoutAction = () => {
    const context = use(LayoutActionContext);
    if (!context) {
        throw new Error('useLayoutAction must be used within a LayoutProvider');
    }
    return context;
};
