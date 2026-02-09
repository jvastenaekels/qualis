import type React from 'react';
import { useState, useRef, useEffect, useCallback } from 'react';
import { Mic, Square, Play, Pause, Trash2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';

interface AudioRecorderProps {
    questionKey: string;
    maxDurationSeconds?: number;
    onRecordingComplete: (blob: Blob, duration: number) => Promise<void>;
    onRecordingDeleted: () => Promise<void>;
    existingRecording?: {
        id: number;
        presigned_url: string;
        duration_seconds: number;
        file_size_bytes: number;
        created_at: string;
    } | null;
    disabled?: boolean;
    sessionToken?: string; // For refreshing presigned URLs
}

type RecorderState = 'idle' | 'recording' | 'stopped' | 'playing' | 'uploading';

export const AudioRecorder: React.FC<AudioRecorderProps> = ({
    questionKey: _questionKey,
    maxDurationSeconds = 180,
    onRecordingComplete,
    onRecordingDeleted,
    existingRecording,
    disabled = false,
    sessionToken,
}) => {
    const { t } = useTranslation();

    const [state, setState] = useState<RecorderState>('idle');
    const [duration, setDuration] = useState(0);
    const [_audioBlob, setAudioBlob] = useState<Blob | null>(null);
    const [audioUrl, setAudioUrl] = useState<string | null>(null);

    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const audioChunksRef = useRef<Blob[]>([]);
    const timerRef = useRef<NodeJS.Timeout | null>(null);
    const audioPlayerRef = useRef<HTMLAudioElement | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const audioContextRef = useRef<AudioContext | null>(null);
    const analyserRef = useRef<AnalyserNode | null>(null);
    const animationFrameRef = useRef<number | null>(null);

    const [audioLevels, setAudioLevels] = useState<number[]>([0, 0, 0, 0, 0]);
    const [urlExpiresAt, setUrlExpiresAt] = useState<number | null>(null);

    // Function to refresh presigned URL (must be defined before useEffect)
    const refreshPresignedUrl = useCallback(async () => {
        if (!existingRecording || !sessionToken) return;

        try {
            // Import the API function dynamically to avoid circular dependencies
            const { getAudioUrlApiAudioRecordingIdUrlGet } = await import('@/api/generated');

            const response = await getAudioUrlApiAudioRecordingIdUrlGet(existingRecording.id, {
                session_token: sessionToken,
            });

            if (response.presigned_url) {
                setAudioUrl(response.presigned_url);

                // Update expiration time
                const now = Date.now();
                const newExpiresAt = now + 3600 * 1000; // 1 hour from now
                setUrlExpiresAt(newExpiresAt);

                console.log('Presigned URL refreshed successfully');
            }
        } catch (error) {
            console.error('Failed to refresh presigned URL:', error);
            // Don't show error toast - it's a background operation
        }
    }, [existingRecording, sessionToken]);

    // Initialize with existing recording
    useEffect(() => {
        if (existingRecording) {
            setAudioUrl(existingRecording.presigned_url);
            setDuration(Math.round(existingRecording.duration_seconds));
            setState('stopped');

            // Calculate expiration time (presigned URLs are valid for 1 hour)
            const createdAt = new Date(existingRecording.created_at).getTime();
            const expiresAt = createdAt + 3600 * 1000; // 1 hour from creation
            setUrlExpiresAt(expiresAt);
        }
    }, [existingRecording]);

    // Check URL expiration and refresh if needed
    useEffect(() => {
        if (!existingRecording || !urlExpiresAt || state !== 'stopped') return;

        const checkExpiration = () => {
            const now = Date.now();
            const timeUntilExpiry = urlExpiresAt - now;

            // Refresh URL if it expires in less than 5 minutes (buffer time)
            if (timeUntilExpiry < 5 * 60 * 1000 && timeUntilExpiry > 0) {
                refreshPresignedUrl();
            }
        };

        // Check immediately
        checkExpiration();

        // Check every minute
        const interval = setInterval(checkExpiration, 60 * 1000);

        return () => clearInterval(interval);
    }, [existingRecording, urlExpiresAt, state, refreshPresignedUrl]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
            if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
            if (audioContextRef.current) {
                audioContextRef.current.close();
            }
            if (streamRef.current) {
                streamRef.current.getTracks().forEach((track) => {
                    track.stop();
                });
            }
            if (audioUrl && !existingRecording) {
                URL.revokeObjectURL(audioUrl);
            }
        };
    }, [audioUrl, existingRecording]);

    // Keyboard shortcuts
    useEffect(() => {
        if (disabled) return;

        const handleKeyDown = (event: KeyboardEvent) => {
            // Only handle if Space is pressed and not in an input field
            if (
                event.code === 'Space' &&
                event.target instanceof HTMLElement &&
                !['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName)
            ) {
                event.preventDefault();

                if (state === 'idle') {
                    startRecording();
                } else if (state === 'recording') {
                    stopRecording();
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);

        return () => {
            window.removeEventListener('keydown', handleKeyDown);
        };
        // Functions intentionally use closure over current state
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [state, disabled]);

    const startRecording = async () => {
        try {
            // Request microphone permission
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            streamRef.current = stream;

            // Determine MIME type (prefer WebM, fallback to MP4)
            const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
                ? 'audio/webm;codecs=opus'
                : 'audio/mp4';

            const mediaRecorder = new MediaRecorder(stream, { mimeType });
            mediaRecorderRef.current = mediaRecorder;
            audioChunksRef.current = [];

            // Setup Web Audio API for waveform visualization
            const audioContext = new AudioContext();
            const analyser = audioContext.createAnalyser();
            const source = audioContext.createMediaStreamSource(stream);
            source.connect(analyser);
            analyser.fftSize = 32;

            audioContextRef.current = audioContext;
            analyserRef.current = analyser;

            // Animate waveform
            const dataArray = new Uint8Array(analyser.frequencyBinCount);
            const updateWaveform = () => {
                if (analyserRef.current) {
                    analyserRef.current.getByteFrequencyData(dataArray);
                    setAudioLevels(Array.from(dataArray.slice(0, 5)));
                    animationFrameRef.current = requestAnimationFrame(updateWaveform);
                }
            };
            updateWaveform();

            mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    audioChunksRef.current.push(event.data);
                }
            };

            mediaRecorder.onstop = async () => {
                const blob = new Blob(audioChunksRef.current, { type: mimeType });
                setAudioBlob(blob);

                const url = URL.createObjectURL(blob);
                setAudioUrl(url);

                // Immediately transition to stopped state (don't block UI)
                setState('stopped');

                // Upload in background
                onRecordingComplete(blob, duration)
                    .then(() => {
                        toast.success(t('audio.upload_success', 'Audio uploaded successfully'));
                    })
                    .catch((error) => {
                        console.error('Upload failed:', error);
                        toast.error(t('audio.upload_failed', 'Upload failed'));
                        // Revert state on failure
                        setState('idle');
                        setAudioUrl(null);
                        setDuration(0);
                    });

                // Stop all tracks
                stream.getTracks().forEach((track) => {
                    track.stop();
                });
                streamRef.current = null;
            };

            mediaRecorder.start();
            setState('recording');
            setDuration(0);

            // Start timer
            timerRef.current = setInterval(() => {
                setDuration((prev) => {
                    const newDuration = prev + 1;

                    // Auto-stop at max duration
                    if (newDuration >= maxDurationSeconds) {
                        stopRecording();
                    }

                    return newDuration;
                });
            }, 1000);
        } catch (error) {
            console.error('Microphone access denied:', error);
            toast.error(t('audio.permission_denied', 'Microphone permission denied'));
        }
    };

    const stopRecording = () => {
        if (mediaRecorderRef.current && state === 'recording') {
            mediaRecorderRef.current.stop();
            if (timerRef.current) {
                clearInterval(timerRef.current);
                timerRef.current = null;
            }
            if (animationFrameRef.current) {
                cancelAnimationFrame(animationFrameRef.current);
                animationFrameRef.current = null;
            }
            if (audioContextRef.current) {
                audioContextRef.current.close();
                audioContextRef.current = null;
            }
            setAudioLevels([0, 0, 0, 0, 0]);
        }
    };

    const playRecording = () => {
        if (!audioUrl) return;

        const audio = new Audio(audioUrl);
        audioPlayerRef.current = audio;

        audio.onended = () => {
            setState('stopped');
        };

        audio.play();
        setState('playing');
    };

    const pausePlayback = () => {
        if (audioPlayerRef.current) {
            audioPlayerRef.current.pause();
            setState('stopped');
        }
    };

    const deleteRecording = async () => {
        if (timerRef.current) clearInterval(timerRef.current);
        if (animationFrameRef.current) {
            cancelAnimationFrame(animationFrameRef.current);
            animationFrameRef.current = null;
        }
        if (audioContextRef.current) {
            audioContextRef.current.close();
            audioContextRef.current = null;
        }

        setState('uploading');

        try {
            await onRecordingDeleted();

            // Reset state
            setAudioBlob(null);
            if (audioUrl && !existingRecording) {
                URL.revokeObjectURL(audioUrl);
            }
            setAudioUrl(null);
            setDuration(0);
            setAudioLevels([0, 0, 0, 0, 0]);
            setState('idle');

            toast.success(t('audio.deleted', 'Audio deleted'));
        } catch (error) {
            console.error('Delete failed:', error);
            toast.error(t('audio.delete_failed', 'Delete failed'));
            setState('stopped');
        }
    };

    const formatTime = (seconds: number): string => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    return (
        <div className="border border-slate-300 rounded-lg p-4 bg-slate-50">
            {/* Timer/Progress */}
            <div className="mb-4">
                <div className="flex justify-between items-center mb-2">
                    <div className="flex items-center gap-2">
                        {state === 'recording' && (
                            <span className="relative flex h-3 w-3">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                                <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500" />
                            </span>
                        )}
                        <span
                            className={`text-sm font-medium ${state === 'recording' ? 'text-red-600' : 'text-slate-700'}`}
                        >
                            {state === 'recording' && t('audio.recording', 'Recording...')}
                            {state === 'stopped' && t('audio.recorded', 'Recorded')}
                            {state === 'playing' && t('audio.playing', 'Playing...')}
                            {state === 'uploading' && t('audio.uploading', 'Uploading...')}
                            {state === 'idle' && t('audio.ready', 'Ready to record')}
                        </span>
                    </div>
                    <span className="text-sm font-mono text-slate-600">
                        {formatTime(duration)} / {formatTime(maxDurationSeconds)}
                    </span>
                </div>

                {/* Waveform Visualization during recording */}
                {state === 'recording' ? (
                    <div className="flex items-center justify-center gap-1 h-12 bg-slate-100 rounded-md">
                        {audioLevels.map((level, i) => (
                            <div
                                key={i}
                                className="w-1.5 bg-red-500 rounded-full transition-all duration-100"
                                style={{
                                    height: `${Math.max(4, (level / 255) * 48)}px`,
                                }}
                            />
                        ))}
                    </div>
                ) : (
                    <Progress value={(duration / maxDurationSeconds) * 100} className="h-2" />
                )}
            </div>

            {/* Controls */}
            <div className="flex gap-2 justify-center">
                {state === 'idle' && (
                    <Button
                        onClick={startRecording}
                        disabled={disabled}
                        className="flex items-center gap-2"
                        variant="default"
                    >
                        <Mic className="w-4 h-4" />
                        {t('audio.start_recording', 'Start Recording')}
                    </Button>
                )}

                {state === 'recording' && (
                    <Button
                        onClick={stopRecording}
                        className="flex items-center gap-2"
                        variant="destructive"
                    >
                        <Square className="w-4 h-4" />
                        {t('audio.stop_recording', 'Stop')}
                    </Button>
                )}

                {(state === 'stopped' || state === 'playing') && (
                    <>
                        <Button
                            onClick={state === 'playing' ? pausePlayback : playRecording}
                            className="flex items-center gap-2"
                            variant="secondary"
                        >
                            {state === 'playing' ? (
                                <>
                                    <Pause className="w-4 h-4" />
                                    {t('audio.pause', 'Pause')}
                                </>
                            ) : (
                                <>
                                    <Play className="w-4 h-4" />
                                    {t('audio.play', 'Play')}
                                </>
                            )}
                        </Button>

                        <Button
                            onClick={deleteRecording}
                            className="flex items-center gap-2"
                            variant="outline"
                        >
                            <Trash2 className="w-4 h-4" />
                            {t('audio.delete', 'Delete')}
                        </Button>
                    </>
                )}

                {state === 'uploading' && (
                    <Button disabled className="flex items-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        {t('audio.uploading', 'Uploading...')}
                    </Button>
                )}
            </div>

            {/* File size info */}
            {existingRecording && (
                <p className="text-xs text-slate-500 text-center mt-2">
                    {t('audio.file_size', 'File size')}:{' '}
                    {(existingRecording.file_size_bytes / 1024).toFixed(1)} KB
                </p>
            )}
        </div>
    );
};
