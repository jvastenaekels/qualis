/*
 * Qualis - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Qualis Team
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

/**
 * Unit tests for useAudioRecorder — pure-logic paths only. The full
 * mocked record/stop/auto-stop/codec/cleanup lifecycle is covered
 * end-to-end through the component by the unchanged
 * AudioRecorder.test.tsx (the behaviour-preservation oracle).
 */

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAudioRecorder } from './useAudioRecorder';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (_k: string, d?: string) => d ?? _k }),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

// Captured MediaRecorder instance — set by the mock constructor so tests can
// trigger ondataavailable / onstop directly (mirrors oracle's technique).
let capturedMediaRecorder: {
    start: ReturnType<typeof vi.fn>;
    stop: ReturnType<typeof vi.fn>;
    ondataavailable: ((e: { data: Blob }) => void) | null;
    onstop: ((e: Event) => void) | null;
    onerror: ((e: unknown) => void) | null;
    state: string;
    mimeType: string;
} | null = null;

function setupWebApiMocks() {
    capturedMediaRecorder = null;

    // requestAnimationFrame — never fires callback, returns stable ids
    let frameId = 0;
    global.requestAnimationFrame = vi.fn(() => ++frameId);
    global.cancelAnimationFrame = vi.fn();

    // AudioContext (full surface used by the hook during recording)
    const mockAnalyser = {
        fftSize: 0,
        frequencyBinCount: 16,
        getByteFrequencyData: vi.fn((array: Uint8Array) => {
            for (let i = 0; i < Math.min(5, array.length); i++) {
                array[i] = 50;
            }
        }),
        connect: vi.fn(),
    };
    const mockSource = { connect: vi.fn() };
    global.AudioContext = class {
        createAnalyser = vi.fn(() => mockAnalyser);
        createMediaStreamSource = vi.fn(() => mockSource);
        createMediaElementSource = vi.fn(() => mockSource);
        destination = {} as AudioDestinationNode;
        state = 'running';
        close = vi.fn().mockResolvedValue(undefined);
    } as unknown as typeof AudioContext;

    // MediaStream with one stoppable track
    const mockTrack = {
        stop: vi.fn(),
        onended: null as ((this: MediaStreamTrack, ev: Event) => void) | null,
    };
    const mockStream = { getTracks: vi.fn(() => [mockTrack]) } as unknown as MediaStream;

    global.navigator.mediaDevices = {
        getUserMedia: vi.fn().mockResolvedValue(mockStream),
    } as unknown as MediaDevices;

    // MediaRecorder — captures instance; default supports WebM
    global.MediaRecorder = class {
        start = vi.fn();
        stop = vi.fn();
        ondataavailable: ((e: { data: Blob }) => void) | null = null;
        onstop: ((e: Event) => void) | null = null;
        onerror: ((e: unknown) => void) | null = null;
        state = 'inactive';
        mimeType = '';

        constructor(_stream?: MediaStream, options?: { mimeType?: string }) {
            this.mimeType = options?.mimeType ?? '';
            capturedMediaRecorder = this as unknown as typeof capturedMediaRecorder;
        }
        static isTypeSupported(type: string) {
            return type === 'audio/webm;codecs=opus';
        }
    } as unknown as typeof MediaRecorder;

    global.URL.createObjectURL = vi.fn(() => 'blob:mock-url');
    global.URL.revokeObjectURL = vi.fn();

    // Audio constructor for playback — must use function (not arrow) to be
    // constructable with `new`. Mirrors oracle's global.Audio factory pattern.
    // biome-ignore lint/complexity/useArrowFunction: must be constructable for `new Audio()`
    global.Audio = vi.fn(function () {
        return {
            play: vi.fn().mockResolvedValue(undefined),
            pause: vi.fn(),
            onended: null,
            onerror: null,
            ontimeupdate: null,
            playbackRate: 1.0,
            currentTime: 0,
            src: '',
        };
    }) as unknown as typeof Audio;
}

function makeProps(over: Record<string, unknown> = {}) {
    return {
        questionKey: 'q1',
        maxDurationSeconds: 180,
        onRecordingComplete: vi.fn().mockResolvedValue(undefined),
        onRecordingDeleted: vi.fn().mockResolvedValue(undefined),
        ...over,
    } as Parameters<typeof useAudioRecorder>[0];
}

beforeEach(() => {
    vi.clearAllMocks();
});

afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
});

describe('useAudioRecorder — initial state', () => {
    it('starts idle with zero duration and no audio url', () => {
        const { result } = renderHook(() => useAudioRecorder(makeProps()));
        expect(result.current.status.state).toBe('idle');
        expect(result.current.recording.duration).toBe(0);
        expect(result.current.playback.audioUrl).toBeNull();
        expect(result.current.waveform.audioLevels).toHaveLength(5);
    });
});

describe('useAudioRecorder — formatTime', () => {
    it('formats 0 seconds as "0:00"', () => {
        const { result } = renderHook(() => useAudioRecorder(makeProps()));
        expect(result.current.ui.formatTime(0)).toBe('0:00');
    });

    it('formats 65 seconds as "1:05"', () => {
        const { result } = renderHook(() => useAudioRecorder(makeProps()));
        expect(result.current.ui.formatTime(65)).toBe('1:05');
    });

    it('formats 600 seconds as "10:00"', () => {
        const { result } = renderHook(() => useAudioRecorder(makeProps()));
        expect(result.current.ui.formatTime(600)).toBe('10:00');
    });
});

describe('useAudioRecorder — codec selection', () => {
    beforeEach(setupWebApiMocks);

    it('uses WebM codec when supported', async () => {
        const { result } = renderHook(() => useAudioRecorder(makeProps()));

        await act(async () => {
            result.current.recording.start();
            // Flush the getUserMedia promise
            await vi.advanceTimersByTimeAsync?.(0).catch(() => undefined);
            await Promise.resolve();
        });

        expect(capturedMediaRecorder).not.toBeNull();
        expect(capturedMediaRecorder?.mimeType).toBe('audio/webm;codecs=opus');
    });

    it('falls back to MP4 when WebM is not supported', async () => {
        // Override isTypeSupported to return false for all types
        (
            global.MediaRecorder as unknown as { isTypeSupported: (t: string) => boolean }
        ).isTypeSupported = vi.fn(() => false);

        const { result } = renderHook(() => useAudioRecorder(makeProps()));

        await act(async () => {
            result.current.recording.start();
            await Promise.resolve();
        });

        expect(capturedMediaRecorder).not.toBeNull();
        expect(capturedMediaRecorder?.mimeType).toBe('audio/mp4');
    });
});

describe('useAudioRecorder — state-machine transitions', () => {
    beforeEach(setupWebApiMocks);

    it('transitions idle → recording → stopped when start then onstop fires', async () => {
        const { result } = renderHook(() => useAudioRecorder(makeProps()));

        // Initial state is idle
        expect(result.current.status.state).toBe('idle');

        // Start recording → should become recording after getUserMedia resolves
        await act(async () => {
            result.current.recording.start();
            await Promise.resolve();
        });

        expect(result.current.status.state).toBe('recording');

        // Fire ondataavailable then onstop → should move to stopped
        await act(async () => {
            if (capturedMediaRecorder?.ondataavailable) {
                capturedMediaRecorder.ondataavailable({
                    data: new Blob(['audio'], { type: 'audio/webm' }),
                });
            }
            if (capturedMediaRecorder?.onstop) {
                await capturedMediaRecorder.onstop(new Event('stop'));
            }
        });

        expect(result.current.status.state).toBe('stopped');
    });
});

describe('useAudioRecorder — max-duration auto-stop', () => {
    beforeEach(setupWebApiMocks);

    it('calls recorder.stop() when max duration elapses', async () => {
        vi.useFakeTimers();

        const { result } = renderHook(() => useAudioRecorder(makeProps({ maxDurationSeconds: 1 })));

        // Start recording and flush getUserMedia
        await act(async () => {
            result.current.recording.start();
            await vi.advanceTimersByTimeAsync(0);
        });

        expect(result.current.status.state).toBe('recording');

        // Advance past the 1-second max duration — the interval fires stopRecording()
        await act(async () => {
            await vi.advanceTimersByTimeAsync(1100);
        });

        // The auto-stop mechanism calls mediaRecorder.stop() via stopRecording()
        expect(capturedMediaRecorder?.stop).toHaveBeenCalled();
        // Duration has advanced to at least 1s — confirms the timer was running
        expect(result.current.recording.duration).toBeGreaterThanOrEqual(1);
    });
});

// Helper: an existing-recording fixture whose URL is not expired, so
// refreshUrlBeforePlayback returns true without hitting the network.
const existingRecordingFixture = {
    id: 1,
    presigned_url: 'https://example.com/audio.webm',
    duration_seconds: 45,
    file_size_bytes: 1024,
    created_at: new Date().toISOString(),
    url_expires_at: new Date(Date.now() + 2 * 3600 * 1000).toISOString(), // 2 h from now
};

// Helper: read the Nth (0-based) Audio instance constructed by global.Audio mock.
function capturedAudio(index: number): { playbackRate: number; play: ReturnType<typeof vi.fn> } {
    const mock = global.Audio as unknown as {
        mock: {
            results: Array<{ value: { playbackRate: number; play: ReturnType<typeof vi.fn> } }>;
        };
    };
    const result = mock.mock.results[index];
    if (!result) throw new Error(`No Audio instance at index ${index}`);
    return result.value;
}

describe('useAudioRecorder — play() wrapper', () => {
    beforeEach(setupWebApiMocks);

    it('resets playbackRetryRef and invokes playback (new Audio constructed each call)', async () => {
        // Arrange: hook with an existing recording so audioUrl is initialised
        // (without a URL, playRecording returns early before constructing Audio).
        const { result } = renderHook(() =>
            useAudioRecorder(makeProps({ existingRecording: existingRecordingFixture }))
        );

        // Wait for the initialise-existing-recording effect to settle
        // (sets audioUrl + state = 'stopped')
        await act(async () => {
            await Promise.resolve();
        });

        expect(result.current.status.state).toBe('stopped');
        expect(
            (global.Audio as unknown as { mock: { results: unknown[] } }).mock.results
        ).toHaveLength(0);

        // Act 1: first play() — resets guard (was false), invokes playRecording.
        await act(async () => {
            await result.current.playback.play();
        });

        // Observable 1: a new Audio element was constructed (playback attempted).
        expect(
            (global.Audio as unknown as { mock: { results: unknown[] } }).mock.results
        ).toHaveLength(1);
        expect(result.current.status.state).toBe('playing');

        // Act 2: second play() from the playing state — play() resets the guard
        // (which the internal onerror path may have set to true) and calls
        // playRecording again regardless, constructing a second Audio element.
        // This directly asserts the contract: play() always re-attempts.
        await act(async () => {
            await result.current.playback.play();
        });

        // Observable 2: a second Audio element was constructed — the guard was
        // reset so playRecording was not short-circuited.
        expect(
            (global.Audio as unknown as { mock: { results: unknown[] } }).mock.results
        ).toHaveLength(2);
    });
});

describe('useAudioRecorder — setPlaybackSpeed wrapper', () => {
    beforeEach(setupWebApiMocks);

    it('always updates state speed but pokes the live element ONLY while playing', async () => {
        // Arrange: hook with an existing recording
        const { result } = renderHook(() =>
            useAudioRecorder(makeProps({ existingRecording: existingRecordingFixture }))
        );

        await act(async () => {
            await Promise.resolve();
        });

        expect(result.current.status.state).toBe('stopped');

        // --- Not playing: speed state updates but NO audio element to poke ---

        act(() => {
            result.current.playback.setPlaybackSpeed(1.5);
        });

        // Observable: hook exposes updated speed
        expect(result.current.playback.playbackSpeed).toBe(1.5);
        // No Audio element has been constructed yet — no playbackRate mutation possible
        expect(
            (global.Audio as unknown as { mock: { results: unknown[] } }).mock.results
        ).toHaveLength(0);

        // --- Transition to playing ---

        await act(async () => {
            await result.current.playback.play();
        });

        expect(result.current.status.state).toBe('playing');
        // playRecording applied the current playbackSpeed (1.5) to the element on construction
        expect(capturedAudio(0).playbackRate).toBe(1.5);

        // --- While playing: speed state updates AND element is poked immediately ---

        act(() => {
            result.current.playback.setPlaybackSpeed(2.0);
        });

        // Observable 1: state speed updated
        expect(result.current.playback.playbackSpeed).toBe(2.0);
        // Observable 2: live element's playbackRate was imperatively set to 2.0
        // (applyPlaybackSpeed branches on stateRef.current === 'playing', which is true)
        expect(capturedAudio(0).playbackRate).toBe(2.0);
    });
});
