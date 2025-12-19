import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import StudyLayout from './StudyLayout';
import { useStudyStore } from '../store/useStudyStore';
import i18n from '../i18n';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

// Mock dependencies
// i18n is already being mocked globally in setupTests.ts for some things, but here we mock specifically.
vi.mock('../i18n', () => ({
    default: {
        changeLanguage: vi.fn(),
        language: 'en'
    }
}));

// Mock useStudyConfig since it's used in StudyLayout
vi.mock('../hooks/useStudyConfig', () => ({
    useStudyConfig: vi.fn(() => ({ retry: vi.fn() }))
}));

// We need to Mock LayoutContext properly or wrap it. StudyLayout uses it.
// StudyLayout wraps itself in LayoutProvider, so we don't need to wrap it externally?
// Line 191: const StudyLayout ... return <LayoutProvider> ...
// Yes.

describe('StudyLayout Language Sync', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        act(() => {
             useStudyStore.getState().resetSession();
             // Seed with valid config to bypass loading/error states
             useStudyStore.getState().setConfig({
                 title: 'Test Study',
                 slug: 'test',
                 statements: [],
                 grid_config: [],
                 available_languages: ['en', 'fr']
             } as any);
             
             // Consent is required for protected routes (sort/review)
             useStudyStore.getState().setConsent(true);
        });
    });

    it('Updates i18n when Store language changes', () => {
        // Spy on i18n
        const changeLanguageSpy = i18n.changeLanguage;

        // Render Layout
        render(
            <MemoryRouter initialEntries={['/study/test/welcome']}>
                <StudyLayout />
            </MemoryRouter>
        );

        // Change Store Language DIRECTLY (Simulating State Change)
        act(() => {
            useStudyStore.getState().setLanguage('fi');
        });

        // Verify i18n was updated
        expect(changeLanguageSpy).toHaveBeenCalledWith('fi');
    });

    it('Updates Store when UI Language Button is clicked', () => {
         render(
            <MemoryRouter initialEntries={['/study/test/welcome']}>
                <StudyLayout />
            </MemoryRouter>
        );
        
        // Open Language Menu (Button with Globe)
        const globeBtn = screen.getByTitle('Change language'); // Based on title attribute I saw in code
        fireEvent.click(globeBtn);

        // Click French
        const frBtn = screen.getByText('fr'); // Uppercase in UI? "FR" or "fr"? 
        // In code: <span className="uppercase">{lang}</span> -> So it renders FR
        // But map key is 'fr'. Let's check text content.
        
        fireEvent.click(frBtn);

        // Verify Store Updated
        expect(useStudyStore.getState().session.language).toBe('fr');
        
        // Verify i18n updated
        expect(i18n.changeLanguage).toHaveBeenCalledWith('fr');
    });
});

describe('Layout Scroll Behavior', () => {
    it('Applies overflow-hidden on sorting pages', () => {
        const { container } = render(
            <MemoryRouter initialEntries={['/study/slug/rough-sort']}>
                <Routes>
                    <Route path="/study/:slug/rough-sort" element={<StudyLayout />} />
                </Routes>
            </MemoryRouter>
        );
        const main = container.querySelector('main');
        expect(main).toHaveClass('overflow-hidden');
        expect(main).not.toHaveClass('overflow-y-auto');
    });

    it('Applies overflow-hidden on fine-sort page', () => {
        const { container } = render(
            <MemoryRouter initialEntries={['/study/slug/sort']}>
                 <Routes>
                    <Route path="/study/:slug/sort" element={<StudyLayout />} />
                </Routes>
            </MemoryRouter>
        );
        const main = container.querySelector('main');
        expect(main).toHaveClass('overflow-hidden');
    });

    it('Applies overflow-y-auto on post-sort page (despite containing "sort")', () => {
        const { container } = render(
             <MemoryRouter initialEntries={['/study/slug/post-sort']}>
                 <Routes>
                    <Route path="/study/:slug/post-sort" element={<StudyLayout />} />
                </Routes>
            </MemoryRouter>
        );
        const main = container.querySelector('main');
        expect(main).toHaveClass('overflow-y-auto');
        expect(main).not.toHaveClass('overflow-hidden');
    });

    it('Applies overflow-y-auto on other pages (e.g. welcome)', () => {
        const { container } = render(
             <MemoryRouter initialEntries={['/study/slug/welcome']}>
                 <Routes>
                    <Route path="/study/:slug/welcome" element={<StudyLayout />} />
                </Routes>
            </MemoryRouter>
        );
        const main = container.querySelector('main');
        expect(main).toHaveClass('overflow-y-auto');
        expect(main).not.toHaveClass('overflow-hidden');
    });
});
