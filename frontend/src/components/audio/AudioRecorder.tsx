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
        url_expires_at?: string;
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
    const permissionCheckIntervalRef = useRef<NodeJS.Timeout | null>(null);

    const [audioLevels, setAudioLevels] = useState<number[]>([0, 0, 0, 0, 0]);
    const [urlExpiresAt, setUrlExpiresAt] = useState<number | null>(null);
    const [playbackSpeed, setPlaybackSpeed] = useState<number>(1.0);

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

                // Use backend-provided expiration time, or fallback to Date.now() + 1 hour
                if (response.url_expires_at) {
                    const expiresAt = new Date(response.url_expires_at).getTime();
                    setUrlExpiresAt(expiresAt);
                } else {
                    // Fallback: assume 1 hour from NOW (not created_at)
                    setUrlExpiresAt(Date.now() + 3600 * 1000);
                }

                console.log('Presigned URL refreshed successfully');
            }
        } catch (error) {
            console.error('Failed to refresh presigned URL:', error);
            throw error; // Propagate error for caller to handle
        }
    }, [existingRecording, sessionToken]);

    // Initialize with existing recording
    useEffect(() => {
        if (existingRecording) {
            setAudioUrl(existingRecording.presigned_url);
            setDuration(Math.round(existingRecording.duration_seconds));
            setState('stopped');

            // Use backend-provided expiration time if available
            if (existingRecording.url_expires_at) {
                const expiresAt = new Date(existingRecording.url_expires_at).getTime();
                setUrlExpiresAt(expiresAt);
            } else {
                // Fallback: assume URL is fresh (generated now), expires in 1 hour
                setUrlExpiresAt(Date.now() + 3600 * 1000);
            }
        }
    }, [existingRecording]);

    // Check URL expiration and refresh if needed (removed state restriction)
    useEffect(() => {
        if (!existingRecording || !urlExpiresAt) return;

        const checkExpiration = () => {
            const now = Date.now();
            const timeUntilExpiry = urlExpiresAt - now;

            // Refresh if expires soon (<5 min) OR already expired (up to 24h old)
            // This allows recovery from expired URLs when user returns after long absence
            if (timeUntilExpiry < 5 * 60 * 1000 && timeUntilExpiry > -24 * 60 * 60 * 1000) {
                refreshPresignedUrl().catch((error) => {
                    console.error('Background URL refresh failed:', error);
                });
            }
        };

        // Check immediately
        checkExpiration();

        // Check every minute
        const interval = setInterval(checkExpiration, 60 * 1000);

        return () => clearInterval(interval);
    }, [existingRecording, urlExpiresAt, refreshPresignedUrl]);

    // Handle visibility change and window focus (user returns after being away)
    useEffect(() => {
        if (!existingRecording || !urlExpiresAt) return;

        const handleVisibilityOrFocus = () => {
            // User returned - check if URL expired while they were away
            if (!document.hidden) {
                const now = Date.now();
                const timeUntilExpiry = urlExpiresAt - now;

                // If expired or expiring soon, refresh proactively
                if (timeUntilExpiry < 5 * 60 * 1000) {
                    refreshPresignedUrl().catch((error) => {
                        console.error('URL refresh on return failed:', error);
                    });
                }
            }
        };

        document.addEventListener('visibilitychange', handleVisibilityOrFocus);
        window.addEventListener('focus', handleVisibilityOrFocus);

        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityOrFocus);
            window.removeEventListener('focus', handleVisibilityOrFocus);
        };
    }, [existingRecording, urlExpiresAt, refreshPresignedUrl]);

    // Cleanup on unmount (fixed dependencies)
    useEffect(() => {
        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
            if (permissionCheckIntervalRef.current)
                clearInterval(permissionCheckIntervalRef.current);
            if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
            if (audioContextRef.current?.state !== 'closed') {
                audioContextRef.current?.close();
            }
            if (streamRef.current) {
                streamRef.current.getTracks().forEach((track) => {
                    track.stop();
                });
            }
            // Only revoke blob URLs (not presigned URLs)
            if (audioPlayerRef.current?.src?.startsWith('blob:')) {
                URL.revokeObjectURL(audioPlayerRef.current.src);
            }
        };
    }, []); // Empty deps - only run on mount/unmount

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

            // Handle MediaRecorder errors (e.g., codec issues, stream failures)
            mediaRecorder.onerror = (event) => {
                console.error('MediaRecorder error:', event);
                toast.error(t('audio.recording_error', 'Recording error - please try again'));
                stopRecording();
            };

            mediaRecorder.onstop = async () => {
                const blob = new Blob(audioChunksRef.current, { type: mimeType });

                // Validate blob before upload (prevent corrupt/empty audio)
                if (blob.size === 0 || blob.size < 100) {
                    console.error('Audio blob is empty or too small:', blob.size, 'bytes');
                    toast.error(
                        t('audio.invalid_recording', 'Recording failed - no audio data captured')
                    );
                    setState('idle');
                    setAudioUrl(null);
                    setDuration(0);

                    // Stop all tracks
                    stream.getTracks().forEach((track) => {
                        track.stop();
                    });
                    streamRef.current = null;
                    return; // Don't upload
                }

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

            // Monitor stream tracks for ended event (permission revoked or mic disconnected)
            stream.getTracks().forEach((track) => {
                track.onended = () => {
                    console.warn('Microphone track ended - permission may have been revoked');
                    toast.error(
                        t('audio.permission_revoked', 'Microphone access lost - recording stopped')
                    );
                    stopRecording();
                };
            });

            // Periodic permission check (Permissions API)
            // Check every 2 seconds during recording
            if ('permissions' in navigator) {
                permissionCheckIntervalRef.current = setInterval(async () => {
                    try {
                        const permissionStatus = await navigator.permissions.query({
                            name: 'microphone' as PermissionName,
                        });

                        if (permissionStatus.state === 'denied') {
                            console.warn('Microphone permission was revoked during recording');
                            toast.error(
                                t(
                                    'audio.permission_revoked',
                                    'Microphone access lost - recording stopped'
                                )
                            );
                            stopRecording();
                        }
                    } catch (error) {
                        // Permissions API not supported in some browsers (Safari)
                        // Rely on track.onended handler instead
                        console.debug('Permissions API check failed:', error);
                    }
                }, 2000);
            }

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
            if (permissionCheckIntervalRef.current) {
                clearInterval(permissionCheckIntervalRef.current);
                permissionCheckIntervalRef.current = null;
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

    const playRecording = async () => {
        if (!audioUrl) return;

        // Proactively check if URL might be expired before playing
        if (urlExpiresAt && Date.now() > urlExpiresAt - 60 * 1000) {
            try {
                await refreshPresignedUrl();
                // URL refreshed, audioUrl state will update and trigger re-render
                // Wait a tick for state update
                await new Promise((resolve) => setTimeout(resolve, 100));
            } catch (error) {
                console.error('Failed to refresh URL before playback:', error);
                toast.error(t('audio.refresh_failed', 'Failed to refresh audio URL'));
                return;
            }
        }

        const audio = new Audio(audioUrl);
        audioPlayerRef.current = audio;

        // Set playback speed
        audio.playbackRate = playbackSpeed;

        // Setup Web Audio API for playback waveform
        const audioContext = new AudioContext();
        const analyser = audioContext.createAnalyser();
        const source = audioContext.createMediaElementSource(audio);

        // Connect: source -> analyser -> destination (speakers)
        source.connect(analyser);
        analyser.connect(audioContext.destination);
        analyser.fftSize = 32;

        audioContextRef.current = audioContext;
        analyserRef.current = analyser;

        // Animate waveform during playback
        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        const updateWaveform = () => {
            if (analyserRef.current && state === 'playing') {
                analyserRef.current.getByteFrequencyData(dataArray);
                setAudioLevels(Array.from(dataArray.slice(0, 5)));
                animationFrameRef.current = requestAnimationFrame(updateWaveform);
            }
        };
        updateWaveform();

        // Error handler for expired URLs or network issues
        audio.onerror = async () => {
            console.error('Audio playback error - attempting URL refresh');

            // Try refreshing URL and retrying once
            if (existingRecording && sessionToken) {
                toast.info(t('audio.refreshing', 'Refreshing audio...'));
                try {
                    await refreshPresignedUrl();
                    // Retry playback with new URL (recursive call, but only once)
                    if (!audioUrl.startsWith('blob:')) {
                        playRecording();
                    }
                } catch {
                    toast.error(t('audio.playback_failed', 'Failed to play audio'));
                    setState('stopped');
                    setAudioLevels([0, 0, 0, 0, 0]);
                }
            } else {
                toast.error(t('audio.playback_failed', 'Failed to play audio'));
                setState('stopped');
                setAudioLevels([0, 0, 0, 0, 0]);
            }
        };

        audio.onended = () => {
            setState('stopped');
            setAudioLevels([0, 0, 0, 0, 0]);

            // Cleanup Web Audio API
            if (animationFrameRef.current) {
                cancelAnimationFrame(animationFrameRef.current);
                animationFrameRef.current = null;
            }
            if (audioContextRef.current) {
                audioContextRef.current.close();
                audioContextRef.current = null;
            }
        };

        audio.play();
        setState('playing');
    };

    const pausePlayback = () => {
        if (audioPlayerRef.current) {
            audioPlayerRef.current.pause();
            setState('stopped');
            setAudioLevels([0, 0, 0, 0, 0]);

            // Stop waveform animation
            if (animationFrameRef.current) {
                cancelAnimationFrame(animationFrameRef.current);
                animationFrameRef.current = null;
            }
            if (audioContextRef.current) {
                audioContextRef.current.close();
                audioContextRef.current = null;
            }
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

                {/* Waveform Visualization during recording and playback */}
                {state === 'recording' || state === 'playing' ? (
                    <div className="flex items-center justify-center gap-1 h-12 bg-slate-100 rounded-md">
                        {audioLevels.map((level, i) => (
                            <div
                                key={i}
                                className={`w-1.5 rounded-full transition-all duration-100 ${
                                    state === 'recording' ? 'bg-red-500' : 'bg-blue-500'
                                }`}
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

                        {/* Playback Speed Control */}
                        <div className="flex items-center gap-1 border border-slate-300 rounded-md bg-white">
                            {[1.0, 1.5, 2.0].map((speed) => (
                                <Button
                                    key={speed}
                                    onClick={() => {
                                        setPlaybackSpeed(speed);
                                        // Update speed on current player if playing
                                        if (audioPlayerRef.current && state === 'playing') {
                                            audioPlayerRef.current.playbackRate = speed;
                                        }
                                    }}
                                    variant="ghost"
                                    size="sm"
                                    className={`px-2 py-1 h-auto text-xs font-medium ${
                                        playbackSpeed === speed
                                            ? 'bg-slate-100 text-slate-900'
                                            : 'text-slate-600 hover:text-slate-900'
                                    }`}
                                >
                                    {speed}x
                                </Button>
                            ))}
                        </div>

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
