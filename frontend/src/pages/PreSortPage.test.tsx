import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import PreSortPage from './PreSortPage';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

// Mocks
const mockSetPresortResponse = vi.fn();
const mockSetStep = vi.fn();
const mockConfig = {
    presort_config: {
        age: { type: 'number', label: 'Age', required: true, min: 18, max: 99 },
        gender: { type: 'select', label: 'Gender', required: true, options: ['Male', 'Female'] },
        job: { type: 'text', label: 'Job Title', required: false }
    }
};

vi.mock('../store/useStudyStore', () => ({
    useStudyStore: () => ({
        config: mockConfig,
        setPresortResponse: mockSetPresortResponse,
        setStep: mockSetStep
    })
}));

describe('PreSortPage', () => {
    beforeEach(() => {
        vi.clearAllMocks();
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
        expect(button).toBeDisabled();
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
        expect(button).not.toBeDisabled();

        fireEvent.click(button);

        expect(mockSetPresortResponse).toHaveBeenCalledWith({
            age: 30, // Zod coerces this to a number
            gender: 'Female',
            job: ''
        });
        expect(mockSetStep).toHaveBeenCalledWith(3);
    });
});
