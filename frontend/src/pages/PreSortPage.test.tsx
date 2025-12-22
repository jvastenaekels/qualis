/*
 * Open-Q - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import PreSortPage from './PreSortPage';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { useConfigStore } from '../store/useConfigStore';
import { useSessionStore } from '../store/useSessionStore';
import { useResponseStore } from '../store/useResponseStore';

// Mocks
const mockConfig = {
    presort_config: {
        age: { type: 'number', label: 'Age', required: true, min: 18, max: 99 },
        gender: { type: 'select', label: 'Gender', required: true, options: ['Male', 'Female'] },
        job: { type: 'text', label: 'Job Title', required: false }
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
        useConfigStore.getState().setConfig(mockConfig as any);
        useSessionStore.getState().resetSession();
        useSessionStore.getState().setConsent(true);
        useResponseStore.getState().resetResponses();
    });

    it('renders form fields based on config', () => {
        render(
            <MemoryRouter>
                <PreSortPage />
            </MemoryRouter>
        );

        expect(screen.getByLabelText(/Age/)).toBeInTheDocument();
        expect(screen.getByLabelText(/Gender/)).toBeInTheDocument();
        expect(screen.getByLabelText(/Job Title/)).toBeInTheDocument();
    });

    it('validates required fields', async () => {
         render(
            <MemoryRouter>
                <PreSortPage />
            </MemoryRouter>
        );

        const button = screen.getByRole('button');
        expect(button).toBeDisabled();

        // Fill only age (valid)
        fireEvent.input(screen.getByLabelText(/Age/), { target: { value: '25' } });
        // Gender is required but empty
        await waitFor(() => expect(button).toBeDisabled());
    });

    it('submits valid form data', async () => {
        render(
            <MemoryRouter initialEntries={['/study/test/presort']}>
                 <Routes>
                    <Route path="/study/:slug/presort" element={<PreSortPage />} />
                </Routes>
            </MemoryRouter>
        );

        fireEvent.input(screen.getByLabelText(/Age/), { target: { value: '30' } });
        fireEvent.change(screen.getByLabelText(/Gender/), { target: { value: 'Female' } });
        
        const button = screen.getByRole('button');
        await waitFor(() => expect(button).not.toBeDisabled());

        fireEvent.click(button);

        // Verify step was set to 3
        await waitFor(() => expect(useSessionStore.getState().currentStep).toBe(3));
    });

    it('persists data when re-navigating', async () => {
        const { unmount } = render(
            <MemoryRouter>
                <PreSortPage />
            </MemoryRouter>
        );

        fireEvent.input(screen.getByLabelText(/Age/), { target: { value: '45' } });
        
        // Wait for auto-save to trigger
        await waitFor(() => expect(useResponseStore.getState().presort).toEqual(expect.objectContaining({ age: '45' })));

        unmount();

        render(
            <MemoryRouter>
                <PreSortPage />
            </MemoryRouter>
        );

        expect(screen.getByLabelText(/Age/)).toHaveValue(45);
    });
});
