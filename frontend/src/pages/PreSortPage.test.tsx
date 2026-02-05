/*
 * Libre-Q - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

import { fireEvent, screen, waitFor } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useConfigStore } from '../store/useConfigStore';
import { useResponseStore } from '../store/useResponseStore';
import { useSessionStore } from '../store/useSessionStore';
import { renderWithProviders } from '../test-utils/test-utils';
import PreSortPage from './PreSortPage';

// Mocks
const mockConfig = {
    presort_config: {
        age: { type: 'number', label: 'Age', required: true, min: 18, max: 99 },
        gender: {
            type: 'select',
            label: 'Gender',
            required: true,
            options: ['Male', 'Female'],
        },
        job: { type: 'text', label: 'Job Title', required: false },
    },
    statements: [],
    title: 'Test Study',
    description: 'Test',
    instructions: 'Test',
};

describe('PreSortPage', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // Setup stores
        useConfigStore
            .getState()
            .setConfig(mockConfig as unknown as import('../schemas/study').StudyConfig);
        useSessionStore.getState().resetSession();
        useSessionStore.getState().setConsent(true);
        useResponseStore.getState().resetResponses();
    });

    it('renders form fields based on config', () => {
        renderWithProviders(<PreSortPage />);

        expect(screen.getByLabelText(/Age/)).toBeInTheDocument();
        expect(screen.getByLabelText(/Gender/)).toBeInTheDocument();
        expect(screen.getByLabelText(/Job Title/)).toBeInTheDocument();
    });

    it('validates required fields', async () => {
        renderWithProviders(<PreSortPage />);

        const button = screen.getByRole('button');
        expect(button).toBeDisabled();

        // Fill only age (valid)
        fireEvent.input(screen.getByLabelText(/Age/), { target: { value: '25' } });
        // Gender is required but empty
        await waitFor(() => expect(button).toBeDisabled());
    });

    it('submits valid form data', async () => {
        renderWithProviders(
            <Routes>
                <Route path="/study/:slug/presort" element={<PreSortPage />} />
                <Route path="/study/:slug/rough-sort" element={<div>Rough Sort Page</div>} />
            </Routes>,
            { initialEntries: ['/study/test/presort'] }
        );

        fireEvent.input(screen.getByLabelText(/Age/), { target: { value: '30' } });
        fireEvent.change(screen.getByLabelText(/Gender/), {
            target: { value: 'Female' },
        });

        const button = screen.getByRole('button');
        await waitFor(() => expect(button).not.toBeDisabled());

        fireEvent.click(button);

        // Verify step was set to 3
        await waitFor(() => expect(useSessionStore.getState().currentStep).toBe(3));
    });

    it('persists data when re-navigating', async () => {
        const { unmount } = renderWithProviders(<PreSortPage />);

        fireEvent.input(screen.getByLabelText(/Age/), { target: { value: '45' } });

        // Wait for auto-save to trigger
        await waitFor(() =>
            expect(useResponseStore.getState().presort).toEqual(
                expect.objectContaining({ age: '45' })
            )
        );

        unmount();

        renderWithProviders(<PreSortPage />);

        expect(screen.getByLabelText(/Age/)).toHaveValue(45);
    });
});
