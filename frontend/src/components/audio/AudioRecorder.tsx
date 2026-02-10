import type React from 'react';
import { useState, useRef, useEffect, useCallback } from 'react';
import { AudioLines, Square, Play, Pause, Trash2, Loader2, RefreshCw } from 'lucide-react';
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
    onError?: (
        type: 'mic_denied' | 'mic_revoked' | 'recorder_error' | 'empty_blob' | 'unsupported'
    ) => void;
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
    onError,
}) => {
    const { t } = useTranslation();

    const [state, setState] = useState<RecorderState>('idle');
    const stateRef = useRef<RecorderState>('idle');
    const [duration, setDuration] = useState(0);
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
    const [playbackPosition, setPlaybackPosition] = useState(0);
    const [uploadFailed, setUploadFailed] = useState(false);
    const pendingBlobRef = useRef<Blob | null>(null);
    const playbackRetryRef = useRef(false);
    const refreshFailCountRef = useRef(0);

    // Keep stateRef in sync so callbacks in stale closures read current state
    stateRef.current = state;

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
            if (
                timeUntilExpiry < 5 * 60 * 1000 &&
                timeUntilExpiry > -24 * 60 * 60 * 1000 &&
                refreshFailCountRef.current < 3
            ) {
                refreshPresignedUrl()
                    .then(() => {
                        refreshFailCountRef.current = 0;
                    })
                    .catch((error) => {
                        refreshFailCountRef.current += 1;
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
    // biome-ignore lint/correctness/useExhaustiveDependencies: functions use closure intentionally
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
        // Check browser support before attempting anything
        if (typeof MediaRecorder === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
            toast.error(
                t('audio.unsupported', 'Audio recording is not supported in this browser.')
            );
            onError?.('unsupported');
            return;
        }

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
                const mediaError = (event as { error?: DOMException }).error;
                const errorName = mediaError?.name || 'unknown';
                console.error('MediaRecorder error:', errorName, mediaError);

                let message: string;
                switch (errorName) {
                    case 'SecurityError':
                        message = t(
                            'audio.error.security',
                            'Recording blocked by browser security settings'
                        );
                        break;
                    case 'InvalidStateError':
                        message = t(
                            'audio.error.invalid_state',
                            'Recording encountered an internal error'
                        );
                        break;
                    default:
                        message = t('audio.recording_error', 'Recording error - please try again');
                }
                toast.error(message);
                onError?.('recorder_error');
                stopRecording();
            };

            mediaRecorder.onstop = async () => {
                const blob = new Blob(audioChunksRef.current, { type: mimeType });

                // Validate blob before upload (prevent empty audio)
                if (blob.size === 0) {
                    console.error('Audio blob is empty:', blob.size, 'bytes');
                    toast.error(
                        t('audio.invalid_recording', 'Recording failed - no audio data captured')
                    );
                    onError?.('empty_blob');
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

                const url = URL.createObjectURL(blob);
                setAudioUrl(url);
                pendingBlobRef.current = blob;

                // Immediately transition to stopped state (don't block UI)
                setState('stopped');

                // Upload in background
                onRecordingComplete(blob, duration)
                    .then(() => {
                        // Upload succeeded — clear pending blob
                        pendingBlobRef.current = null;
                        setUploadFailed(false);
                    })
                    .catch((error) => {
                        console.error('Upload failed:', error);
                        // Only show generic toast if parent didn't already show a specific one
                        // (ApiError instances with status >= 400 are handled by the parent)
                        if (!error?.status) {
                            toast.error(t('audio.upload_failed', 'Upload failed'));
                        }
                        // Keep blob URL and duration for retry — don't revert to idle
                        setState('stopped');
                        setUploadFailed(true);
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
            setUploadFailed(false);
            pendingBlobRef.current = null;

            // Monitor stream tracks for ended event (permission revoked or mic disconnected)
            stream.getTracks().forEach((track) => {
                track.onended = () => {
                    console.warn('Microphone track ended - permission may have been revoked');
                    toast.error(
                        t('audio.permission_revoked', 'Microphone access lost - recording stopped')
                    );
                    onError?.('mic_revoked');
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
            toast.error(
                t(
                    'audio.permission_denied_with_guidance',
                    'Microphone permission denied. Check your browser settings to allow microphone access, then try again.'
                )
            );
            onError?.('mic_denied');
        }
    };

    const stopRecording = () => {
        if (mediaRecorderRef.current && stateRef.current === 'recording') {
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
        playbackRetryRef.current = false;

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

        // Close any existing AudioContext from a previous playback that errored
        if (audioContextRef.current?.state !== 'closed') {
            audioContextRef.current?.close();
        }

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
            if (analyserRef.current && stateRef.current === 'playing') {
                analyserRef.current.getByteFrequencyData(dataArray);
                setAudioLevels(Array.from(dataArray.slice(0, 5)));
                animationFrameRef.current = requestAnimationFrame(updateWaveform);
            }
        };
        updateWaveform();

        // Error handler for expired URLs or network issues
        audio.onerror = async () => {
            console.error('Audio playback error - attempting URL refresh');

            // Try refreshing URL and retrying once (guard against infinite recursion)
            if (existingRecording && sessionToken && !playbackRetryRef.current) {
                playbackRetryRef.current = true;
                toast.info(t('audio.refreshing', 'Refreshing audio...'));
                try {
                    await refreshPresignedUrl();
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
            setPlaybackPosition(0);

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

        audio.ontimeupdate = () => {
            setPlaybackPosition(audio.currentTime);
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

    const retryUpload = async () => {
        if (!pendingBlobRef.current) return;
        setUploadFailed(false);
        setState('uploading');
        try {
            await onRecordingComplete(pendingBlobRef.current, duration);
            pendingBlobRef.current = null;
            toast.success(t('audio.upload_success', 'Audio uploaded successfully'));
        } catch (error) {
            console.error('Retry upload failed:', error);
            if (!(error as { status?: number })?.status) {
                toast.error(t('audio.upload_failed', 'Upload failed'));
            }
            setState('stopped');
            setUploadFailed(true);
        }
    };

    const deleteRecording = async () => {
        // Clear pending blob to prevent in-flight upload from storing stale metadata
        pendingBlobRef.current = null;

        if (timerRef.current) clearInterval(timerRef.current);
        if (animationFrameRef.current) {
            cancelAnimationFrame(animationFrameRef.current);
            animationFrameRef.current = null;
        }
        if (audioContextRef.current) {
            audioContextRef.current.close();
            audioContextRef.current = null;
        }

        // Save state for restoration on failure
        const savedAudioUrl = audioUrl;
        const savedDuration = duration;

        setState('uploading');

        try {
            await onRecordingDeleted();

            // Reset state
            if (audioUrl && !existingRecording) {
                URL.revokeObjectURL(audioUrl);
            }
            setAudioUrl(null);
            setDuration(0);
            setAudioLevels([0, 0, 0, 0, 0]);
            setState('idle');
            setUploadFailed(false);
            pendingBlobRef.current = null;

            toast.success(t('audio.deleted', 'Audio deleted'));
        } catch (error) {
            console.error('Delete failed:', error);
            toast.error(t('audio.delete_failed', 'Delete failed'));
            // Restore previous state
            setAudioUrl(savedAudioUrl);
            setDuration(savedDuration);
            setState('stopped');
        }
    };

    const formatTime = (seconds: number): string => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    return (
        <div>
            {/* Idle: subtle inline link */}
            {state === 'idle' && (
                <button
                    type="button"
                    onClick={startRecording}
                    disabled={disabled}
                    className="flex items-center gap-2.5 w-full p-3 rounded-xl border border-dashed border-slate-300 bg-slate-50/50 text-slate-600 font-medium hover:border-indigo-400 hover:text-indigo-600 hover:bg-indigo-50/50 hover:shadow-sm transition-all group disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                >
                    <div className="p-1.5 rounded-lg bg-white border border-slate-200 group-hover:border-indigo-200 group-hover:bg-indigo-50 transition-colors shadow-sm">
                        <AudioLines className="w-4 h-4 text-slate-500 group-hover:text-indigo-500" />
                    </div>
                    <span>{t('audio.record_prompt', 'Record audio response')}</span>
                </button>
            )}

            {/* Recording: horizontal bar */}
            {state === 'recording' && (
                <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-red-200 bg-red-50/30">
                    <button
                        type="button"
                        onClick={stopRecording}
                        aria-label={t('audio.stop', 'Stop')}
                        className="p-2 rounded-lg bg-red-500 text-white hover:bg-red-600 transition-colors shrink-0 shadow-sm"
                    >
                        <Square className="w-3.5 h-3.5" />
                    </button>
                    <span className="relative flex h-2 w-2 shrink-0">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
                    </span>
                    <div
                        className="flex items-center justify-center gap-[3px] h-8 flex-1"
                        role="img"
                        aria-label={t(
                            'audio.waveform.recording',
                            'Audio waveform - recording in progress'
                        )}
                    >
                        {audioLevels.map((level, i) => (
                            <div
                                key={i}
                                className="w-1 rounded-full bg-red-400/80 transition-all duration-100"
                                style={{
                                    height: `${Math.max(4, (level / 255) * 32)}px`,
                                }}
                            />
                        ))}
                    </div>
                    <span
                        className={`text-xs font-mono shrink-0 tabular-nums ${
                            maxDurationSeconds - duration <= 15
                                ? 'text-amber-600 font-bold animate-pulse'
                                : 'text-red-600/70'
                        }`}
                    >
                        {formatTime(duration)} / {formatTime(maxDurationSeconds)}
                    </span>
                </div>
            )}

            {/* Stopped / Playing: compact player bar */}
            {(state === 'stopped' || state === 'playing') && (
                <div className="space-y-1.5">
                    <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-slate-200 bg-white shadow-sm">
                        <button
                            type="button"
                            onClick={state === 'playing' ? pausePlayback : playRecording}
                            aria-label={
                                state === 'playing'
                                    ? t('audio.pause', 'Pause')
                                    : t('audio.play', 'Play')
                            }
                            className="p-1.5 rounded-lg bg-slate-100 text-slate-600 hover:bg-indigo-50 hover:text-indigo-600 transition-colors shrink-0"
                        >
                            {state === 'playing' ? (
                                <Pause className="w-4 h-4" />
                            ) : (
                                <Play className="w-4 h-4" />
                            )}
                        </button>

                        <div className="flex-1 min-w-0">
                            {state === 'playing' ? (
                                <div>
                                    <div
                                        className="flex items-center justify-center gap-[3px] h-6"
                                        role="img"
                                        aria-label={t(
                                            'audio.waveform.playing',
                                            'Audio waveform - playing back recording'
                                        )}
                                    >
                                        {audioLevels.map((level, i) => (
                                            <div
                                                key={i}
                                                className="w-1 rounded-full bg-indigo-400 transition-all duration-100"
                                                style={{
                                                    height: `${Math.max(3, (level / 255) * 24)}px`,
                                                }}
                                            />
                                        ))}
                                    </div>
                                    <Progress
                                        value={(playbackPosition / duration) * 100}
                                        className="h-1"
                                    />
                                </div>
                            ) : (
                                <Progress value={100} className="h-1" />
                            )}
                        </div>

                        <span className="text-[11px] font-mono text-slate-400 shrink-0 tabular-nums">
                            {state === 'playing'
                                ? `${formatTime(Math.floor(playbackPosition))} / ${formatTime(duration)}`
                                : formatTime(duration)}
                        </span>

                        <div className="flex items-center border border-slate-200 rounded-lg overflow-hidden shrink-0">
                            {[1.0, 1.5, 2.0].map((speed) => (
                                <button
                                    type="button"
                                    key={speed}
                                    onClick={() => {
                                        setPlaybackSpeed(speed);
                                        if (audioPlayerRef.current && state === 'playing') {
                                            audioPlayerRef.current.playbackRate = speed;
                                        }
                                    }}
                                    className={`px-1.5 py-0.5 text-[10px] font-medium transition-colors ${
                                        playbackSpeed === speed
                                            ? 'bg-slate-100 text-slate-800'
                                            : 'text-slate-400 hover:text-slate-600'
                                    }`}
                                >
                                    {speed}x
                                </button>
                            ))}
                        </div>

                        <button
                            type="button"
                            onClick={deleteRecording}
                            aria-label={t('audio.delete', 'Delete')}
                            className="p-1.5 rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-500 transition-colors shrink-0"
                        >
                            <Trash2 className="w-3.5 h-3.5" />
                        </button>
                    </div>

                    {uploadFailed && (
                        <div className="flex justify-center">
                            <Button
                                onClick={retryUpload}
                                size="sm"
                                variant="default"
                                className="h-7 text-xs gap-1.5"
                            >
                                <RefreshCw className="w-3 h-3" />
                                {t('audio.retry_upload', 'Retry upload')}
                            </Button>
                        </div>
                    )}

                    {existingRecording && (
                        <p className="text-[10px] text-slate-400 text-right px-1">
                            {(existingRecording.file_size_bytes / 1024).toFixed(1)} KB
                        </p>
                    )}
                </div>
            )}

            {/* Uploading */}
            {state === 'uploading' && (
                <div className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-slate-200 bg-white">
                    <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
                    <span className="text-sm text-slate-500 font-medium">
                        {t('audio.uploading', 'Uploading...')}
                    </span>
                </div>
            )}
        </div>
    );
};
