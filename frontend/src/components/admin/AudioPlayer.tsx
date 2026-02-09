import { useState, useRef, useEffect } from 'react';
import { Play, Pause, Download, Volume2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTranslation } from 'react-i18next';

interface AudioPlayerProps {
    url: string;
    duration?: number;
    fileName?: string;
}

/**
 * Simple audio player for reviewing participant audio responses.
 * Read-only component with play/pause and download functionality.
 */
export function AudioPlayer({ url, duration, fileName = 'audio.webm' }: AudioPlayerProps) {
    const { t } = useTranslation();
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [audioDuration, setAudioDuration] = useState(duration || 0);
    const audioRef = useRef<HTMLAudioElement | null>(null);

    useEffect(() => {
        const audio = audioRef.current;
        if (!audio) return;

        const handleTimeUpdate = () => {
            setCurrentTime(audio.currentTime);
        };

        const handleLoadedMetadata = () => {
            setAudioDuration(audio.duration);
        };

        const handleEnded = () => {
            setIsPlaying(false);
            setCurrentTime(0);
        };

        audio.addEventListener('timeupdate', handleTimeUpdate);
        audio.addEventListener('loadedmetadata', handleLoadedMetadata);
        audio.addEventListener('ended', handleEnded);

        return () => {
            audio.removeEventListener('timeupdate', handleTimeUpdate);
            audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
            audio.removeEventListener('ended', handleEnded);
        };
    }, []);

    const togglePlay = () => {
        const audio = audioRef.current;
        if (!audio) return;

        if (isPlaying) {
            audio.pause();
        } else {
            audio.play();
        }
        setIsPlaying(!isPlaying);
    };

    const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
        const audio = audioRef.current;
        if (!audio) return;

        const newTime = Number.parseFloat(e.target.value);
        audio.currentTime = newTime;
        setCurrentTime(newTime);
    };

    const handleDownload = () => {
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        a.click();
    };

    const formatTime = (seconds: number): string => {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    return (
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-3">
            {/* Hidden audio element */}
            {/* biome-ignore lint/a11y/useMediaCaption: admin playback of participant audio responses */}
            <audio ref={audioRef} src={url} preload="metadata" />

            {/* Player Controls */}
            <div className="flex items-center gap-3">
                <Button
                    onClick={togglePlay}
                    size="sm"
                    variant="ghost"
                    className="h-10 w-10 rounded-full bg-indigo-100 hover:bg-indigo-200 text-indigo-700"
                >
                    {isPlaying ? (
                        <Pause className="w-4 h-4" />
                    ) : (
                        <Play className="w-4 h-4 ml-0.5" />
                    )}
                </Button>

                <div className="flex-1">
                    <div className="flex items-center justify-between text-xs text-slate-600 mb-1">
                        <span>{formatTime(currentTime)}</span>
                        <span>{formatTime(audioDuration)}</span>
                    </div>
                    <input
                        type="range"
                        min="0"
                        max={audioDuration || 0}
                        value={currentTime}
                        onChange={handleSeek}
                        className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                    />
                </div>

                <Button
                    onClick={handleDownload}
                    size="sm"
                    variant="ghost"
                    className="h-8 w-8 text-slate-600 hover:text-indigo-700"
                    title={t('admin.audio.download', 'Download audio')}
                >
                    <Download className="w-4 h-4" />
                </Button>
            </div>

            {/* Audio Info */}
            <div className="flex items-center gap-2 text-xs text-slate-500">
                <Volume2 className="w-3 h-3" />
                <span>
                    {t('admin.audio.recording', 'Audio recording')}
                    {duration && ` • ${Math.round(duration)}s`}
                </span>
            </div>
        </div>
    );
}
