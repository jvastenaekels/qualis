/*
 * Open-Q - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

import { screen, fireEvent } from '@testing-library/react';
import { renderWithProviders } from '../test/test-utils';
import { describe, it, expect, vi } from 'vitest';
import LandingPage from './LandingPage';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
    const actual = await vi.importActual('react-router-dom');
    return {
        ...actual,
        useNavigate: () => mockNavigate,
    };
});

describe('LandingPage', () => {
    it('renders landing page inputs', () => {
        renderWithProviders(<LandingPage />);
        expect(screen.getByPlaceholderText(/e.g. example-study/i)).toBeInTheDocument();
        expect(screen.getByRole('button')).toBeDisabled();
    });

    it('enables button when input is filled', () => {
        renderWithProviders(<LandingPage />);
        const input = screen.getByPlaceholderText(/e.g. example-study/i);
        fireEvent.change(input, { target: { value: 'test-study' } });

        expect(screen.getByRole('button', { name: /go to study/i })).not.toBeDisabled();
    });

    it('navigates to study on submit', () => {
        renderWithProviders(<LandingPage />);

        const input = screen.getByPlaceholderText(/e.g. example-study/i);
        fireEvent.change(input, { target: { value: 'test-study' } });

        const button = screen.getByRole('button');
        fireEvent.click(button);

        expect(mockNavigate).toHaveBeenCalledWith('/study/test-study/welcome');
    });
});
