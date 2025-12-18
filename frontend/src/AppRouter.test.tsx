import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import StudyLayout from './layouts/StudyLayout';
import { useStudyStore } from './store/useStudyStore';

// Mock Modules
vi.mock('./store/useStudyStore');
const mockUseStudyStore = useStudyStore as unknown as ReturnType<typeof vi.fn>;

describe('App Routing Protection', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });


// Mock Pages
const MockFineSort = () => <div data-testid="page-fine">Fine Page</div>;
const MockWelcome = () => <div data-testid="page-welcome">Welcome Page</div>;

describe('App Routing Protection', () => {
    
    it('redirects to welcome if not consented on protected route', () => {
        // Mock session as NOT consented
        mockUseStudyStore.mockReturnValue({ 
            session: { hasConsented: false, currentStep: 1 },
            config: { slug: 'demo' },
            setConfigLoading: vi.fn(),
            setConfigError: vi.fn()
        });

        render(
            <MemoryRouter initialEntries={['/study/demo/sort/fine']}>
                 <Routes>
                    <Route path="/study/:slug" element={<StudyLayout />}>
                       <Route path="welcome" element={<MockWelcome />} />
                       <Route path="sort">
                         <Route path="fine" element={<MockFineSort />} />
                       </Route>
                       <Route path="*" element={<div data-testid="page-error">Error</div>} />
                    </Route>
                 </Routes>
            </MemoryRouter>
        );

        // Should NOT show Fine Page
        expect(screen.queryByTestId('page-fine')).toBeNull();
        // Should Redirect to Welcome (or at least render nothing / Navigate)
        // Since we are inside MemoryRouter, Navigate replaces the entry. 
        // We can check if Welcome Page is rendered IF the redirect target matches a route.
        // The redirect wraps to `/study/:slug/welcome`.
        expect(screen.getByTestId('page-welcome')).toBeTruthy();
    });

    it('allows access if consented', () => {
        // Mock session AS consented
        mockUseStudyStore.mockReturnValue({ 
            session: { hasConsented: true, currentStep: 4 },
            setConfigLoading: vi.fn(),
            setConfigError: vi.fn()
        });

        render(
            <MemoryRouter initialEntries={['/study/demo/sort/fine']}>
                 <Routes>
                    <Route path="/study/:slug" element={<StudyLayout />}>
                       <Route path="sort/fine" element={<MockFineSort />} />
                    </Route>
                 </Routes>
            </MemoryRouter>
        );

        expect(screen.getByTestId('page-fine')).toBeTruthy();
    });
});
});
