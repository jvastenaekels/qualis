import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { customInstance } from '../../api/mutator';
import { useSessionStore } from '../../store/useSessionStore';
import { useProgressReporter } from './useProgressReporter';

vi.mock('../../api/mutator', () => ({ customInstance: vi.fn().mockResolvedValue({}) }));

beforeEach(() => {
    vi.mocked(customInstance).mockClear();
    useSessionStore.setState({ token: 'tok', isPilotMode: false, maxReachedStep: 1 });
});
afterEach(() => sessionStorage.removeItem('qualis-pilot-mode'));

it('reports a real step', () => {
    renderHook(() => useProgressReporter('s'));
    act(() => useSessionStore.setState({ maxReachedStep: 2 }));
    expect(customInstance).toHaveBeenCalledTimes(1);
});

it('reports nothing in a tab that only the flag marks as a test', () => {
    sessionStorage.setItem('qualis-pilot-mode', 'true');
    renderHook(() => useProgressReporter('s'));
    act(() => useSessionStore.setState({ maxReachedStep: 2 }));
    expect(customInstance).not.toHaveBeenCalled();
});
