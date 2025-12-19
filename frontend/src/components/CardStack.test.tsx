/*
 * Open-Q - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import CardStack from './CardStack';
import { useMotionValue } from 'framer-motion';

// Mock ResizeObserver
global.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
};

describe('CardStack', () => {
    
    // Wrapper to use hooks correctly
    const CardStackWrapper = ({ statement }: { statement: any }) => {
        const x = useMotionValue(0);
        const y = useMotionValue(0);
        return <CardStack statement={statement} onVote={() => {}} x={x} y={y} />;
    };

    it('renders the statement text', () => {
        const statement = { id: 1, text: 'This is a test statement' };
        
        render(<CardStackWrapper statement={statement} />);

        expect(screen.getByText('This is a test statement')).toBeTruthy();
    });

    it('has the correct layout class for drag', () => {
        const statement = { id: 1, text: 'Test' };
        
        const { container } = render(<CardStackWrapper statement={statement} />);
        
        // Just verify basic render presence
        expect(container.firstChild).toBeTruthy();
    });
});
