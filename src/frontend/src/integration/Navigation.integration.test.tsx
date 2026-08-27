import { act, screen } from '@testing-library/react';
import { Route, Routes, useNavigate } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import StudyLayout from '../layouts/StudyLayout';
import type { StudyConfig } from '../schemas/study';
import { useConfigStore } from '../store/useConfigStore';
import { useSessionStore } from '../store/useSessionStore';
import { renderWithProviders } from '../test-utils/test-utils';

// Mocks for pages that simulate navigation
const MockWelcome = () => {
    const navigate = useNavigate();
    const setStep = useSessionStore((state) => state.setStep);
    return (
        <div>
            <h1>Welcome Page</h1>
            <button
                type="button"
                onClick={() => {
                    setStep(2);
                    navigate('/study/demo/presort');
                }}
            >
                Start
            </button>
        </div>
    );
};

const MockPreSort = () => {
    const navigate = useNavigate();
    const setStep = useSessionStore((state) => state.setStep);
    return (
        <div>
            <h1>PreSort Page</h1>
            <button
                type="button"
                onClick={() => {
                    setStep(1);
                    navigate('/study/demo/welcome');
                }}
            >
                Back
            </button>
            <button
                type="button"
                onClick={() => {
                    setStep(3);
                    navigate('/study/demo/rough-sort');
                }}
            >
                Next
            </button>
        </div>
    );
};

const MockRoughSort = () => {
    const navigate = useNavigate();
    const setStep = useSessionStore((state) => state.setStep);
    return (
        <div>
            <h1>RoughSort Page</h1>
            <button
                type="button"
                onClick={() => {
                    setStep(2);
                    navigate('/study/demo/presort');
                }}
            >
                Back
            </button>
        </div>
    );
};

const mockConfig: StudyConfig = {
    slug: 'demo',
    title: 'Test Study',
    description: 'Test Description',
    instructions: 'Instructions',
    statements: [],
    presort_config: {},
    grid_config: [],
    state: 'active',
};

describe('Navigation Integration', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        useConfigStore.getState().setConfig(mockConfig);
        useSessionStore.getState().resetSession();
        useSessionStore.getState().setConsent(true); // Bypass consent guard
    });

    it('navigates forward and backward correctly', () => {
        renderWithProviders(
            <Routes>
                <Route path="/study/:slug" element={<StudyLayout />}>
                    <Route path="welcome" element={<MockWelcome />} />
                    <Route path="presort" element={<MockPreSort />} />
                    <Route path="rough-sort" element={<MockRoughSort />} />
                </Route>
            </Routes>,
            { initialEntries: ['/study/demo/welcome'] }
        );

        // Initial State
        expect(screen.getByText('Welcome Page')).toBeTruthy();
        expect(useSessionStore.getState().currentStep).toBe(1);

        // Forward to PreSort
        act(() => {
            screen.getByText('Start').click();
        });
        expect(screen.getByText('PreSort Page')).toBeTruthy();
        expect(useSessionStore.getState().currentStep).toBe(2);
        expect(useSessionStore.getState().maxReachedStep).toBe(2);

        // Forward to RoughSort
        act(() => {
            screen.getByText('Next').click();
        });
        expect(screen.getByText('RoughSort Page')).toBeTruthy();
        expect(useSessionStore.getState().currentStep).toBe(3);
        expect(useSessionStore.getState().maxReachedStep).toBe(3);

        // Backward to PreSort
        act(() => {
            screen.getByText('Back').click();
        });
        expect(screen.getByText('PreSort Page')).toBeTruthy();
        expect(useSessionStore.getState().currentStep).toBe(2);
        // Max reached should remain 3
        expect(useSessionStore.getState().maxReachedStep).toBe(3);
    });
});
