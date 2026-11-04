import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter, Route, Routes, useNavigate, useParams } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useEffect } from 'react';
import { useConfigStore } from '../store/useConfigStore';
import { useSessionStore } from '../store/useSessionStore';
import { useResponseStore } from '../store/useResponseStore';
import { customInstance } from '../api/mutator';
import StudyLayout from './StudyLayout';
import { resetAllStores } from '../utils/sessionReset';
import { setStudyStorageScope } from '../store/safeStorage';

vi.mock('../api/mutator', () => ({ BASE_URL: '', customInstance: vi.fn().mockResolvedValue({}) }));
vi.mock('../hooks/useStudyConfig', () => ({ useStudyConfig: () => ({ retry: vi.fn() }) }));
vi.mock('../hooks/study/useProgressReporter', () => ({ useProgressReporter: () => {} }));
function Participant() {
    const { slug } = useParams();
    const navigate = useNavigate();
    const token = useSessionStore((s) => s.token);
    const answer = useResponseStore((s) => s.presort.answer);
    useEffect(() => {
        useSessionStore.getState().setStep(4);
    }, []);
    return (
        <div>
            <output>
                {slug}:{token}:{answer}
            </output>
            <button
                type="button"
                onClick={() => navigate(`/study/${slug === 'a' ? 'b' : 'a'}/fine-sort`)}
            >
                Switch study
            </button>
            <button type="button" onClick={() => navigate('/study/c/resume/code')}>
                Resume elsewhere
            </button>
        </div>
    );
}
beforeEach(() => {
    setStudyStorageScope(undefined);
    localStorage.clear();
    for (const slug of ['b', 'a']) {
        window.history.replaceState({}, '', `/study/${slug}/fine-sort`);
        useSessionStore.getState().resetSession();
        useResponseStore.getState().resetResponses();
        useSessionStore.setState({ studySlug: slug, token: `token-${slug}`, hasConsented: true });
        useResponseStore.setState({ presort: { answer: `answer-${slug}` } });
    }
    useConfigStore.setState({ config: null, isLoading: false, error: null });
    vi.mocked(customInstance).mockClear();
});
afterEach(() => {
    setStudyStorageScope(undefined);
    window.history.replaceState({}, '', '/');
});
it('restores destination answers before participant effects run on A to B to A', async () => {
    render(
        <BrowserRouter>
            <Routes>
                <Route path="/study/:slug" element={<StudyLayout />}>
                    <Route path="fine-sort" element={<Participant />} />
                </Route>
            </Routes>
        </BrowserRouter>
    );
    expect(await screen.findByText('a:token-a:answer-a')).toBeInTheDocument();
    act(() => useResponseStore.setState({ presort: { answer: 'answer-a' } }));
    fireEvent.click(screen.getByText('Switch study'));
    expect(vi.mocked(customInstance).mock.calls[0]?.[0]).toMatchObject({
        url: '/api/study/a/save-draft',
        data: { session_token: 'token-a', draft_responses: { presort: { answer: 'answer-a' } } },
    });
    await waitFor(() => expect(screen.getByText('b:token-b:answer-b')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Switch study'));
    await waitFor(() => expect(screen.getByText('a:token-a:answer-a')).toBeInTheDocument());
    expect(JSON.parse(localStorage.getItem('qualis-session:b') ?? 'null').state.token).toBe(
        'token-b'
    );
    expect(
        JSON.parse(localStorage.getItem('qualis-responses:b') ?? 'null').state.presort.answer
    ).toBe('answer-b');
});

function ResumeElsewhere() {
    useEffect(() => {
        resetAllStores();
        useSessionStore.setState({ studySlug: 'c', token: 'token-c' });
    }, []);
    return <p>Resumed elsewhere</p>;
}
it('releases study storage before a different resume route writes its session', async () => {
    render(
        <BrowserRouter>
            <Routes>
                <Route path="/study/:slug" element={<StudyLayout />}>
                    <Route path="fine-sort" element={<Participant />} />
                </Route>
                <Route path="/study/c/resume/code" element={<ResumeElsewhere />} />
            </Routes>
        </BrowserRouter>
    );
    expect(await screen.findByText('a:token-a:answer-a')).toBeInTheDocument();
    act(() => useResponseStore.setState({ presort: { answer: 'edited-a' } }));
    fireEvent.click(screen.getByText('Resume elsewhere'));
    expect(await screen.findByText('Resumed elsewhere')).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem('qualis-session:a') ?? 'null').state.token).toBe(
        'token-a'
    );
    expect(JSON.parse(localStorage.getItem('qualis-session:c') ?? 'null').state.token).toBe(
        'token-c'
    );
});

it('keeps an initial test preview in pilot mode during session initialization', async () => {
    setStudyStorageScope(undefined);
    localStorage.clear();
    window.history.replaceState({}, '', '/study/preview/fine-sort?mode=test');
    useSessionStore.getState().resetSession();
    useSessionStore.setState({ isPilotMode: true, studySlug: null });
    localStorage.clear();
    useConfigStore.setState({ config: null, isLoading: false });
    render(
        <BrowserRouter>
            <Routes>
                <Route path="/study/:slug" element={<StudyLayout />}>
                    <Route path="fine-sort" element={<Participant />} />
                </Route>
            </Routes>
        </BrowserRouter>
    );
    await waitFor(() => expect(useSessionStore.getState().isPilotMode).toBe(true));
    expect(customInstance).not.toHaveBeenCalled();
});
