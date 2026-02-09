import type React from 'react';
import { useState, useRef, useEffect } from 'react';
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
    } | null;
    disabled?: boolean;
}

type RecorderState = 'idle' | 'recording' | 'stopped' | 'playing' | 'uploading';

export const AudioRecorder: React.FC<AudioRecorderProps> = ({
    questionKey: _questionKey,
    maxDurationSeconds = 180,
    onRecordingComplete,
    onRecordingDeleted,
    existingRecording,
    disabled = false,
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

    // Initialize with existing recording
    useEffect(() => {
        if (existingRecording) {
            setAudioUrl(existingRecording.presigned_url);
            setDuration(Math.round(existingRecording.duration_seconds));
            setState('stopped');
        }
    }, [existingRecording]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
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

                setState('uploading');

                // Upload to backend
                try {
                    await onRecordingComplete(blob, duration);
                    setState('stopped');
                    toast.success(t('audio.upload_success', 'Audio uploaded successfully'));
                } catch (error) {
                    console.error('Upload failed:', error);
                    toast.error(t('audio.upload_failed', 'Upload failed'));
                    setState('idle');
                    setAudioUrl(null);
                    setDuration(0);
                }

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
                    <span className="text-sm font-medium text-slate-700">
                        {state === 'recording' && t('audio.recording', 'Recording...')}
                        {state === 'stopped' && t('audio.recorded', 'Recorded')}
                        {state === 'playing' && t('audio.playing', 'Playing...')}
                        {state === 'uploading' && t('audio.uploading', 'Uploading...')}
                        {state === 'idle' && t('audio.ready', 'Ready to record')}
                    </span>
                    <span className="text-sm font-mono text-slate-600">
                        {formatTime(duration)} / {formatTime(maxDurationSeconds)}
                    </span>
                </div>

                <Progress value={(duration / maxDurationSeconds) * 100} className="h-2" />
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
