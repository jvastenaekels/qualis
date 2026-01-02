/**
 * Tests for DashboardSkeleton component
 *
 * Verifies skeleton variants render correctly.
 */
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { DashboardSkeleton, DesignerSkeleton, TableSkeleton } from './DashboardSkeleton';

describe('DashboardSkeleton', () => {
    it('renders without crashing', () => {
        const { container } = render(<DashboardSkeleton />);
        expect(container).toBeInTheDocument();
    });

    it('renders skeleton elements with pulse animation', () => {
        const { container } = render(<DashboardSkeleton />);
        const pulsingElements = container.querySelectorAll('.animate-pulse');
        expect(pulsingElements.length).toBeGreaterThan(0);
    });
});

describe('DesignerSkeleton', () => {
    it('renders without crashing', () => {
        const { container } = render(<DesignerSkeleton />);
        expect(container).toBeInTheDocument();
    });

    it('renders skeleton elements', () => {
        const { container } = render(<DesignerSkeleton />);
        const skeletons = container.querySelectorAll('.animate-pulse');
        expect(skeletons.length).toBeGreaterThan(0);
    });
});

describe('TableSkeleton', () => {
    it('renders without crashing', () => {
        const { container } = render(<TableSkeleton />);
        expect(container).toBeInTheDocument();
    });

    it('renders skeleton rows', () => {
        const { container } = render(<TableSkeleton />);
        const skeletons = container.querySelectorAll('.animate-pulse');
        expect(skeletons.length).toBeGreaterThan(0);
    });
});
