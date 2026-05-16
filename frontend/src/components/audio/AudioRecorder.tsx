import type React from 'react';
import { AudioLines, Square, Play, Pause, Trash2, Loader2, Check, X } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { useTranslation } from 'react-i18next';
import {
    useAudioRecorder,
    type RecorderState,
    type AudioRecorderProps,
} from '@/hooks/participant/useAudioRecorder';

export type { RecorderState, AudioRecorderProps };

export const AudioRecorder: React.FC<AudioRecorderProps> = (props) => {
    const { t } = useTranslation();

    const {
        status: { state, uploadStatus },
        recording: { duration, start: startRecording, stop: stopRecording },
        playback: {
            playbackSpeed,
            setPlaybackSpeed,
            playbackPosition,
            play: playRecording,
            pause: pausePlayback,
        },
        upload: { retry: retryUpload, delete: deleteRecording },
        waveform: { audioLevels },
        dom: { containerRef },
        ui: {
            formatTime,
            maxDurationSeconds,
            disabled,
            existingRecording,
            playbackRetryRef,
            audioPlayerRef,
        },
    } = useAudioRecorder(props);

    return (
        <div ref={containerRef}>
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
                    <span>{t('audio.record_prompt', 'Record audio response if you prefer')}</span>
                </button>
            )}

            {/* Recording: horizontal bar */}
            {state === 'recording' && (
                <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-red-200 bg-red-50/30">
                    <button
                        type="button"
                        onClick={stopRecording}
                        aria-label={t('audio.stop', 'Stop')}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500 text-white hover:bg-red-600 transition-colors shrink-0 shadow-sm text-xs font-medium"
                    >
                        <Square className="w-3 h-3" fill="currentColor" strokeWidth={0} />
                        {t('audio.stop', 'Stop')}
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
                    <div className="flex flex-wrap items-center gap-2 px-3 py-2.5 rounded-xl border border-slate-200 bg-white shadow-sm">
                        <button
                            type="button"
                            onClick={
                                state === 'playing'
                                    ? pausePlayback
                                    : () => {
                                          playbackRetryRef.current = false;
                                          playRecording();
                                      }
                            }
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

                        <span className="text-xs font-mono text-slate-400 shrink-0 tabular-nums">
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
                                    className={`px-2 py-1 text-xs font-medium transition-colors ${
                                        playbackSpeed === speed
                                            ? 'bg-slate-100 text-slate-800'
                                            : 'text-slate-400 hover:text-slate-600'
                                    }`}
                                >
                                    {speed}x
                                </button>
                            ))}
                        </div>

                        {/* Upload status indicator */}
                        {uploadStatus === 'uploading' && (
                            <Loader2
                                className="w-3.5 h-3.5 animate-spin text-slate-400 shrink-0"
                                aria-label={t('audio.uploading', 'Uploading...')}
                            />
                        )}
                        {uploadStatus === 'success' && (
                            <Check
                                className="w-3.5 h-3.5 text-emerald-500 shrink-0"
                                aria-label={t('audio.upload_success', 'Uploaded')}
                            />
                        )}
                        {uploadStatus === 'failed' && (
                            <button
                                type="button"
                                onClick={retryUpload}
                                aria-label={t('audio.retry_upload', 'Retry upload')}
                                className="p-1 rounded-lg text-red-500 hover:bg-red-50 transition-colors shrink-0"
                            >
                                <X className="w-3.5 h-3.5" />
                            </button>
                        )}

                        <button
                            type="button"
                            onClick={deleteRecording}
                            aria-label={t('audio.delete', 'Delete')}
                            className="p-1.5 rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-500 transition-colors shrink-0"
                        >
                            <Trash2 className="w-3.5 h-3.5" />
                        </button>
                    </div>

                    {existingRecording && (
                        <p className="text-2xs text-slate-400 text-right px-1">
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
