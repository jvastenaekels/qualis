/*
 * Qualis - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Qualis Team
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

import { render, screen, fireEvent, waitFor, cleanup, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AudioRecorder } from './AudioRecorder';

// Mock i18next
vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, fallback?: string) => fallback || key,
    }),
}));

// Mock sonner toast — vi.hoisted ensures the variable exists before vi.mock is hoisted
const mockToast = vi.hoisted(() => ({
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
}));
vi.mock('sonner', () => ({
    toast: mockToast,
}));

describe('AudioRecorder', () => {
    // Captured MediaRecorder instance — set by mock constructor, used to trigger handlers
    let capturedMediaRecorder: {
        start: ReturnType<typeof vi.fn>;
        stop: ReturnType<typeof vi.fn>;
        ondataavailable: ((e: { data: Blob }) => void) | null;
        onstop: ((e: Event) => void) | null;
        onerror: ((e: unknown) => void) | null;
        state: string;
        mimeType: string;
    } | null;

    let mockStream: MediaStream;

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
    const mockElementSource = { connect: vi.fn() };

    beforeEach(() => {
        capturedMediaRecorder = null;

        // requestAnimationFrame — return incrementing ids, never call callback
        let frameId = 0;
        global.requestAnimationFrame = vi.fn(() => ++frameId);
        global.cancelAnimationFrame = vi.fn();

        // AudioContext with full API surface (including createMediaElementSource for playback)
        global.AudioContext = class {
            createAnalyser = vi.fn(() => mockAnalyser);
            createMediaStreamSource = vi.fn(() => mockSource);
            createMediaElementSource = vi.fn(() => mockElementSource);
            destination = {} as AudioDestinationNode;
            state = 'running';
            close = vi.fn().mockResolvedValue(undefined);
        } as unknown as typeof AudioContext;

        // MediaStream with stoppable track
        const mockTrack = {
            stop: vi.fn(),
            onended: null as ((this: MediaStreamTrack, ev: Event) => void) | null,
        };
        mockStream = {
            getTracks: vi.fn(() => [mockTrack]),
        } as unknown as MediaStream;

        // navigator.mediaDevices.getUserMedia
        global.navigator.mediaDevices = {
            getUserMedia: vi.fn().mockResolvedValue(mockStream),
        } as unknown as MediaDevices;

        // MediaRecorder — captures the instance for event triggering
        global.MediaRecorder = class {
            start = vi.fn();
            stop = vi.fn();
            ondataavailable: ((e: { data: Blob }) => void) | null = null;
            onstop: ((e: Event) => void) | null = null;
            onerror: ((e: unknown) => void) | null = null;
            state = 'inactive';
            mimeType = '';

            constructor(_stream?: MediaStream, options?: { mimeType?: string }) {
                this.mimeType = options?.mimeType || '';
                capturedMediaRecorder = this as unknown as typeof capturedMediaRecorder;
            }
            static isTypeSupported(type: string) {
                return type === 'audio/webm;codecs=opus';
            }
        } as unknown as typeof MediaRecorder;

        // Audio constructor for playback (must use function, not arrow — arrow can't be used with `new`)
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

        // URL methods
        global.URL.createObjectURL = vi.fn(() => 'blob:mock-url');
        global.URL.revokeObjectURL = vi.fn();
    });

    afterEach(() => {
        cleanup();
        vi.useRealTimers();
        vi.clearAllMocks();
        vi.restoreAllMocks();
    });

    const defaultProps = {
        questionKey: 'test-question',
        maxDurationSeconds: 180,
        onRecordingComplete: vi.fn().mockResolvedValue(undefined),
        onRecordingDeleted: vi.fn().mockResolvedValue(undefined),
    };

    const existingRecordingFixture = {
        id: 1,
        presigned_url: 'https://example.com/audio.webm',
        duration_seconds: 45,
        file_size_bytes: 1024,
        created_at: new Date().toISOString(),
    };

    // ── Helpers ──────────────────────────────────────────────────────

    /** Click "Record audio response if you prefer" and wait for the recording state. */
    async function startRecordingFlow(
        props: Parameters<typeof AudioRecorder>[0] = defaultProps as Parameters<
            typeof AudioRecorder
        >[0]
    ) {
        const result = render(<AudioRecorder {...props} />);
        fireEvent.click(screen.getByText('Record audio response if you prefer'));
        await waitFor(() => {
            expect(screen.getByRole('img', { name: /recording in progress/ })).toBeInTheDocument();
        });
        return result;
    }

    /**
     * Simulate a complete recording: fire ondataavailable (unless empty),
     * then fire onstop so the component creates the blob and uploads.
     */
    async function simulateRecordingComplete(content = 'mock-audio-data') {
        await act(async () => {
            if (capturedMediaRecorder?.ondataavailable) {
                const dataBlob = new Blob([content], { type: 'audio/webm' });
                capturedMediaRecorder.ondataavailable({ data: dataBlob });
            }
            if (capturedMediaRecorder?.onstop) {
                await capturedMediaRecorder.onstop(new Event('stop'));
            }
        });
    }

    // ── BASIC RENDERING ─────────────────────────────────────────────

    it('renders with idle state initially', () => {
        render(<AudioRecorder {...defaultProps} />);
        expect(screen.getByText('Record audio response if you prefer')).toBeInTheDocument();
    });

    it('disables start button when disabled prop is true', () => {
        render(<AudioRecorder {...defaultProps} disabled={true} />);
        const btn = screen.getByText('Record audio response if you prefer').closest('button');
        expect(btn).toBeDisabled();
    });

    it('displays file size for existing recordings', () => {
        render(
            <AudioRecorder
                {...defaultProps}
                existingRecording={{ ...existingRecordingFixture, file_size_bytes: 2048 }}
            />
        );
        expect(screen.getByText(/2\.0 KB/)).toBeInTheDocument();
    });

    // ── RECORDING FLOW ──────────────────────────────────────────────

    it('requests microphone permission when recording starts', async () => {
        render(<AudioRecorder {...defaultProps} />);
        fireEvent.click(screen.getByText('Record audio response if you prefer'));
        await waitFor(() => {
            expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith({ audio: true });
        });
    });

    it('transitions to recording state after starting', async () => {
        await startRecordingFlow();
        expect(screen.getByRole('img', { name: /recording in progress/ })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Stop' })).toBeInTheDocument();
        expect(capturedMediaRecorder?.start).toHaveBeenCalled();
    });

    it('increments timer during recording', async () => {
        vi.useFakeTimers();
        render(<AudioRecorder {...defaultProps} />);

        // Click start and flush async getUserMedia promise
        await act(async () => {
            fireEvent.click(screen.getByText('Record audio response if you prefer'));
            await vi.advanceTimersByTimeAsync(0);
        });
        expect(screen.getByRole('img', { name: /recording in progress/ })).toBeInTheDocument();

        await act(async () => {
            await vi.advanceTimersByTimeAsync(5000);
        });
        expect(screen.getByText('0:05 / 3:00')).toBeInTheDocument();
    });

    it('auto-stops recording at max duration', async () => {
        vi.useFakeTimers();
        render(<AudioRecorder {...defaultProps} maxDurationSeconds={10} />);

        await act(async () => {
            fireEvent.click(screen.getByText('Record audio response if you prefer'));
            await vi.advanceTimersByTimeAsync(0);
        });
        expect(screen.getByRole('img', { name: /recording in progress/ })).toBeInTheDocument();

        await act(async () => {
            await vi.advanceTimersByTimeAsync(10000);
        });
        expect(capturedMediaRecorder?.stop).toHaveBeenCalled();
    });

    it('calls onRecordingComplete when recording stops', async () => {
        const onComplete = vi.fn().mockResolvedValue(undefined);
        render(<AudioRecorder {...defaultProps} onRecordingComplete={onComplete} />);

        fireEvent.click(screen.getByText('Record audio response if you prefer'));
        await waitFor(() => {
            expect(screen.getByRole('img', { name: /recording in progress/ })).toBeInTheDocument();
        });

        fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
        await simulateRecordingComplete();

        await waitFor(() => {
            expect(onComplete).toHaveBeenCalled();
        });
    });

    it('transitions to stopped state after recording completes', async () => {
        await startRecordingFlow();

        fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
        await simulateRecordingComplete();

        await waitFor(() => {
            expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument();
        });
    });

    // ── CODEC SELECTION ─────────────────────────────────────────────

    it('prefers WebM codec when supported', async () => {
        render(<AudioRecorder {...defaultProps} />);
        fireEvent.click(screen.getByText('Record audio response if you prefer'));

        await waitFor(() => {
            expect(capturedMediaRecorder).not.toBeNull();
        });
        expect(capturedMediaRecorder?.mimeType).toBe('audio/webm;codecs=opus');
    });

    it('falls back to MP4 when WebM is not supported', async () => {
        (
            global.MediaRecorder as unknown as { isTypeSupported: (t: string) => boolean }
        ).isTypeSupported = vi.fn(() => false);

        render(<AudioRecorder {...defaultProps} />);
        fireEvent.click(screen.getByText('Record audio response if you prefer'));

        await waitFor(() => {
            expect(capturedMediaRecorder).not.toBeNull();
        });
        expect(capturedMediaRecorder?.mimeType).toBe('audio/mp4');
    });

    // ── EXISTING RECORDINGS ─────────────────────────────────────────

    it('displays play and delete buttons when recording exists', () => {
        render(<AudioRecorder {...defaultProps} existingRecording={existingRecordingFixture} />);

        expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
        expect(screen.getByText('0:45')).toBeInTheDocument();
    });

    it('plays audio when play button is clicked', async () => {
        render(<AudioRecorder {...defaultProps} existingRecording={existingRecordingFixture} />);

        fireEvent.click(screen.getByRole('button', { name: 'Play' }));

        await waitFor(() => {
            expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument();
        });
    });

    it('pauses audio when pause button is clicked', async () => {
        render(<AudioRecorder {...defaultProps} existingRecording={existingRecordingFixture} />);

        fireEvent.click(screen.getByRole('button', { name: 'Play' }));
        await waitFor(() => {
            expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument();
        });

        fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
        await waitFor(() => {
            expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument();
        });
    });

    it('shows speed control buttons in stopped state', () => {
        render(<AudioRecorder {...defaultProps} existingRecording={existingRecordingFixture} />);

        expect(screen.getByText('1x')).toBeInTheDocument();
        expect(screen.getByText('1.5x')).toBeInTheDocument();
        expect(screen.getByText('2x')).toBeInTheDocument();
    });

    // ── DELETE FLOW ─────────────────────────────────────────────────

    it('calls onRecordingDeleted when delete button is clicked', async () => {
        const onDelete = vi.fn().mockResolvedValue(undefined);
        render(
            <AudioRecorder
                {...defaultProps}
                onRecordingDeleted={onDelete}
                existingRecording={existingRecordingFixture}
            />
        );

        fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
        await waitFor(() => {
            expect(onDelete).toHaveBeenCalled();
        });
    });

    it('resets to idle state after successful deletion', async () => {
        const onDelete = vi.fn().mockResolvedValue(undefined);
        render(
            <AudioRecorder
                {...defaultProps}
                onRecordingDeleted={onDelete}
                existingRecording={existingRecordingFixture}
            />
        );

        fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

        await waitFor(() => {
            expect(screen.getByText('Record audio response if you prefer')).toBeInTheDocument();
        });
    });

    it('restores previous state when delete fails', async () => {
        const onDelete = vi.fn().mockRejectedValue(new Error('Delete failed'));
        render(
            <AudioRecorder
                {...defaultProps}
                onRecordingDeleted={onDelete}
                existingRecording={existingRecordingFixture}
            />
        );

        fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

        await waitFor(() => {
            // State should be restored
            expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument();
            expect(screen.getByText('0:45')).toBeInTheDocument();
        });
        expect(mockToast.error).toHaveBeenCalledWith('Could not delete the recording. Try again.');
    });

    it('shows uploading state during delete', async () => {
        let resolveDelete!: () => void;
        const onDelete = vi.fn(
            () =>
                new Promise<void>((resolve) => {
                    resolveDelete = resolve;
                })
        );

        render(
            <AudioRecorder
                {...defaultProps}
                onRecordingDeleted={onDelete}
                existingRecording={existingRecordingFixture}
            />
        );

        fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

        // Use selector to target status label (not the button which also contains "Uploading...")
        await waitFor(() => {
            expect(screen.getByText('Uploading...', { selector: 'span' })).toBeInTheDocument();
        });

        // Resolve to finish cleanup
        await act(async () => resolveDelete());
    });

    // ── UPLOAD FAILURE & RETRY ──────────────────────────────────────

    it('preserves recording state on upload failure', async () => {
        const onComplete = vi.fn().mockRejectedValue(new Error('Network error'));
        render(<AudioRecorder {...defaultProps} onRecordingComplete={onComplete} />);

        fireEvent.click(screen.getByText('Record audio response if you prefer'));
        await waitFor(() => {
            expect(screen.getByRole('img', { name: /recording in progress/ })).toBeInTheDocument();
        });

        fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
        await simulateRecordingComplete();

        // Should stay in stopped (not revert to idle)
        await waitFor(() => {
            expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument();
        });
    });

    it('shows retry button after upload failure', async () => {
        const onComplete = vi.fn().mockRejectedValue(new Error('Network error'));
        render(<AudioRecorder {...defaultProps} onRecordingComplete={onComplete} />);

        fireEvent.click(screen.getByText('Record audio response if you prefer'));
        await waitFor(() => {
            expect(screen.getByRole('img', { name: /recording in progress/ })).toBeInTheDocument();
        });

        fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
        await simulateRecordingComplete();

        await waitFor(() => {
            expect(screen.getByRole('button', { name: 'Retry upload' })).toBeInTheDocument();
        });
    });

    it('retry upload calls onRecordingComplete again', async () => {
        const onComplete = vi
            .fn()
            .mockRejectedValueOnce(new Error('Network error'))
            .mockResolvedValueOnce(undefined);

        render(<AudioRecorder {...defaultProps} onRecordingComplete={onComplete} />);

        fireEvent.click(screen.getByText('Record audio response if you prefer'));
        await waitFor(() => {
            expect(screen.getByRole('img', { name: /recording in progress/ })).toBeInTheDocument();
        });
        fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
        await simulateRecordingComplete();

        await waitFor(() => {
            expect(screen.getByRole('button', { name: 'Retry upload' })).toBeInTheDocument();
        });

        fireEvent.click(screen.getByRole('button', { name: 'Retry upload' }));

        await waitFor(() => {
            expect(onComplete).toHaveBeenCalledTimes(2);
        });
    });

    it('shows uploading state during retry', async () => {
        let resolveUpload!: () => void;
        const onComplete = vi
            .fn()
            .mockRejectedValueOnce(new Error('Network error'))
            .mockImplementationOnce(
                () =>
                    new Promise<void>((resolve) => {
                        resolveUpload = resolve;
                    })
            );

        render(<AudioRecorder {...defaultProps} onRecordingComplete={onComplete} />);

        fireEvent.click(screen.getByText('Record audio response if you prefer'));
        await waitFor(() => {
            expect(screen.getByRole('img', { name: /recording in progress/ })).toBeInTheDocument();
        });
        fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
        await simulateRecordingComplete();

        await waitFor(() => {
            expect(screen.getByRole('button', { name: 'Retry upload' })).toBeInTheDocument();
        });

        fireEvent.click(screen.getByRole('button', { name: 'Retry upload' }));

        // Upload status is now shown as an inline icon with aria-label
        await waitFor(() => {
            expect(screen.getByLabelText('Uploading...')).toBeInTheDocument();
        });

        await act(async () => resolveUpload());
    });

    it('hides retry button after successful retry', async () => {
        const onComplete = vi
            .fn()
            .mockRejectedValueOnce(new Error('Network error'))
            .mockResolvedValueOnce(undefined);

        render(<AudioRecorder {...defaultProps} onRecordingComplete={onComplete} />);

        fireEvent.click(screen.getByText('Record audio response if you prefer'));
        await waitFor(() => {
            expect(screen.getByRole('img', { name: /recording in progress/ })).toBeInTheDocument();
        });
        fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
        await simulateRecordingComplete();

        await waitFor(() => {
            expect(screen.getByRole('button', { name: 'Retry upload' })).toBeInTheDocument();
        });

        fireEvent.click(screen.getByRole('button', { name: 'Retry upload' }));

        await waitFor(() => {
            expect(screen.queryByRole('button', { name: 'Retry upload' })).not.toBeInTheDocument();
        });
    });

    it('shows retry button again if retry also fails', async () => {
        const onComplete = vi
            .fn()
            .mockRejectedValueOnce(new Error('fail 1'))
            .mockRejectedValueOnce(new Error('fail 2'));

        render(<AudioRecorder {...defaultProps} onRecordingComplete={onComplete} />);

        fireEvent.click(screen.getByText('Record audio response if you prefer'));
        await waitFor(() => {
            expect(screen.getByRole('img', { name: /recording in progress/ })).toBeInTheDocument();
        });
        fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
        await simulateRecordingComplete();

        await waitFor(() => {
            expect(screen.getByRole('button', { name: 'Retry upload' })).toBeInTheDocument();
        });

        fireEvent.click(screen.getByRole('button', { name: 'Retry upload' }));

        // After second failure, retry button should reappear
        await waitFor(() => {
            expect(screen.getByRole('button', { name: 'Retry upload' })).toBeInTheDocument();
            expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument();
        });
    });

    it('clears retry state on delete after upload failure', async () => {
        const onComplete = vi.fn().mockRejectedValue(new Error('Network error'));
        const onDelete = vi.fn().mockResolvedValue(undefined);

        render(
            <AudioRecorder
                {...defaultProps}
                onRecordingComplete={onComplete}
                onRecordingDeleted={onDelete}
            />
        );

        fireEvent.click(screen.getByText('Record audio response if you prefer'));
        await waitFor(() => {
            expect(screen.getByRole('img', { name: /recording in progress/ })).toBeInTheDocument();
        });
        fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
        await simulateRecordingComplete();

        await waitFor(() => {
            expect(screen.getByRole('button', { name: 'Retry upload' })).toBeInTheDocument();
        });

        // Delete should clear everything
        fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

        await waitFor(() => {
            expect(screen.getByText('Record audio response if you prefer')).toBeInTheDocument();
            expect(screen.queryByRole('button', { name: 'Retry upload' })).not.toBeInTheDocument();
        });
    });

    // ── BLOB VALIDATION ─────────────────────────────────────────────

    it('rejects empty blob and reports error', async () => {
        const onError = vi.fn();
        render(<AudioRecorder {...defaultProps} onError={onError} />);

        fireEvent.click(screen.getByText('Record audio response if you prefer'));
        await waitFor(() => {
            expect(screen.getByRole('img', { name: /recording in progress/ })).toBeInTheDocument();
        });

        fireEvent.click(screen.getByRole('button', { name: 'Stop' }));

        // Trigger onstop WITHOUT ondataavailable → empty blob
        if (capturedMediaRecorder?.onstop) {
            await capturedMediaRecorder.onstop(new Event('stop'));
        }

        await waitFor(() => {
            expect(onError).toHaveBeenCalledWith('empty_blob');
            expect(mockToast.error).toHaveBeenCalledWith(
                'Recording failed - no audio data captured'
            );
        });
    });

    it('accepts small non-empty blob (relaxed threshold)', async () => {
        const onComplete = vi.fn().mockResolvedValue(undefined);
        render(<AudioRecorder {...defaultProps} onRecordingComplete={onComplete} />);

        fireEvent.click(screen.getByText('Record audio response if you prefer'));
        await waitFor(() => {
            expect(screen.getByRole('img', { name: /recording in progress/ })).toBeInTheDocument();
        });

        fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
        await simulateRecordingComplete('x'); // 1-byte blob

        await waitFor(() => {
            expect(onComplete).toHaveBeenCalled();
        });
    });

    // ── ERROR HANDLING ──────────────────────────────────────────────

    it('shows permission denied message with browser guidance', async () => {
        (navigator.mediaDevices.getUserMedia as ReturnType<typeof vi.fn>).mockRejectedValue(
            new Error('Permission denied')
        );

        render(<AudioRecorder {...defaultProps} />);
        fireEvent.click(screen.getByText('Record audio response if you prefer'));

        await waitFor(() => {
            expect(mockToast.error).toHaveBeenCalledWith(
                'Microphone permission denied. Check your browser settings to allow microphone access, then try again.'
            );
        });
    });

    it('calls onError with mic_denied on permission denial', async () => {
        const onError = vi.fn();
        (navigator.mediaDevices.getUserMedia as ReturnType<typeof vi.fn>).mockRejectedValue(
            new Error('Permission denied')
        );

        render(<AudioRecorder {...defaultProps} onError={onError} />);
        fireEvent.click(screen.getByText('Record audio response if you prefer'));

        await waitFor(() => {
            expect(onError).toHaveBeenCalledWith('mic_denied');
        });
    });

    it('calls onError with unsupported when MediaRecorder is unavailable', async () => {
        const onError = vi.fn();
        const savedMR = global.MediaRecorder;

        // Remove MediaRecorder entirely
        Object.defineProperty(global, 'MediaRecorder', {
            value: undefined,
            writable: true,
            configurable: true,
        });

        render(<AudioRecorder {...defaultProps} onError={onError} />);
        fireEvent.click(screen.getByText('Record audio response if you prefer'));

        await waitFor(() => {
            expect(onError).toHaveBeenCalledWith('unsupported');
        });

        // Restore
        global.MediaRecorder = savedMR;
    });

    it('shows specific error for SecurityError', async () => {
        const onError = vi.fn();
        render(<AudioRecorder {...defaultProps} onError={onError} />);

        fireEvent.click(screen.getByText('Record audio response if you prefer'));
        await waitFor(() => {
            expect(capturedMediaRecorder).not.toBeNull();
        });

        if (capturedMediaRecorder?.onerror) {
            capturedMediaRecorder.onerror({ error: { name: 'SecurityError' } });
        }

        await waitFor(() => {
            expect(mockToast.error).toHaveBeenCalledWith(
                'Recording blocked by browser security settings'
            );
            expect(onError).toHaveBeenCalledWith('recorder_error');
        });
    });

    it('shows specific error for InvalidStateError', async () => {
        const onError = vi.fn();
        render(<AudioRecorder {...defaultProps} onError={onError} />);

        fireEvent.click(screen.getByText('Record audio response if you prefer'));
        await waitFor(() => {
            expect(capturedMediaRecorder).not.toBeNull();
        });

        if (capturedMediaRecorder?.onerror) {
            capturedMediaRecorder.onerror({ error: { name: 'InvalidStateError' } });
        }

        await waitFor(() => {
            expect(mockToast.error).toHaveBeenCalledWith('Recording encountered an internal error');
        });
    });

    it('shows generic error for unknown MediaRecorder errors', async () => {
        render(<AudioRecorder {...defaultProps} />);

        fireEvent.click(screen.getByText('Record audio response if you prefer'));
        await waitFor(() => {
            expect(capturedMediaRecorder).not.toBeNull();
        });

        if (capturedMediaRecorder?.onerror) {
            capturedMediaRecorder.onerror({ error: { name: 'SomeUnknownError' } });
        }

        await waitFor(() => {
            expect(mockToast.error).toHaveBeenCalledWith('Recording error - please try again');
        });
    });

    // ── AUTO-STOP WARNING ───────────────────────────────────────────

    it('shows amber warning when ≤15s remaining', async () => {
        vi.useFakeTimers();
        render(<AudioRecorder {...defaultProps} maxDurationSeconds={20} />);

        await act(async () => {
            fireEvent.click(screen.getByText('Record audio response if you prefer'));
            await vi.advanceTimersByTimeAsync(0);
        });
        expect(screen.getByRole('img', { name: /recording in progress/ })).toBeInTheDocument();

        // Advance to 6s elapsed → 14s remaining ≤ 15
        await act(async () => {
            await vi.advanceTimersByTimeAsync(6000);
        });

        const timeDisplay = screen.getByText('0:06 / 0:20');
        expect(timeDisplay.className).toContain('text-amber-600');
        expect(timeDisplay.className).toContain('animate-pulse');
    });

    it('timer counter turns amber+bold when ≤15s remaining', async () => {
        vi.useFakeTimers();
        render(<AudioRecorder {...defaultProps} maxDurationSeconds={20} />);

        await act(async () => {
            fireEvent.click(screen.getByText('Record audio response if you prefer'));
            await vi.advanceTimersByTimeAsync(0);
        });
        expect(screen.getByRole('img', { name: /recording in progress/ })).toBeInTheDocument();

        await act(async () => {
            await vi.advanceTimersByTimeAsync(6000);
        });

        const timeDisplay = screen.getByText('0:06 / 0:20');
        expect(timeDisplay.className).toContain('text-amber-600');
        expect(timeDisplay.className).toContain('font-bold');
    });

    // ── WAVEFORM ACCESSIBILITY ──────────────────────────────────────

    it('waveform has accessible role and label during recording', async () => {
        render(<AudioRecorder {...defaultProps} />);

        fireEvent.click(screen.getByText('Record audio response if you prefer'));
        await waitFor(() => {
            expect(screen.getByRole('img', { name: /recording in progress/ })).toBeInTheDocument();
        });

        const waveform = screen.getByRole('img');
        expect(waveform).toHaveAttribute('aria-label', 'Audio waveform - recording in progress');
    });

    // ── KEYBOARD SHORTCUTS ──────────────────────────────────────────

    it('Space key starts recording in idle state', async () => {
        const { container } = render(<AudioRecorder {...defaultProps} />);

        fireEvent.keyDown(container.firstElementChild as HTMLElement, { code: 'Space' });

        await waitFor(() => {
            expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalled();
        });
    });

    it('Space key stops recording in recording state', async () => {
        const { container } = await startRecordingFlow();

        // Fire on the container div (not a button — buttons handle Space natively)
        fireEvent.keyDown(container.firstElementChild as HTMLElement, { code: 'Space' });

        await waitFor(() => {
            expect(capturedMediaRecorder?.stop).toHaveBeenCalled();
        });
    });

    it('Space key is ignored when disabled', () => {
        render(<AudioRecorder {...defaultProps} disabled={true} />);

        fireEvent.keyDown(document.body, { code: 'Space' });

        expect(navigator.mediaDevices.getUserMedia).not.toHaveBeenCalled();
    });

    it('Space key is ignored inside textarea', () => {
        render(
            <div>
                <textarea data-testid="textarea" />
                <AudioRecorder {...defaultProps} />
            </div>
        );

        const textarea = screen.getByTestId('textarea');
        fireEvent.keyDown(textarea, { code: 'Space' });

        expect(navigator.mediaDevices.getUserMedia).not.toHaveBeenCalled();
    });

    // ── UPLOAD STATUS ICONS ─────────────────────────────────────────

    it('shows uploading icon during upload', async () => {
        let resolveUpload!: () => void;
        const onComplete = vi.fn(
            () =>
                new Promise<void>((resolve) => {
                    resolveUpload = resolve;
                })
        );

        render(<AudioRecorder {...defaultProps} onRecordingComplete={onComplete} />);

        fireEvent.click(screen.getByText('Record audio response if you prefer'));
        await waitFor(() => {
            expect(screen.getByRole('img', { name: /recording in progress/ })).toBeInTheDocument();
        });

        fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
        await simulateRecordingComplete();

        await waitFor(() => {
            expect(screen.getByLabelText('Uploading...')).toBeInTheDocument();
        });

        await act(async () => resolveUpload());
    });

    it('shows success icon after successful upload', async () => {
        const onComplete = vi.fn().mockResolvedValue(undefined);
        render(<AudioRecorder {...defaultProps} onRecordingComplete={onComplete} />);

        fireEvent.click(screen.getByText('Record audio response if you prefer'));
        await waitFor(() => {
            expect(screen.getByRole('img', { name: /recording in progress/ })).toBeInTheDocument();
        });

        fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
        await simulateRecordingComplete();

        await waitFor(() => {
            expect(screen.getByLabelText('Uploaded')).toBeInTheDocument();
        });
    });

    it('shows failure icon on upload error (no toast)', async () => {
        const onComplete = vi.fn().mockRejectedValue(new Error('Network error'));
        render(<AudioRecorder {...defaultProps} onRecordingComplete={onComplete} />);

        fireEvent.click(screen.getByText('Record audio response if you prefer'));
        await waitFor(() => {
            expect(screen.getByRole('img', { name: /recording in progress/ })).toBeInTheDocument();
        });

        fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
        await simulateRecordingComplete();

        await waitFor(() => {
            expect(screen.getByRole('button', { name: 'Retry upload' })).toBeInTheDocument();
        });

        // Upload failure uses inline icon, not toast
        expect(mockToast.error).not.toHaveBeenCalled();
    });

    // ── CLEANUP ─────────────────────────────────────────────────────

    it('cleans up media stream on unmount', async () => {
        const { unmount } = render(<AudioRecorder {...defaultProps} />);

        fireEvent.click(screen.getByText('Record audio response if you prefer'));
        await waitFor(() => {
            expect(screen.getByRole('img', { name: /recording in progress/ })).toBeInTheDocument();
        });

        unmount();

        expect(mockStream.getTracks()[0].stop).toHaveBeenCalled();
    });
});
