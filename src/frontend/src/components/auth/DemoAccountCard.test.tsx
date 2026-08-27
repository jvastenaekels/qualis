import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DemoAccountCard } from './DemoAccountCard';
import { usePlatformConfigStore } from '@/store/usePlatformConfigStore';

describe('DemoAccountCard', () => {
    beforeEach(() => {
        usePlatformConfigStore.setState({ isDemo: false });
    });

    it('renders nothing when the instance is not a demo', () => {
        const { container } = render(<DemoAccountCard onFill={vi.fn()} />);
        expect(container).toBeEmptyDOMElement();
    });

    /**
     * The defect this guards is not "the card is missing" — it is the card
     * appearing on a real deployment and advertising an account to try. The
     * store defaults to false and only an explicit `demo_mode: true` from
     * /api/config flips it, so this asserts the default rather than trusting it.
     */
    it('stays hidden on the store default, without anything having to set it', () => {
        usePlatformConfigStore.setState(usePlatformConfigStore.getInitialState());
        const { container } = render(<DemoAccountCard onFill={vi.fn()} />);
        expect(container).toBeEmptyDOMElement();
    });

    it('welcomes the visitor when the instance is a demo', () => {
        usePlatformConfigStore.setState({ isDemo: true });
        render(<DemoAccountCard onFill={vi.fn()} />);
        expect(screen.getByText(/this is the Qualis demo/i)).toBeInTheDocument();
        expect(screen.getByText(/nothing you do can break anything/i)).toBeInTheDocument();
    });

    it('hands the published demo credentials to its caller', async () => {
        const user = userEvent.setup();
        const onFill = vi.fn();
        usePlatformConfigStore.setState({ isDemo: true });
        render(<DemoAccountCard onFill={onFill} />);

        await user.click(screen.getByRole('button', { name: /fill in the demo account/i }));

        // Must match docker-compose.yml's ADMIN_EMAIL / ADMIN_PASSWORD and the
        // README quick-start table. If those change, this fails — which is the
        // point: the card would otherwise silently offer a dead account.
        expect(onFill).toHaveBeenCalledWith('admin@example.com', 'admin123');
    });

    it('shows the credentials as well as filling them', () => {
        usePlatformConfigStore.setState({ isDemo: true });
        render(<DemoAccountCard onFill={vi.fn()} />);
        // A visitor should be able to read what is about to be typed for them,
        // and to type it themselves instead.
        expect(screen.getByText(/admin@example\.com/)).toBeInTheDocument();
        expect(screen.getByText(/admin123/)).toBeInTheDocument();
    });
});
