import { act, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import { customInstance } from '../api/mutator';
import { useDraftAutoSave } from '../hooks/study/useDraftAutoSave';
import { useResponseStore } from '../store/useResponseStore';
import { useSessionStore } from '../store/useSessionStore';
import { setStudyStorageScope } from '../store/safeStorage';
import ResumePage from './ResumePage';

vi.mock('../api/mutator', () => ({ BASE_URL: '', customInstance: vi.fn() }));
function ResumedParticipant() {
    useDraftAutoSave('revision-study');
    const answer = useResponseStore((s) => s.presort.answer);
    return <p>Restored {answer}</p>;
}
afterEach(() => {
    vi.unstubAllGlobals();
    setStudyStorageScope(undefined);
    window.history.replaceState({}, '', '/');
});
it('continues the server revision after resume when flushing the next answer', async () => {
    setStudyStorageScope(undefined);
    window.history.replaceState({}, '', '/study/revision-study/resume/code');
    useSessionStore.getState().resetSession();
    useResponseStore.getState().resetResponses();
    vi.mocked(customInstance).mockResolvedValue({
        session_token: '550e8400-e29b-41d4-a716-446655440000',
        language: 'en',
        last_step_reached: 4,
        resume_code: 'resume-code',
        draft_revision: 37,
        draft_responses: { presort: { answer: 'from server' } },
    });
    const fetchMock = vi.fn().mockResolvedValue({});
    vi.stubGlobal('fetch', fetchMock);
    render(
        <MemoryRouter initialEntries={['/study/revision-study/resume/code']}>
            <Routes>
                <Route path="/study/:slug/resume/:token" element={<ResumePage />} />
                <Route path="/study/revision-study/fine-sort" element={<ResumedParticipant />} />
            </Routes>
        </MemoryRouter>
    );
    expect(await screen.findByText('Restored from server')).toBeInTheDocument();
    expect(useSessionStore.getState().draftRevision).toBe(37);
    act(() => useResponseStore.setState({ presort: { answer: 'new answer' } }));
    act(() => window.dispatchEvent(new Event('pagehide')));
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({
        draft_revision: 38,
        session_token: '550e8400-e29b-41d4-a716-446655440000',
        draft_responses: { presort: { answer: 'new answer' } },
    });
});
