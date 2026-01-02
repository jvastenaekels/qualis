/**
 * Tests for QSortEditor component
 *
 * Verifies Q-sort design logic, including statement management,
 * grid configuration, and validation.
 */
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import QSortEditor from './QSortEditor';

// Mock dependencies
const mockUpdateDraft = vi.fn();
const mockUseStudyDesigner = vi.fn();

vi.mock('@/store/useStudyDesigner', () => ({
    useStudyDesigner: () => mockUseStudyDesigner(),
}));

// Mock UI components to avoid Radix UI testing issues
vi.mock('@/components/ui/tabs', () => ({
    Tabs: ({
        onValueChange,
        children,
    }: {
        onValueChange: (v: string) => void;
        children: React.ReactNode;
    }) => (
        <div data-testid="tabs-root">
            <div data-testid="tabs-debug-controls" style={{ display: 'none' }}>
                <button
                    type="button"
                    data-testid="switch-statements"
                    onClick={() => onValueChange('statements')}
                >
                    SwitchToStatements
                </button>
                <button
                    type="button"
                    data-testid="switch-grid"
                    onClick={() => onValueChange('grid')}
                >
                    SwitchToGrid
                </button>
            </div>
            {children}
        </div>
    ),
    TabsList: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    TabsTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    TabsContent: ({ value, children }: { value: string; children: React.ReactNode }) => (
        <div data-tab-content={value}>{children}</div>
    ),
}));

describe('QSortEditor', () => {
    const defaultDraft = {
        grid_config: [],
        translations: [],
    };

    beforeEach(() => {
        vi.clearAllMocks();
        mockUseStudyDesigner.mockReturnValue({
            draft: defaultDraft,
            activeLocale: 'en',
            updateDraft: mockUpdateDraft,
        });
    });

    describe('rendering', () => {
        it('returns null if draft is missing', () => {
            mockUseStudyDesigner.mockReturnValue({ draft: null });
            const { container } = render(<QSortEditor />);
            expect(container).toBeEmptyDOMElement();
        });

        it('renders main tabs', () => {
            render(<QSortEditor />);
            expect(screen.getByText('Statements')).toBeInTheDocument();
            expect(screen.getByText('Distribution')).toBeInTheDocument();
        });
    });

    describe('statements management', () => {
        it('renders existing statements', () => {
            mockUseStudyDesigner.mockReturnValue({
                draft: {
                    statements: [
                        {
                            code: 's1',
                            translations: [{ language_code: 'en', text: 'Statement 1' }],
                        },
                        {
                            code: 's2',
                            translations: [{ language_code: 'en', text: 'Statement 2' }],
                        },
                    ],
                },
                activeLocale: 'en',
                updateDraft: mockUpdateDraft,
            });

            render(<QSortEditor />);

            expect(screen.getByText('Statement 1')).toBeInTheDocument();
            expect(screen.getByText('Statement 2')).toBeInTheDocument();
        });

        it('parses bulk text and calls updateDraft', () => {
            render(<QSortEditor />);

            const textarea = screen.getByPlaceholderText(/paste your statements here/i);
            const processButton = screen.getByRole('button', {
                name: /process & replace/i,
            });

            fireEvent.change(textarea, {
                target: { value: '1. New Statement A\n2) New Statement B\n3- New Statement C' },
            });
            fireEvent.click(processButton);

            expect(mockUpdateDraft).toHaveBeenCalled();
            // Verify logic by capturing the callback
            const callback = mockUpdateDraft.mock.calls[0][0];
            const draft = { statements: [] };
            callback(draft);

            // Expect numbers/bullets to be cleaned
            expect(draft.statements).toHaveLength(3);
            expect(draft.statements[0].translations[0].text).toBe('New Statement A');
            expect(draft.statements[1].translations[0].text).toBe('New Statement B');
            expect(draft.statements[2].translations[0].text).toBe('New Statement C');
        });
    });

    describe('grid configuration', () => {
        it('renders grid columns', async () => {
            mockUseStudyDesigner.mockReturnValue({
                draft: {
                    statements: [],
                    grid_config: [
                        { score: -2, capacity: 2 },
                        { score: 0, capacity: 5 },
                    ],
                },
                activeLocale: 'en',
                updateDraft: mockUpdateDraft,
            });

            render(<QSortEditor />);

            // Switch to grid tab
            fireEvent.click(screen.getByTestId('switch-grid'));

            expect(screen.getByText('-2')).toBeInTheDocument();
        });

        it('updates grid capacity on click', async () => {
            mockUseStudyDesigner.mockReturnValue({
                draft: {
                    statements: [],
                    grid_config: [{ score: -1, capacity: 2 }],
                },
                activeLocale: 'en',
                updateDraft: mockUpdateDraft,
            });

            render(<QSortEditor />);
            fireEvent.click(screen.getByTestId('switch-grid'));

            const plusButton = screen.getByRole('button', {
                name: /increase capacity for column 0/i,
            });
            fireEvent.click(plusButton);

            expect(mockUpdateDraft).toHaveBeenCalled();
            // Verify payload
            const callback = mockUpdateDraft.mock.calls[0][0];
            const draft = { grid_config: [{ score: -1, capacity: 2 }] };
            callback(draft);
            expect(draft.grid_config[0].capacity).toBe(3);
        });
    });

    describe('validation logic', () => {
        it('shows success when statements match slots', async () => {
            mockUseStudyDesigner.mockReturnValue({
                draft: {
                    statements: new Array(5).fill({}),
                    grid_config: [{ capacity: 2 }, { capacity: 3 }], // Total 5
                },
                activeLocale: 'en',
                updateDraft: mockUpdateDraft,
            });

            render(<QSortEditor />);
            fireEvent.click(screen.getByTestId('switch-grid'));

            expect(screen.getByText('Perfect Match!')).toBeInTheDocument();
            expect(screen.getByText('5 Statements')).toBeInTheDocument();
            expect(screen.getByText('5 Grid Slots')).toBeInTheDocument();
        });

        it('shows warning when mismatch', async () => {
            mockUseStudyDesigner.mockReturnValue({
                draft: {
                    statements: new Array(5).fill({}),
                    grid_config: [{ capacity: 2 }, { capacity: 2 }], // Total 4
                },
                activeLocale: 'en',
                updateDraft: mockUpdateDraft,
            });

            render(<QSortEditor />);
            fireEvent.click(screen.getByTestId('switch-grid'));

            expect(screen.getByText(/1 too many statements/i)).toBeInTheDocument();
        });
    });
});
