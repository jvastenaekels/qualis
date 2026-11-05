/*
 * Qualis - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { customInstance } from '../../api/mutator';
import { useResponseStore } from '../../store/useResponseStore';
import { useSessionStore } from '../../store/useSessionStore';
import { withoutStudyStorageWrites } from '../../store/safeStorage';
import { useDraftAutoSave } from './useDraftAutoSave';

vi.mock('../../api/mutator', () => ({
    BASE_URL: 'http://api.test',
    customInstance: vi.fn(),
}));

const lastDraft = () => {
    const calls = vi.mocked(customInstance).mock.calls;
    return (calls[calls.length - 1][0] as { data: { draft_responses: { qsort: unknown } } }).data
        .draft_responses.qsort;
};

describe('useDraftAutoSave', () => {
    beforeEach(() => {
        window.history.replaceState({}, '', '/study/s/fine-sort');
        vi.useFakeTimers();
        vi.mocked(customInstance).mockReset().mockResolvedValue({});
        useSessionStore.setState({
            token: 'tok',
            studySlug: 's',
            draftRevision: 0,
            isPilotMode: false,
            isCompleted: false,
            isSubmitting: false,
        });
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.unstubAllGlobals();
        window.history.replaceState({}, '', '/');
    });

    it('saves nothing in a tab that only the flag marks as a test', async () => {
        sessionStorage.setItem('qualis-pilot-mode', 'true');
        const { unmount } = renderHook(() => useDraftAutoSave('s'));

        act(() => useResponseStore.setState({ qsort: { a: 1 } as never }));
        await act(() => vi.advanceTimersByTimeAsync(5000));

        expect(customInstance).not.toHaveBeenCalled();
        unmount();
        sessionStorage.removeItem('qualis-pilot-mode');
    });

    it('resends the draft when the browser comes back online after a failed save', async () => {
        vi.mocked(customInstance).mockRejectedValueOnce(new Error('offline'));
        const { unmount } = renderHook(() => useDraftAutoSave('s'));

        act(() => useResponseStore.setState({ qsort: { a: 1 } as never }));
        await act(() => vi.advanceTimersByTimeAsync(5000));
        expect(customInstance).toHaveBeenCalledTimes(1);

        // The error indicator has gone back to idle, the save is still owed.
        await act(() => vi.advanceTimersByTimeAsync(10000));
        vi.mocked(customInstance).mockClear();
        act(() => useResponseStore.setState({ qsort: { a: 3 } as never }));
        act(() => window.dispatchEvent(new Event('online')));
        await act(() => vi.advanceTimersByTimeAsync(0));
        expect(customInstance).toHaveBeenCalledTimes(1);
        expect(lastDraft()).toEqual({ a: 3 });

        // Nothing owed any more: a second reconnection sends nothing.
        act(() => window.dispatchEvent(new Event('online')));
        expect(customInstance).toHaveBeenCalledTimes(1);
        unmount();
    });

    it('flushes the draft on pagehide', () => {
        const fetchMock = vi.fn().mockResolvedValue({});
        vi.stubGlobal('fetch', fetchMock);
        const { unmount } = renderHook(() => useDraftAutoSave('s'));
        act(() => useResponseStore.setState({ qsort: { a: 9 } as never }));

        window.dispatchEvent(new Event('pagehide'));

        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(fetchMock.mock.calls[0][0]).toBe('http://api.test/api/study/s/save-draft');
        expect(fetchMock.mock.calls[0][1].keepalive).toBe(true);
        unmount();
        window.dispatchEvent(new Event('pagehide'));
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });
});

describe('draft ordering across requests and lifecycle flushes', () => {
    beforeEach(() => {
        window.history.replaceState({}, '', '/study/s/fine-sort');
        vi.useFakeTimers();
        vi.mocked(customInstance).mockReset().mockResolvedValue({});
        useSessionStore.setState({
            token: 'tok',
            studySlug: 's',
            draftRevision: 12,
            isPilotMode: false,
            isCompleted: false,
            isSubmitting: false,
        });
    });
    afterEach(() => {
        vi.useRealTimers();
        vi.unstubAllGlobals();
        window.history.replaceState({}, '', '/');
    });

    it('orders a pending save, a newer edit and both unload signals without reusing revisions', async () => {
        vi.mocked(customInstance).mockImplementation(() => new Promise(() => {}));
        const fetchMock = vi.fn().mockResolvedValue({});
        vi.stubGlobal('fetch', fetchMock);
        const { unmount } = renderHook(() => useDraftAutoSave('s'));
        act(() => useResponseStore.setState({ presort: { answer: 'old' } }));
        await act(() => vi.advanceTimersByTimeAsync(5000));
        act(() => useResponseStore.setState({ presort: { answer: 'new' } }));
        await act(() => vi.advanceTimersByTimeAsync(5000));
        window.dispatchEvent(new Event('beforeunload'));
        window.dispatchEvent(new Event('pagehide'));
        const requests = vi.mocked(customInstance).mock.calls.map(([req]) => req.data);
        const flushes = fetchMock.mock.calls.map(([, req]) => JSON.parse(req.body));
        expect([...requests, ...flushes].map((req) => req.draft_revision)).toEqual([
            13, 14, 15, 16,
        ]);
        expect(flushes[1].draft_responses.presort).toEqual({ answer: 'new' });
        // A remounted hook continues the persisted session counter.
        unmount();
        withoutStudyStorageWrites(() => useSessionStore.setState({ draftRevision: 0 }));
        await useSessionStore.persist.rehydrate();
        expect(useSessionStore.getState().draftRevision).toBeGreaterThan(16);
        const second = renderHook(() => useDraftAutoSave('s'));
        act(() => useResponseStore.setState({ presort: { answer: 'after reload' } }));
        await act(() => vi.advanceTimersByTimeAsync(5000));
        expect(
            vi.mocked(customInstance).mock.calls.at(-1)?.[0].data.draft_revision
        ).toBeGreaterThan(16);
        second.unmount();
    });

    it('keeps a current revision conflict visible when an older request succeeds later', async () => {
        let finishOlder: () => void = () => {};
        vi.mocked(customInstance)
            .mockImplementationOnce(
                () =>
                    new Promise((resolve) => {
                        finishOlder = () => resolve({});
                    })
            )
            .mockRejectedValueOnce({ status: 409 });
        const { result, unmount } = renderHook(() => useDraftAutoSave('s'));
        act(() => useResponseStore.setState({ presort: { answer: 'old' } }));
        await act(() => vi.advanceTimersByTimeAsync(5000));
        act(() => useResponseStore.setState({ presort: { answer: 'new' } }));
        await act(() => vi.advanceTimersByTimeAsync(5000));
        expect(result.current.draftSaveStatus).toBe('error');
        await act(async () => finishOlder());
        expect(result.current.draftSaveStatus).toBe('error');
        unmount();
    });

    it('does not flush another study session through a stale hook', () => {
        const { unmount } = renderHook(() => useDraftAutoSave('s'));
        act(() => useResponseStore.setState({ presort: { answer: 'outgoing' } }));
        useSessionStore.setState({ studySlug: 'other', token: 'other-token' });
        unmount();
        expect(customInstance).not.toHaveBeenCalled();
    });
});
