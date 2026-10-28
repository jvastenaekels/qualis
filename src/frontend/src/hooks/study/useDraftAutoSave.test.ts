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
        vi.useFakeTimers();
        vi.mocked(customInstance).mockReset().mockResolvedValue({});
        useSessionStore.setState({
            token: 'tok',
            isPilotMode: false,
            isCompleted: false,
            isSubmitting: false,
        });
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.unstubAllGlobals();
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
        window.dispatchEvent(new Event('online'));
        await act(() => vi.advanceTimersByTimeAsync(0));
        expect(customInstance).toHaveBeenCalledTimes(1);
        expect(lastDraft()).toEqual({ a: 3 });

        // Nothing owed any more: a second reconnection sends nothing.
        window.dispatchEvent(new Event('online'));
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
