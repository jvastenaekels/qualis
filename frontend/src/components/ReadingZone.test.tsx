import { render, screen } from '@testing-library/react';
import { act } from 'react-dom/test-utils';
import { describe, expect, it } from 'vitest';
import ReadingZone from './ReadingZone';
import { useUIStore } from '../store/useUIStore';

describe('ReadingZone', () => {
    it('shows methodology tips when idle (no card selected or hovered)', () => {
        // Arrange: Ensure store is clean
        act(() => {
            useUIStore.setState({ hoveredCard: null, activeCard: null, selectedCard: null });
        });

        // Act
        render(<ReadingZone variant="desktop" />);

        // Assert: Check for text present in MethodologyTips
        // MethodologyTips renders keys like 'fine.workbench.methodology.extremes' if translations are mocked to return keys
        // In Step 5045, MethodologyTips logic sets step=0 initially.
        // tips[0] = t('fine.workbench.drag_or_tap')
        // So we expect to find this text.
        expect(screen.getByText('fine.workbench.methodology.extremes')).toBeInTheDocument();

        // Also check if the Lightbulb icon container is present (by class or role?)
        // The text is the most important part.
    });

    it('shows hovered card text when a card is hovered', () => {
        // Arrange
        act(() => {
            useUIStore.setState({
                hoveredCard: { id: 1, text: 'Hovered Statement Content', code: 'S1' },
                activeCard: null,
                selectedCard: null,
            });
        });

        // Act
        render(<ReadingZone variant="desktop" />);

        // Assert
        expect(screen.getByText(/Hovered Statement Content/)).toBeInTheDocument();
        expect(screen.getByText(/S1/)).toBeInTheDocument();
        // Should NOT show tips
        expect(screen.queryByText('fine.workbench.methodology.extremes')).not.toBeInTheDocument();
    });

    it('shows selected card text when a card is selected', () => {
        // Arrange
        act(() => {
            useUIStore.setState({
                hoveredCard: null,
                activeCard: null,
                selectedCard: { id: 2, text: 'Selected Statement Content', code: 'S2' },
            });
        });

        // Act
        render(<ReadingZone variant="desktop" />);

        // Assert
        expect(screen.getByText(/Selected Statement Content/)).toBeInTheDocument();
        expect(screen.getByText(/S2/)).toBeInTheDocument();
    });
});
