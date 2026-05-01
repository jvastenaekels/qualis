import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Upload, AlertCircle, CheckCircle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useDropzone } from 'react-dropzone';

import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';

import { formatBackendError } from '@/utils/i18nHelpers';
import { AdminService } from '@/api/admin';
import { cn } from '@/lib/utils';

interface ImportStudyDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    projectSlug: string;
}

type Step = 'upload' | 'validate' | 'creating';

interface ValidationResult {
    valid: boolean;
    errors: string[];
    warnings: string[];
    summary: {
        title: string;
        languages: string[];
        statement_count: number;
        grid_range: string;
        has_presort: boolean;
        has_postsort: boolean;
    };
}

/**
 * Dialog component for importing study configurations
 */
export function ImportStudyDialog({ open, onOpenChange, projectSlug }: ImportStudyDialogProps) {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const queryClient = useQueryClient();

    const [step, setStep] = useState<Step>('upload');
    const [config, setConfig] = useState<unknown>(null);
    const [validation, setValidation] = useState<ValidationResult | null>(null);
    const [newSlug, setNewSlug] = useState('');
    const [uploadMethod, setUploadMethod] = useState<'file' | 'paste'>('file');
    const [pastedJson, setPastedJson] = useState('');

    // Validate configuration - defined first so it can be used in onDrop
    const handleConfigLoaded = useCallback(
        async (configData: unknown) => {
            try {
                setStep('validate');
                setConfig(configData);

                // biome-ignore lint/suspicious/noExplicitAny: config is parsed from JSON and needs runtime validation
                const result = await AdminService.validateStudyImport(configData as any);
                setValidation(result.data);

                // Suggest a slug based on original
                const originalSlug =
                    (configData as { study?: { slug?: string } })?.study?.slug || 'imported-study';
                const timestamp = Date.now().toString().slice(-6);
                setNewSlug(`${originalSlug}-${timestamp}`);
            } catch (error: unknown) {
                const errorMsg = error instanceof Error ? error.message : 'Unknown error';
                toast.error(t('admin.import.validation_failed', 'Configuration is invalid'), {
                    description: errorMsg,
                });
                setStep('upload');
            }
        },
        [t]
    );

    // File dropzone handler
    const onDrop = useCallback(
        (acceptedFiles: File[]) => {
            const file = acceptedFiles[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = async (e) => {
                try {
                    const json = JSON.parse(e.target?.result as string);
                    await handleConfigLoaded(json);
                } catch (error: unknown) {
                    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
                    toast.error(t('admin.import.invalid_json', 'Invalid JSON file'), {
                        description: errorMsg,
                    });
                }
            };
            reader.readAsText(file);
        },
        [handleConfigLoaded, t]
    );

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop,
        accept: { 'application/json': ['.json'] },
        multiple: false,
    });

    // Handle pasted JSON
    const handlePasteSubmit = async () => {
        try {
            const json = JSON.parse(pastedJson);
            await handleConfigLoaded(json);
        } catch (error: unknown) {
            const errorMsg = error instanceof Error ? error.message : 'Unknown error';
            toast.error(t('admin.import.invalid_json', 'Invalid JSON'), {
                description: errorMsg,
            });
        }
    };

    // Create study from config
    const handleImport = async () => {
        if (!validation?.valid || !newSlug) return;

        try {
            setStep('creating');

            const result = await AdminService.importStudyConfig({
                config,
                new_slug: newSlug,
            });

            toast.success(t('admin.import.success', 'Study imported successfully'), {
                description: t('admin.import.redirecting', 'Opening study designer...'),
            });

            // Invalidate studies query
            queryClient.invalidateQueries({ queryKey: ['studies'] });

            // Close dialog and navigate
            onOpenChange(false);
            navigate(`/app/${projectSlug}/studies/${result.data.slug}/design`);
        } catch (error: unknown) {
            const errorMsg = error instanceof Error ? error.message : 'Unknown error';
            toast.error(
                t('admin.import.failed', 'Could not import study. See details below and retry.'),
                {
                    description: typeof errorMsg === 'string' ? errorMsg : 'Unknown error',
                }
            );
            setStep('validate');
        }
    };

    // Reset on close
    const handleClose = () => {
        setStep('upload');
        setConfig(null);
        setValidation(null);
        setNewSlug('');
        setPastedJson('');
        onOpenChange(false);
    };

    return (
        <Dialog open={open} onOpenChange={handleClose}>
            <DialogContent className="sm:max-w-[600px]">
                <DialogHeader>
                    <DialogTitle>
                        {t('admin.import.title', 'Import Study Configuration')}
                    </DialogTitle>
                    <DialogDescription>
                        {step === 'upload' &&
                            t(
                                'admin.import.upload_desc',
                                'Upload a previously exported study configuration file'
                            )}
                        {step === 'validate' &&
                            t(
                                'admin.import.validate_desc',
                                'Review configuration and provide a unique slug'
                            )}
                        {step === 'creating' &&
                            t('admin.import.creating_desc', 'Creating study...')}
                    </DialogDescription>
                </DialogHeader>

                {/* Step 1: Upload */}
                {step === 'upload' && (
                    <div className="space-y-4">
                        <Tabs
                            value={uploadMethod}
                            onValueChange={(v) => setUploadMethod(v as 'file' | 'paste')}
                        >
                            <TabsList className="grid w-full grid-cols-2">
                                <TabsTrigger value="file">
                                    {t('admin.import.file_upload', 'File Upload')}
                                </TabsTrigger>
                                <TabsTrigger value="paste">
                                    {t('admin.import.paste_json', 'Paste JSON')}
                                </TabsTrigger>
                            </TabsList>

                            <TabsContent value="file" className="mt-4">
                                <div
                                    {...getRootProps()}
                                    className={cn(
                                        'border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-colors',
                                        isDragActive
                                            ? 'border-indigo-600 bg-indigo-50'
                                            : 'border-gray-300 hover:border-indigo-400'
                                    )}
                                >
                                    <input {...getInputProps()} />
                                    <Upload className="h-12 w-12 mx-auto mb-4 text-gray-400" />
                                    <p className="text-sm font-medium text-gray-700 mb-1">
                                        {isDragActive
                                            ? t('admin.import.drop_here', 'Drop file here')
                                            : t(
                                                  'admin.import.drag_drop',
                                                  'Drag & drop JSON file or click to browse'
                                              )}
                                    </p>
                                    <p className="text-xs text-gray-500">
                                        {t('admin.import.supported', 'Supported format: .json')}
                                    </p>
                                </div>
                            </TabsContent>

                            <TabsContent value="paste" className="mt-4 space-y-4">
                                <div>
                                    <Label htmlFor="json-paste">
                                        {t('admin.import.paste_label', 'Paste JSON configuration')}
                                    </Label>
                                    <Textarea
                                        id="json-paste"
                                        placeholder='{"version": "1.0", "study": {...}}'
                                        value={pastedJson}
                                        onChange={(e) => setPastedJson(e.target.value)}
                                        className="font-mono text-xs h-64 mt-2"
                                    />
                                </div>
                                <Button onClick={handlePasteSubmit} className="w-full">
                                    {t('admin.import.validate', 'Validate & Continue')}
                                </Button>
                            </TabsContent>
                        </Tabs>
                    </div>
                )}

                {/* Step 2: Validation & Preview */}
                {step === 'validate' && validation && (
                    <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2">
                        {/* Validation Status */}
                        {validation.valid ? (
                            <Alert className="border-green-200 bg-green-50">
                                <CheckCircle className="h-4 w-4 text-green-600" />
                                <AlertDescription className="text-green-800">
                                    {t('admin.import.valid', 'Configuration is valid')}
                                </AlertDescription>
                            </Alert>
                        ) : (
                            <Alert variant="destructive">
                                <AlertCircle className="h-4 w-4" />
                                <AlertDescription>
                                    {t('admin.import.invalid', 'Configuration has errors')}
                                </AlertDescription>
                            </Alert>
                        )}

                        {/* Errors */}
                        {validation.errors.length > 0 && (
                            <div className="space-y-2">
                                <Label className="text-red-600 font-semibold">
                                    {t('admin.import.errors', 'Errors')}:
                                </Label>
                                <ul className="text-sm space-y-1">
                                    {validation.errors.map((error, i) => (
                                        <li key={i} className="text-red-600 flex items-start gap-2">
                                            <span className="mt-1">•</span>
                                            <span>{formatBackendError(error, t)}</span>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}

                        {/* Warnings */}
                        {validation.warnings.length > 0 && (
                            <div className="space-y-2">
                                <Label className="text-amber-600 font-semibold">
                                    {t('admin.import.warnings', 'Warnings')}:
                                </Label>
                                <ul className="text-sm space-y-1">
                                    {validation.warnings.map((warning, i) => (
                                        <li
                                            key={i}
                                            className="text-amber-600 flex items-start gap-2"
                                        >
                                            <span className="mt-1">⚠</span>
                                            <span>{formatBackendError(warning, t)}</span>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}

                        {/* Summary */}
                        {validation.valid && validation.summary && (
                            <>
                                <div className="space-y-3 p-4 bg-gray-50 rounded-lg border">
                                    <h4 className="font-semibold text-sm">
                                        {t('admin.import.summary', 'Study Summary')}
                                    </h4>
                                    <dl className="grid grid-cols-2 gap-3 text-sm">
                                        <div>
                                            <dt className="text-gray-500 text-xs">
                                                {t('admin.import.title_field', 'Title')}
                                            </dt>
                                            <dd className="font-medium mt-1">
                                                {validation.summary.title}
                                            </dd>
                                        </div>
                                        <div>
                                            <dt className="text-gray-500 text-xs">
                                                {t('admin.import.languages', 'Languages')}
                                            </dt>
                                            <dd className="font-medium mt-1 flex gap-1 flex-wrap">
                                                {validation.summary.languages.map((lang) => (
                                                    <Badge
                                                        key={lang}
                                                        variant="secondary"
                                                        className="text-xs"
                                                    >
                                                        {lang}
                                                    </Badge>
                                                ))}
                                            </dd>
                                        </div>
                                        <div>
                                            <dt className="text-gray-500 text-xs">
                                                {t('admin.import.statements', 'Statements')}
                                            </dt>
                                            <dd className="font-medium mt-1">
                                                {validation.summary.statement_count}
                                            </dd>
                                        </div>
                                        <div>
                                            <dt className="text-gray-500 text-xs">
                                                {t('admin.import.grid', 'Grid Range')}
                                            </dt>
                                            <dd className="font-medium mt-1">
                                                {validation.summary.grid_range}
                                            </dd>
                                        </div>
                                    </dl>
                                </div>

                                <div className="space-y-2 pb-2">
                                    <Label htmlFor="new-slug">
                                        {t('admin.import.new_slug', 'New Study Slug')}{' '}
                                        <span className="text-red-500">*</span>
                                    </Label>
                                    <Input
                                        id="new-slug"
                                        value={newSlug}
                                        onChange={(e) => setNewSlug(e.target.value.toLowerCase())}
                                        placeholder="my-study"
                                        pattern="[a-z0-9-]{3,100}"
                                    />
                                    <p className="text-xs text-gray-500">
                                        {t(
                                            'admin.import.slug_help',
                                            'Must be unique, 3-100 characters, lowercase letters, numbers, and hyphens only'
                                        )}
                                    </p>
                                </div>
                            </>
                        )}
                    </div>
                )}

                {/* Step 3: Creating */}
                {step === 'creating' && (
                    <div className="flex flex-col items-center justify-center py-12 space-y-4">
                        <Loader2 className="h-12 w-12 animate-spin text-indigo-600" />
                        <p className="text-sm text-gray-600">
                            {t('admin.import.creating', 'Creating study from configuration...')}
                        </p>
                    </div>
                )}

                <DialogFooter>
                    {step === 'upload' && (
                        <Button variant="ghost" onClick={handleClose}>
                            {t('common.cancel', 'Cancel')}
                        </Button>
                    )}
                    {step === 'validate' && (
                        <>
                            <Button variant="ghost" onClick={() => setStep('upload')}>
                                {t('common.back', 'Back')}
                            </Button>
                            <Button
                                onClick={handleImport}
                                disabled={!validation?.valid || !newSlug}
                            >
                                {t('admin.import.create_study', 'Create Study')}
                            </Button>
                        </>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
