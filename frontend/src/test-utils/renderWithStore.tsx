import { renderWithProviders } from './test-utils';
import { useStudyDesigner } from '../store/useStudyDesigner';
import type { StudyDesignerState } from '../store/useStudyDesigner';
import type { RenderOptions } from '@testing-library/react';
import type React from 'react';

interface RenderWithStoreOptions extends Omit<RenderOptions, 'wrapper'> {
    initialEntries?: string[];
    initialState?: Partial<StudyDesignerState>;
}

// Default values matching the store definition in useStudyDesigner.ts
const defaultDataValues: Partial<StudyDesignerState> = {
    draft: null,
    original: null,
    activeStep: 'intro',
    activeSubStep: 'statements',
    activeLocale: 'en',
    syncStatus: 'synced',
    lastSavedAt: null,
};

/**
 * Renders a component with real store initialized to specific state.
 * Resets the store before rendering to ensure test isolation.
 */
export const renderWithStore = (ui: React.ReactElement, options: RenderWithStoreOptions = {}) => {
    const { initialState, initialEntries, ...renderOptions } = options;

    // Reset store to defaults then apply overrides
    useStudyDesigner.setState({
        ...defaultDataValues,
        ...initialState,
    });

    return renderWithProviders(ui, { initialEntries, ...renderOptions });
};
