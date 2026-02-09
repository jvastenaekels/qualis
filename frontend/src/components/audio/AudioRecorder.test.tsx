/*
 * Libre-Q - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Libre-Q Team
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AudioRecorder } from './AudioRecorder';

// Mock i18next
vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, fallback?: string) => fallback || key,
    }),
}));

// Mock sonner toast
vi.mock('sonner', () => ({
    toast: {
        success: vi.fn(),
        error: vi.fn(),
    },
}));

describe('AudioRecorder', () => {
    let mockMediaStream: MediaStream;
    let mockMediaRecorder: MediaRecorder;
    let mockAudio: HTMLAudioElement;

    beforeEach(() => {
        // Mock MediaStream
        mockMediaStream = {
            getTracks: vi.fn(() => [
                {
                    stop: vi.fn(),
                } as unknown as MediaStreamTrack,
            ]),
        } as unknown as MediaStream;

        // Mock MediaRecorder
        mockMediaRecorder = {
            start: vi.fn(),
            stop: vi.fn(),
            ondataavailable: null,
            onstop: null,
            state: 'inactive',
        } as unknown as MediaRecorder;

        // Mock navigator.mediaDevices.getUserMedia
        global.navigator.mediaDevices = {
            getUserMedia: vi.fn().mockResolvedValue(mockMediaStream),
        } as unknown as MediaDevices;

        // Mock MediaRecorder constructor
        global.MediaRecorder = class {
            start = mockMediaRecorder.start;
            stop = mockMediaRecorder.stop;
            ondataavailable = mockMediaRecorder.ondataavailable;
            onstop = mockMediaRecorder.onstop;
            state = mockMediaRecorder.state;

            constructor() {
                Object.assign(this, mockMediaRecorder);
            }
            static isTypeSupported(type: string) {
                return type === 'audio/webm;codecs=opus';
            }
        } as unknown as typeof MediaRecorder;

        // Mock Audio constructor
        mockAudio = {
            play: vi.fn(),
            pause: vi.fn(),
            onended: null,
        } as unknown as HTMLAudioElement;
        global.Audio = vi.fn().mockImplementation(() => mockAudio);

        // Mock URL.createObjectURL and revokeObjectURL
        global.URL.createObjectURL = vi.fn(() => 'blob:mock-url');
        global.URL.revokeObjectURL = vi.fn();
    });

    afterEach(() => {
        cleanup();
        vi.clearAllMocks();
        vi.restoreAllMocks();
    });

    const defaultProps = {
        questionKey: 'test-question',
        maxDurationSeconds: 180,
        onRecordingComplete: vi.fn().mockResolvedValue(undefined),
        onRecordingDeleted: vi.fn().mockResolvedValue(undefined),
    };

    it('renders with idle state initially', () => {
        render(<AudioRecorder {...defaultProps} />);

        expect(screen.getByText('Ready to record')).toBeInTheDocument();
        expect(screen.getByText('Start Recording')).toBeInTheDocument();
        expect(screen.getByText('0:00 / 3:00')).toBeInTheDocument();
    });

    it('requests microphone permission when recording starts', async () => {
        render(<AudioRecorder {...defaultProps} />);

        const startButton = screen.getByText('Start Recording');
        fireEvent.click(startButton);

        await waitFor(() => {
            expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith({ audio: true });
        });
    });

    it('transitions to recording state after starting', async () => {
        render(<AudioRecorder {...defaultProps} />);

        const startButton = screen.getByText('Start Recording');
        fireEvent.click(startButton);

        await waitFor(() => {
            expect(screen.getByText('Recording...')).toBeInTheDocument();
            expect(screen.getByText('Stop')).toBeInTheDocument();
        });

        expect(mockMediaRecorder.start).toHaveBeenCalled();
    });

    it('increments timer during recording', async () => {
        vi.useFakeTimers();
        render(<AudioRecorder {...defaultProps} />);

        const startButton = screen.getByText('Start Recording');
        fireEvent.click(startButton);

        await waitFor(() => {
            expect(screen.getByText('Recording...')).toBeInTheDocument();
        });

        // Advance timer by 5 seconds
        vi.advanceTimersByTime(5000);

        await waitFor(() => {
            expect(screen.getByText('0:05 / 3:00')).toBeInTheDocument();
        });

        vi.useRealTimers();
    });

    it('auto-stops recording at max duration', async () => {
        vi.useFakeTimers();
        render(<AudioRecorder {...defaultProps} maxDurationSeconds={10} />);

        const startButton = screen.getByText('Start Recording');
        fireEvent.click(startButton);

        await waitFor(() => {
            expect(screen.getByText('Recording...')).toBeInTheDocument();
        });

        // Advance timer to max duration
        vi.advanceTimersByTime(10000);

        await waitFor(() => {
            expect(mockMediaRecorder.stop).toHaveBeenCalled();
        });

        vi.useRealTimers();
    });

    it('calls onRecordingComplete when recording stops', async () => {
        const onComplete = vi.fn().mockResolvedValue(undefined);
        render(<AudioRecorder {...defaultProps} onRecordingComplete={onComplete} />);

        const startButton = screen.getByText('Start Recording');
        fireEvent.click(startButton);

        await waitFor(() => {
            expect(screen.getByText('Recording...')).toBeInTheDocument();
        });

        // Simulate recording completion
        const stopButton = screen.getByText('Stop');
        fireEvent.click(stopButton);

        // Simulate MediaRecorder onstop event
        if (mockMediaRecorder.onstop) {
            mockMediaRecorder.onstop(new Event('stop'));
        }

        await waitFor(() => {
            expect(onComplete).toHaveBeenCalled();
        });
    });

    it('displays play and delete buttons when recording exists', async () => {
        render(
            <AudioRecorder
                {...defaultProps}
                existingRecording={{
                    id: 1,
                    presigned_url: 'https://s3.example.com/audio.webm',
                    duration_seconds: 45,
                    file_size_bytes: 1024,
                }}
            />
        );

        await waitFor(() => {
            expect(screen.getByText('Recorded')).toBeInTheDocument();
            expect(screen.getByText('Play')).toBeInTheDocument();
            expect(screen.getByText('Delete')).toBeInTheDocument();
            expect(screen.getByText('0:45 / 3:00')).toBeInTheDocument();
        });
    });

    it('plays audio when play button is clicked', async () => {
        render(
            <AudioRecorder
                {...defaultProps}
                existingRecording={{
                    id: 1,
                    presigned_url: 'https://s3.example.com/audio.webm',
                    duration_seconds: 45,
                    file_size_bytes: 1024,
                }}
            />
        );

        const playButton = screen.getByText('Play');
        fireEvent.click(playButton);

        await waitFor(() => {
            expect(mockAudio.play).toHaveBeenCalled();
            expect(screen.getByText('Pause')).toBeInTheDocument();
        });
    });

    it('pauses audio when pause button is clicked', async () => {
        render(
            <AudioRecorder
                {...defaultProps}
                existingRecording={{
                    id: 1,
                    presigned_url: 'https://s3.example.com/audio.webm',
                    duration_seconds: 45,
                    file_size_bytes: 1024,
                }}
            />
        );

        // Start playing
        const playButton = screen.getByText('Play');
        fireEvent.click(playButton);

        await waitFor(() => {
            expect(screen.getByText('Pause')).toBeInTheDocument();
        });

        // Pause
        const pauseButton = screen.getByText('Pause');
        fireEvent.click(pauseButton);

        await waitFor(() => {
            expect(mockAudio.pause).toHaveBeenCalled();
            expect(screen.getByText('Play')).toBeInTheDocument();
        });
    });

    it('calls onRecordingDeleted when delete button is clicked', async () => {
        const onDelete = vi.fn().mockResolvedValue(undefined);
        render(
            <AudioRecorder
                {...defaultProps}
                onRecordingDeleted={onDelete}
                existingRecording={{
                    id: 1,
                    presigned_url: 'https://s3.example.com/audio.webm',
                    duration_seconds: 45,
                    file_size_bytes: 1024,
                }}
            />
        );

        const deleteButton = screen.getByText('Delete');
        fireEvent.click(deleteButton);

        await waitFor(() => {
            expect(onDelete).toHaveBeenCalled();
        });
    });

    it('resets to idle state after deletion', async () => {
        const onDelete = vi.fn().mockResolvedValue(undefined);
        render(
            <AudioRecorder
                {...defaultProps}
                onRecordingDeleted={onDelete}
                existingRecording={{
                    id: 1,
                    presigned_url: 'https://s3.example.com/audio.webm',
                    duration_seconds: 45,
                    file_size_bytes: 1024,
                }}
            />
        );

        const deleteButton = screen.getByText('Delete');
        fireEvent.click(deleteButton);

        await waitFor(() => {
            expect(onDelete).toHaveBeenCalled();
            expect(screen.getByText('Ready to record')).toBeInTheDocument();
            expect(screen.getByText('Start Recording')).toBeInTheDocument();
            expect(screen.getByText('0:00 / 3:00')).toBeInTheDocument();
        });
    });

    it('shows uploading state during upload', async () => {
        const onComplete = vi.fn(() => new Promise((resolve) => setTimeout(resolve, 1000)));
        render(<AudioRecorder {...defaultProps} onRecordingComplete={onComplete} />);

        const startButton = screen.getByText('Start Recording');
        fireEvent.click(startButton);

        await waitFor(() => {
            expect(screen.getByText('Recording...')).toBeInTheDocument();
        });

        const stopButton = screen.getByText('Stop');
        fireEvent.click(stopButton);

        // Simulate MediaRecorder onstop event
        if (mockMediaRecorder.onstop) {
            mockMediaRecorder.onstop(new Event('stop'));
        }

        await waitFor(() => {
            expect(screen.getByText('Uploading...')).toBeInTheDocument();
        });
    });

    it('displays file size for existing recordings', () => {
        render(
            <AudioRecorder
                {...defaultProps}
                existingRecording={{
                    id: 1,
                    presigned_url: 'https://s3.example.com/audio.webm',
                    duration_seconds: 45,
                    file_size_bytes: 2048, // 2KB
                }}
            />
        );

        expect(screen.getByText(/File size.*2\.0 KB/i)).toBeInTheDocument();
    });

    it('shows error toast when microphone permission is denied', async () => {
        const { toast } = await import('sonner');

        // Mock getUserMedia to reject
        (navigator.mediaDevices.getUserMedia as ReturnType<typeof vi.fn>).mockRejectedValue(
            new Error('Permission denied')
        );

        render(<AudioRecorder {...defaultProps} />);

        const startButton = screen.getByText('Start Recording');
        fireEvent.click(startButton);

        await waitFor(() => {
            expect(toast.error).toHaveBeenCalledWith('Microphone permission denied');
        });
    });

    it('disables start button when disabled prop is true', () => {
        render(<AudioRecorder {...defaultProps} disabled={true} />);

        const startButton = screen.getByText('Start Recording');
        expect(startButton).toBeDisabled();
    });

    it('formats time correctly', () => {
        render(<AudioRecorder {...defaultProps} maxDurationSeconds={125} />);

        expect(screen.getByText('0:00 / 2:05')).toBeInTheDocument();
    });

    it('cleans up media stream on unmount', async () => {
        const { unmount } = render(<AudioRecorder {...defaultProps} />);

        const startButton = screen.getByText('Start Recording');
        fireEvent.click(startButton);

        await waitFor(() => {
            expect(mockMediaStream.getTracks).toBeDefined();
        });

        unmount();

        // Verify cleanup was called (indirectly via useEffect cleanup)
        expect(mockMediaStream.getTracks()[0].stop).toHaveBeenCalled();
    });

    it('prefers WebM codec when supported', async () => {
        render(<AudioRecorder {...defaultProps} />);

        const startButton = screen.getByText('Start Recording');
        fireEvent.click(startButton);

        await waitFor(() => {
            expect(global.MediaRecorder).toHaveBeenCalledWith(mockMediaStream, {
                mimeType: 'audio/webm;codecs=opus',
            });
        });
    });

    it('falls back to MP4 when WebM is not supported', async () => {
        (
            global.MediaRecorder as unknown as { isTypeSupported: (type: string) => boolean }
        ).isTypeSupported = vi.fn(() => false);

        render(<AudioRecorder {...defaultProps} />);

        const startButton = screen.getByText('Start Recording');
        fireEvent.click(startButton);

        await waitFor(() => {
            expect(global.MediaRecorder).toHaveBeenCalledWith(mockMediaStream, {
                mimeType: 'audio/mp4',
            });
        });
    });
});
