/**
 * Tests for LoginPage component
 *
 * Verifies form validation, authentication flow, and error handling.
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import LoginPage from './LoginPage';

// Mock dependencies
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
    const actual = await vi.importActual('react-router-dom');
    return {
        ...actual,
        useNavigate: () => mockNavigate,
        useSearchParams: () => [new URLSearchParams()],
    };
});

vi.mock('sonner', () => ({
    toast: {
        error: vi.fn(),
        success: vi.fn(),
    },
}));

const mockLoginMutation = vi.fn();
const mockMeQuery = vi.fn();

vi.mock('@/api/generated', () => ({
    useLoginForAccessTokenApiTokenPost: () => ({
        mutateAsync: mockLoginMutation,
    }),
    useReadUsersMeApiMeGet: () => ({
        refetch: mockMeQuery,
    }),
}));

vi.mock('@/store/useAuthStore', () => ({
    useAuthStore: {
        setState: vi.fn(),
        getState: () => ({ token: null }),
    },
}));

// Mock framer-motion to avoid animation issues in tests
vi.mock('framer-motion', () => ({
    motion: {
        div: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
            <div {...props}>{children}</div>
        ),
        form: ({ children, ...props }: React.FormHTMLAttributes<HTMLFormElement>) => (
            <form {...props}>{children}</form>
        ),
    },
}));

const renderLoginPage = () => {
    return render(
        <MemoryRouter>
            <LoginPage />
        </MemoryRouter>
    );
};

describe('LoginPage', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('rendering', () => {
        it('renders login form with email and password fields', () => {
            renderLoginPage();

            expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
            expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
        });

        it('renders sign in button', () => {
            renderLoginPage();

            expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
        });

        it('renders branding elements', () => {
            renderLoginPage();

            // Should have some branding (title or logo)
            expect(screen.getByText(/open-q/i)).toBeInTheDocument();
        });
    });

    describe('form validation', () => {
        it('shows email input with type email', () => {
            renderLoginPage();

            const emailInput = screen.getByLabelText(/email/i);
            expect(emailInput).toHaveAttribute('type', 'email');
        });

        it('shows password input with type password', () => {
            renderLoginPage();

            const passwordInput = screen.getByLabelText(/password/i);
            expect(passwordInput).toHaveAttribute('type', 'password');
        });

        it('requires both fields', () => {
            renderLoginPage();

            const emailInput = screen.getByLabelText(/email/i);
            const passwordInput = screen.getByLabelText(/password/i);

            expect(emailInput).toBeRequired();
            expect(passwordInput).toBeRequired();
        });
    });

    describe('authentication flow', () => {
        it('calls login mutation on form submit', async () => {
            mockLoginMutation.mockResolvedValue({ access_token: 'test-token' });
            mockMeQuery.mockResolvedValue({
                data: { id: 1, email: 'test@example.com', is_superuser: false },
            });

            renderLoginPage();

            const emailInput = screen.getByLabelText(/email/i);
            const passwordInput = screen.getByLabelText(/password/i);
            const submitButton = screen.getByRole('button', { name: /sign in/i });

            fireEvent.change(emailInput, { target: { value: 'test@example.com' } });
            fireEvent.change(passwordInput, { target: { value: 'password123' } });
            fireEvent.click(submitButton);

            await waitFor(() => {
                expect(mockLoginMutation).toHaveBeenCalled();
            });
        });

        it('navigates to admin on successful login', async () => {
            mockLoginMutation.mockResolvedValue({ access_token: 'test-token' });
            mockMeQuery.mockResolvedValue({
                data: { id: 1, email: 'test@example.com', is_superuser: false },
            });

            renderLoginPage();

            const emailInput = screen.getByLabelText(/email/i);
            const passwordInput = screen.getByLabelText(/password/i);
            const submitButton = screen.getByRole('button', { name: /sign in/i });

            fireEvent.change(emailInput, { target: { value: 'test@example.com' } });
            fireEvent.change(passwordInput, { target: { value: 'password123' } });
            fireEvent.click(submitButton);

            await waitFor(() => {
                expect(mockNavigate).toHaveBeenCalledWith('/admin');
            });
        });
    });

    describe('error handling', () => {
        it('shows error toast on login failure', async () => {
            const { toast } = await import('sonner');
            mockLoginMutation.mockRejectedValue(new Error('401 Unauthorized'));

            renderLoginPage();

            const emailInput = screen.getByLabelText(/email/i);
            const passwordInput = screen.getByLabelText(/password/i);
            const submitButton = screen.getByRole('button', { name: /sign in/i });

            fireEvent.change(emailInput, { target: { value: 'test@example.com' } });
            fireEvent.change(passwordInput, { target: { value: 'wrongpassword' } });
            fireEvent.click(submitButton);

            await waitFor(() => {
                expect(toast.error).toHaveBeenCalledWith('Invalid email or password');
            });
        });

        it('shows generic error for non-401 failures', async () => {
            const { toast } = await import('sonner');
            mockLoginMutation.mockRejectedValue(new Error('500 Server Error'));

            renderLoginPage();

            const emailInput = screen.getByLabelText(/email/i);
            const passwordInput = screen.getByLabelText(/password/i);
            const submitButton = screen.getByRole('button', { name: /sign in/i });

            fireEvent.change(emailInput, { target: { value: 'test@example.com' } });
            fireEvent.change(passwordInput, { target: { value: 'password' } });
            fireEvent.click(submitButton);

            await waitFor(() => {
                expect(toast.error).toHaveBeenCalledWith('Something went wrong. Please try again.');
            });
        });
    });

    describe('loading state', () => {
        it('disables form during submission', async () => {
            // Create a promise that never resolves to simulate loading
            mockLoginMutation.mockImplementation(() => new Promise(() => {}));

            renderLoginPage();

            const emailInput = screen.getByLabelText(/email/i);
            const passwordInput = screen.getByLabelText(/password/i);
            const submitButton = screen.getByRole('button', { name: /sign in/i });

            fireEvent.change(emailInput, { target: { value: 'test@example.com' } });
            fireEvent.change(passwordInput, { target: { value: 'password' } });
            fireEvent.click(submitButton);

            await waitFor(() => {
                expect(submitButton).toBeDisabled();
            });
        });
    });
});
