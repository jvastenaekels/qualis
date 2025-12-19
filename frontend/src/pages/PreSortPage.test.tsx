/*
 * Open-Q - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useState } from 'react';
import PreSortPage from './PreSortPage';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

// Mocks
const mockConfig = {
    presort_config: {
        age: { type: 'number', label: 'Age', required: true, min: 18, max: 99 },
        gender: { type: 'select', label: 'Gender', required: true, options: ['Male', 'Female'] },
        job: { type: 'text', label: 'Job Title', required: false }
    }
};

const mockSetStep = vi.fn();

// Create a mock store hook that behaves more realistically
const useMockStudyStore = () => {
    const [responses, setResponses] = useState({ presort: {} });
    return {
        config: mockConfig,
        responses,
        setPresortResponse: (data: any) => setResponses({ presort: data }),
        setStep: mockSetStep
    };
};

vi.mock('../store/useStudyStore', () => ({
    useStudyStore: vi.fn()
}));

import { useStudyStore } from '../store/useStudyStore';

describe('PreSortPage', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        (useStudyStore as any).mockImplementation(useMockStudyStore);
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

        // waitFor because the setStep might be called after async validation/submit
        await waitFor(() => expect(mockSetStep).toHaveBeenCalledWith(3));
    });

    it('persists data when re-navigating', async () => {
        // To properly test persistence, we need the mockStore to be external to the component's mount cycle
        let externalResponses = { presort: {} };
        const useMockStudyStorePersistent = () => {
            const [responses, setResponses] = useState(externalResponses);
            const setPresortResponse = (data: any) => {
                externalResponses = { presort: data };
                setResponses(externalResponses);
            };
            return {
                config: mockConfig,
                responses,
                setPresortResponse,
                setStep: mockSetStep
            };
        };
        (useStudyStore as any).mockImplementation(useMockStudyStorePersistent);

        const { unmount } = render(
            <MemoryRouter>
                <PreSortPage />
            </MemoryRouter>
        );

        fireEvent.input(screen.getByLabelText(/Age/), { target: { value: '45' } });
        
        // Wait for auto-save to trigger (it's in an effect)
        // Note: watch() returns raw strings for number inputs before coersion
        await waitFor(() => expect(externalResponses.presort).toEqual(expect.objectContaining({ age: '45' })));

        unmount();

        render(
            <MemoryRouter>
                <PreSortPage />
            </MemoryRouter>
        );

        expect(screen.getByLabelText(/Age/)).toHaveValue(45);
    });
});
