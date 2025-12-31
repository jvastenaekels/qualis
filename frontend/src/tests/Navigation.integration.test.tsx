import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, act } from '@testing-library/react';
import { renderWithProviders } from '../test/test-utils';
import { Routes, Route, useNavigate } from 'react-router-dom';
import StudyLayout from '../layouts/StudyLayout';
import { useSessionStore } from '../store/useSessionStore';
import { useConfigStore } from '../store/useConfigStore';
import type { StudyConfig } from '../schemas/study';

// Mocks for pages that simulate navigation
const MockWelcome = () => {
    const navigate = useNavigate();
    const setStep = useSessionStore((state) => state.setStep);
    return (
        <div>
            <h1>Welcome Page</h1>
            <button
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
                onClick={() => {
                    setStep(1);
                    navigate('/study/demo/welcome');
                }}
            >
                Back
            </button>
            <button
                onClick={() => {
                    setStep(3);
                    navigate('/study/demo/sort/rough');
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
                    <Route path="sort/rough" element={<MockRoughSort />} />
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
