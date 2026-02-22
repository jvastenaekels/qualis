import type React from 'react';
import { useState, useRef } from 'react';
import { Upload, Link as LinkIcon, X, Loader2 } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';

interface ImageUploadInputProps {
    value: string;
    onChange: (value: string) => void;
    label?: string;
    recommendedSize?: string;
    maxFileSize?: number; // in bytes, default 500KB
    id?: string;
    name?: string;
}

const ImageUploadInput: React.FC<ImageUploadInputProps> = ({
    value,
    onChange,
    label,
    recommendedSize = '200x50px',
    maxFileSize = 500 * 1024, // 500KB default
    id,
    name,
}) => {
    const { t } = useTranslation();
    const [mode, setMode] = useState<'url' | 'upload'>('url');
    const [isConverting, setIsConverting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isDragging, setIsDragging] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const isBase64 = value?.startsWith('data:image/');

    const convertToBase64 = (file: File): Promise<string> => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    };

    const handleFileSelect = async (file: File) => {
        setError(null);

        // Validate file type
        if (!file.type.match(/^image\/(png|jpe?g|svg\+xml)$/)) {
            setError(
                t(
                    'admin.design.theme.upload.invalid_type',
                    'Invalid file type. Use PNG, JPG, or SVG.'
                )
            );
            return;
        }

        // Validate file size
        if (file.size > maxFileSize) {
            const maxSizeKB = Math.round(maxFileSize / 1024);
            setError(
                t(
                    'admin.design.theme.upload.file_too_large',
                    `File too large. Maximum size: ${maxSizeKB}KB.`
                )
            );
            return;
        }

        setIsConverting(true);
        try {
            const base64 = await convertToBase64(file);
            onChange(base64);
        } catch (_err) {
            setError(t('admin.design.theme.upload.conversion_error', 'Failed to process image.'));
        } finally {
            setIsConverting(false);
        }
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        const file = e.dataTransfer.files[0];
        if (file) {
            handleFileSelect(file);
        }
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(true);
    };

    const handleDragLeave = () => {
        setIsDragging(false);
    };

    const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            handleFileSelect(file);
        }
    };

    const handleClear = () => {
        onChange('');
        setError(null);
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    return (
        <div className="space-y-3">
            {label && (
                <div className="flex items-center justify-between">
                    <Label htmlFor={id} className="text-[10px] font-black text-slate-500">
                        {label}
                    </Label>
                    {recommendedSize && (
                        <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-tighter">
                            {t('admin.design.theme.upload.recommended', 'Recommended')}:{' '}
                            {recommendedSize}
                        </span>
                    )}
                </div>
            )}

            {/* Mode Toggle */}
            <div className="flex gap-2 bg-slate-100 p-1 rounded-lg w-fit">
                <button
                    type="button"
                    onClick={() => setMode('url')}
                    className={cn(
                        'px-3 py-1.5 text-xs font-bold rounded-md transition-all flex items-center gap-1.5',
                        mode === 'url'
                            ? 'bg-white text-slate-900 shadow-sm'
                            : 'text-slate-500 hover:text-slate-700'
                    )}
                >
                    <LinkIcon className="h-3 w-3" />
                    URL
                </button>
                <button
                    type="button"
                    onClick={() => setMode('upload')}
                    className={cn(
                        'px-3 py-1.5 text-xs font-bold rounded-md transition-all flex items-center gap-1.5',
                        mode === 'upload'
                            ? 'bg-white text-slate-900 shadow-sm'
                            : 'text-slate-500 hover:text-slate-700'
                    )}
                >
                    <Upload className="h-3 w-3" />
                    {t('admin.design.theme.upload.upload', 'Upload')}
                </button>
            </div>

            {/* URL Mode */}
            {mode === 'url' && (
                <Input
                    id={id}
                    name={name}
                    value={isBase64 ? '' : value}
                    onChange={(e) => onChange(e.target.value)}
                    placeholder="https://example.com/logo.png"
                    className="font-medium text-sm rounded-xl h-10"
                />
            )}

            {/* Upload Mode */}
            {mode === 'upload' && (
                <div
                    onDrop={handleDrop}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    className={cn(
                        'border-2 border-dashed rounded-xl p-6 transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2',
                        isDragging
                            ? 'border-indigo-400 bg-indigo-50'
                            : 'border-slate-200 hover:border-indigo-300 hover:bg-slate-50'
                    )}
                    onClick={() => fileInputRef.current?.click()}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            fileInputRef.current?.click();
                        }
                    }}
                    tabIndex={0}
                    role="button"
                    aria-label={t(
                        'admin.design.theme.upload.drag_drop',
                        'Drag & drop or click to upload'
                    )}
                >
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/png,image/jpeg,image/jpg,image/svg+xml"
                        onChange={handleFileInputChange}
                        className="hidden"
                    />
                    <div className="flex flex-col items-center justify-center gap-2 text-center">
                        {isConverting ? (
                            <>
                                <Loader2 className="h-8 w-8 text-indigo-500 animate-spin" />
                                <p className="text-xs font-medium text-slate-600">
                                    {t(
                                        'admin.design.theme.upload.processing',
                                        'Processing image...'
                                    )}
                                </p>
                            </>
                        ) : (
                            <>
                                <Upload className="h-8 w-8 text-slate-400" />
                                <p className="text-sm font-medium text-slate-700">
                                    {t(
                                        'admin.design.theme.upload.drag_drop',
                                        'Drag & drop or click to upload'
                                    )}
                                </p>
                                <p className="text-xs text-slate-500">
                                    PNG, JPG, SVG • {t('admin.design.theme.upload.max', 'Max')}{' '}
                                    {Math.round(maxFileSize / 1024)}KB
                                </p>
                            </>
                        )}
                    </div>
                </div>
            )}

            {/* Error Message */}
            {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-2 text-xs text-red-700 font-medium">
                    {error}
                </div>
            )}

            {/* Image Preview */}
            {value && !error && (
                <div className="relative p-6 bg-white/50 border-2 border-dashed border-slate-200 rounded-2xl flex items-center justify-center transition-all hover:bg-white hover:border-indigo-300 group">
                    <img
                        src={value}
                        alt={label || 'Preview'}
                        className="max-h-16 object-contain drop-shadow-sm group-hover:scale-110 transition-transform duration-300"
                        onError={(e) => {
                            (e.target as HTMLImageElement).style.display = 'none';
                        }}
                    />
                    <button
                        type="button"
                        onClick={handleClear}
                        className="absolute top-2 right-2 p-1.5 bg-white rounded-full shadow-md text-slate-400 hover:text-red-500 hover:bg-red-50 transition-all"
                    >
                        <X className="h-3.5 w-3.5" />
                    </button>
                </div>
            )}
        </div>
    );
};

export default ImageUploadInput;
