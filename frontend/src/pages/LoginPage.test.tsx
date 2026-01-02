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

// Mutable object to control hook return values
const mockLoginHookReturnValue = {
    mutateAsync: mockLoginMutation,
    isPending: false,
};

vi.mock('@/api/generated', () => ({
    useLoginForAccessTokenApiTokenPost: () => mockLoginHookReturnValue,
    useReadUsersMeApiMeGet: () => ({
        refetch: mockMeQuery,
    }),
}));

vi.mock('@/store/useAuthStore', () => {
    const setAuth = vi.fn();
    const useAuthStore = vi.fn((selector) => {
        const state = { setAuth, token: null };
        return selector ? selector(state) : state;
    });
    // Attach static methods
    // biome-ignore lint/suspicious/noExplicitAny: needed for mocking static store methods
    (useAuthStore as any).setState = vi.fn();
    // biome-ignore lint/suspicious/noExplicitAny: needed for mocking static store methods
    (useAuthStore as any).getState = vi.fn(() => ({ token: null }));
    return { useAuthStore };
});

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
        mockLoginHookReturnValue.isPending = false;
    });

    describe('rendering', () => {
        it('renders login form with email and password fields', () => {
            renderLoginPage();

            expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
            expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
        });

        it('renders sign in button', () => {
            renderLoginPage();

            expect(screen.getByRole('button', { name: /continue/i })).toBeInTheDocument();
        });

        it('renders branding elements', () => {
            renderLoginPage();

            // Should have some branding (title or logo)
            expect(screen.getByRole('heading', { name: /open-q admin/i })).toBeInTheDocument();
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
            const submitButton = screen.getByRole('button', { name: /continue/i });

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
            const submitButton = screen.getByRole('button', { name: /continue/i });

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
            const submitButton = screen.getByRole('button', { name: /continue/i });

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
            const submitButton = screen.getByRole('button', { name: /continue/i });

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
            mockLoginHookReturnValue.isPending = true;

            renderLoginPage();

            const submitButton = screen.getByRole('button', { name: /authenticating/i });
            expect(submitButton).toBeDisabled();
        });
    });
});
