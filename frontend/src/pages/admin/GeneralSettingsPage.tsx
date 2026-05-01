import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Label } from '@/components/ui/label';
import { StudyPageHeader } from '@/components/admin/layout/StudyPageHeader';
import { useTranslation } from 'react-i18next';
import { useLoaderData, useNavigate, useParams, useRevalidator } from 'react-router-dom';
import { useAdminContext } from '@/hooks/useAdminContext';
import { useAdminStore } from '@/store/useAdminStore';
import { useQueryClient } from '@tanstack/react-query';
import {
    getListStudiesApiAdminStudiesGetQueryKey,
    getGetStudyApiAdminStudiesSlugGetQueryKey,
} from '@/api/generated';
import {
    Card,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { useAuthStore } from '@/store/useAuthStore';
import type { StorageUsageResponse, StudyRead, StudyUpdate } from '@/api/model';
import { AdminService } from '@/api/admin';
import { parseApiErrorSync } from '@/lib/error-utils';
import {
    Loader2,
    Archive,
    Trash2,
    Save,
    ShieldAlert,
    Settings,
    HardDrive,
    AlertTriangle,
    Clock,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { getStudyStorageUsageApiAdminStudiesSlugStorageUsageGet } from '@/api/generated';
import { Progress } from '@/components/ui/progress';

export default function GeneralSettingsPage() {
    const navigate = useNavigate();
    const { study: initialStudy, slug: initialSlug } = useLoaderData() as {
        study: StudyRead;
        slug: string;
    };
    const { projectSlug: paramProjectSlug } = useParams<{
        projectSlug?: string;
        studySlug?: string;
    }>();
    const { project: currentWorkspace } = useAdminContext();
    const { user } = useAuthStore();
    const projectSlug = paramProjectSlug || currentWorkspace?.slug;
    const { t } = useTranslation();
    const queryClient = useQueryClient();
    const revalidator = useRevalidator();
    const [quotaMb, setQuotaMb] = useState<number | null>(null);
    const [isSavingQuota, setIsSavingQuota] = useState(false);
    const [retentionMonths, setRetentionMonths] = useState<number | ''>(
        initialStudy.data_retention_months ?? ''
    );
    const [isSavingRetention, setIsSavingRetention] = useState(false);
    const [deleteOpen, setDeleteOpen] = useState(false);
    const [typedSlug, setTypedSlug] = useState('');

    const study = initialStudy;
    const slug = initialSlug;

    const handleArchive = async () => {
        if (!study || !slug) return;
        try {
            await AdminService.updateStudyState(slug, 'archived');
            toast.success(t('admin.settings.archive_success'), {
                description: t('admin.settings.archive_success_desc'),
            });

            // Invalidate queries
            await queryClient.invalidateQueries({
                queryKey: getListStudiesApiAdminStudiesGetQueryKey(),
            });
            await queryClient.invalidateQueries({
                queryKey: getGetStudyApiAdminStudiesSlugGetQueryKey(slug),
            });

            navigate('.', { replace: true });
        } catch (error) {
            const message = parseApiErrorSync(
                error,
                t(
                    'admin.settings.archive_error',
                    'Could not archive study. Make sure the study is closed first.'
                )
            );
            toast.error(
                t(
                    'admin.settings.archive_error',
                    'Could not archive study. Make sure the study is closed first.'
                ),
                {
                    description: message,
                }
            );
        }
    };
    const handleDelete = async () => {
        if (!study || !slug) return;
        try {
            await AdminService.deleteStudy(slug);
            useAdminStore.getState().setActiveStudy(null);
            await queryClient.invalidateQueries({
                queryKey: getListStudiesApiAdminStudiesGetQueryKey(),
            });
            toast.success(t('admin.settings.delete_success'), {
                description: t('admin.settings.delete_success_desc'),
            });
            const targetHome = projectSlug
                ? `/app/${projectSlug}/dashboard`
                : `/app/${currentWorkspace?.slug}/dashboard`;
            navigate(targetHome);
        } catch (error) {
            const message = parseApiErrorSync(
                error,
                t(
                    'admin.settings.delete_error',
                    'Could not delete study. Make sure all data has been cleared first.'
                )
            );
            toast.error(
                t(
                    'admin.settings.delete_error',
                    'Could not delete study. Make sure all data has been cleared first.'
                ),
                { description: message }
            );
        } finally {
            setDeleteOpen(false);
            setTypedSlug('');
        }
    };

    const handleSaveRetention = async () => {
        if (!slug) return;
        const parsed = retentionMonths === '' ? null : Number(retentionMonths);
        if (parsed !== null && (!Number.isInteger(parsed) || parsed < 1 || parsed > 240)) {
            toast.error(
                t(
                    'admin.settings.retention.range_error',
                    'Retention must be an integer between 1 and 240 months.'
                )
            );
            return;
        }
        setIsSavingRetention(true);
        try {
            await AdminService.updateStudy(slug, {
                data_retention_months: parsed,
            } as unknown as StudyUpdate);
            toast.success(
                t('admin.settings.retention.save_success', 'Data retention policy updated')
            );
            await queryClient.invalidateQueries({
                queryKey: getGetStudyApiAdminStudiesSlugGetQueryKey(slug),
            });
            revalidator.revalidate();
        } catch (error) {
            const message = parseApiErrorSync(
                error,
                t('admin.settings.retention.save_error', 'Failed to update data retention policy')
            );
            toast.error(
                t('admin.settings.retention.save_error', 'Failed to update data retention policy'),
                { description: message }
            );
        } finally {
            setIsSavingRetention(false);
        }
    };

    const handleSaveQuota = async () => {
        if (!slug || quotaMb === null) return;
        setIsSavingQuota(true);
        try {
            const currentConfig = (study?.postsort_config ?? {}) as Record<string, unknown>;
            const currentAudio = (currentConfig.audio ?? {}) as Record<string, unknown>;
            const updatedConfig = {
                ...currentConfig,
                audio: { ...currentAudio, max_storage_mb: quotaMb },
            };
            await AdminService.updateStudy(slug, {
                postsort_config: updatedConfig,
            } as unknown as StudyUpdate);
            toast.success(t('admin.settings.storage.save_success', 'Storage quota updated'));
            await queryClient.invalidateQueries({ queryKey: ['storage-usage', slug] });
            await queryClient.invalidateQueries({
                queryKey: getGetStudyApiAdminStudiesSlugGetQueryKey(slug),
            });
            revalidator.revalidate();
        } catch (error) {
            const message = parseApiErrorSync(
                error,
                t('admin.settings.storage.save_error', 'Could not update storage quota. Try again.')
            );
            toast.error(
                t(
                    'admin.settings.storage.save_error',
                    'Could not update storage quota. Try again.'
                ),
                {
                    description: message,
                }
            );
        } finally {
            setIsSavingQuota(false);
        }
    };

    const isClosed = study.state === 'closed';
    const isArchived = study.state === 'archived';

    // Check if audio is enabled for this study
    const audioConfig = (
        study?.postsort_config as { audio?: { enabled?: boolean; max_storage_mb?: number } }
    )?.audio;
    const isAudioEnabled = audioConfig?.enabled ?? false;
    const currentQuotaMb = audioConfig?.max_storage_mb ?? 100;

    // Fetch storage usage if audio is enabled
    const {
        data: storageUsage,
        isLoading: isLoadingStorage,
        error: storageError,
    } = useQuery<StorageUsageResponse>({
        queryKey: ['storage-usage', slug],
        queryFn: async () => {
            if (!slug) throw new Error('No slug');
            return await getStudyStorageUsageApiAdminStudiesSlugStorageUsageGet(slug);
        },
        enabled: !!slug && isAudioEnabled,
        refetchInterval: 30000, // Refresh every 30s
    });

    return (
        <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6 pt-2">
            <StudyPageHeader
                title={t('admin.settings.title')}
                description={t('admin.settings.description')}
                icon={Settings}
            />

            <div className="space-y-6 max-w-4xl">
                {/* Storage Usage Card - Only shown if audio is enabled */}
                {isAudioEnabled && (
                    <Card className="border-none shadow-sm bg-white rounded-2xl overflow-hidden">
                        <CardHeader className="border-b border-slate-50 pb-4">
                            <div className="flex items-center gap-2 mb-1">
                                <HardDrive className="h-5 w-5 text-indigo-500" />
                                <CardTitle className="text-lg font-black text-slate-900">
                                    {t('admin.settings.storage.title', 'Audio Storage Usage')}
                                </CardTitle>
                            </div>
                        </CardHeader>

                        <CardContent className="p-6">
                            {isLoadingStorage ? (
                                <div className="flex items-center justify-center py-8">
                                    <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
                                </div>
                            ) : storageError ? (
                                <Alert className="bg-red-50 border-red-200">
                                    <AlertTriangle className="h-4 w-4 text-red-600" />
                                    <AlertDescription className="text-red-800">
                                        {t(
                                            'admin.settings.storage.error',
                                            'Failed to load storage usage'
                                        )}
                                    </AlertDescription>
                                </Alert>
                            ) : storageUsage ? (
                                <div className="space-y-4">
                                    <div className="space-y-3">
                                        <div className="flex justify-between items-baseline">
                                            <span className="text-sm font-medium text-slate-700">
                                                {t('admin.settings.storage.used', 'Storage Used')}
                                            </span>
                                            <span className="text-2xl font-bold text-slate-900">
                                                {storageUsage.total_mb.toFixed(2)} MB
                                            </span>
                                        </div>

                                        <div className="flex justify-between items-baseline">
                                            <span className="text-sm text-slate-600">
                                                {t('admin.settings.storage.quota', 'Quota')}
                                            </span>
                                            <span className="text-sm font-medium text-slate-700">
                                                {storageUsage.quota_mb} MB
                                            </span>
                                        </div>

                                        <Progress
                                            value={storageUsage.usage_percent}
                                            className="h-3"
                                        />
                                    </div>

                                    {storageUsage.usage_percent > 80 && (
                                        <Alert className="bg-amber-50 border-amber-200">
                                            <AlertTriangle className="h-4 w-4 text-amber-600" />
                                            <AlertDescription className="text-amber-800 text-sm">
                                                {t(
                                                    'admin.settings.storage.warning_high_usage',
                                                    'Storage usage is high. Consider increasing the quota or removing old recordings.'
                                                )}
                                            </AlertDescription>
                                        </Alert>
                                    )}

                                    <div className="border-t border-slate-100 pt-4 space-y-2">
                                        <label
                                            htmlFor="storage-quota"
                                            className="text-2xs font-black text-slate-500 flex items-center gap-1.5"
                                        >
                                            <HardDrive className="w-3 h-3" />
                                            {t(
                                                'admin.settings.storage.quota_label',
                                                'Storage Quota'
                                            )}
                                        </label>
                                        <div className="flex items-center gap-3">
                                            <Input
                                                id="storage-quota"
                                                type="number"
                                                min={10}
                                                max={1000}
                                                step={10}
                                                value={quotaMb ?? currentQuotaMb}
                                                onChange={(e) => {
                                                    const value = Number(e.target.value);
                                                    if (value < 10 || value > 1000) return;
                                                    setQuotaMb(value);
                                                }}
                                                disabled={isArchived}
                                                className="w-32 h-11 rounded-xl bg-slate-50 border-slate-100 focus-visible:ring-indigo-500"
                                            />
                                            <span className="text-sm text-slate-600 font-medium">
                                                MB
                                            </span>
                                        </div>
                                        <p className="text-xs text-slate-500">
                                            {t(
                                                'admin.settings.storage.quota_help',
                                                'Maximum total audio storage for this study (10–1000 MB).'
                                            )}
                                        </p>
                                    </div>
                                </div>
                            ) : null}
                        </CardContent>
                        {storageUsage && quotaMb !== null && quotaMb !== currentQuotaMb && (
                            <CardFooter className="flex justify-end border-t border-slate-50 px-6 py-4">
                                <Button
                                    onClick={handleSaveQuota}
                                    disabled={isSavingQuota || isArchived}
                                    className="rounded-xl px-6 font-black bg-indigo-600 hover:bg-indigo-700 active:scale-[0.98] transition-all shadow-sm"
                                >
                                    {isSavingQuota ? (
                                        <Loader2 className="w-4 h-4 animate-spin mr-2" />
                                    ) : (
                                        <Save className="w-4 h-4 mr-2" />
                                    )}
                                    {t('admin.settings.save_button')}
                                </Button>
                            </CardFooter>
                        )}
                    </Card>
                )}

                {/* Data retention policy — drives the default cutoff
                    offered by the data-lifecycle anonymisation flow. */}
                <Card className="border-none shadow-sm bg-white rounded-2xl overflow-hidden">
                    <CardHeader className="border-b border-slate-50 pb-4">
                        <div className="flex items-center gap-2 mb-1">
                            <Clock className="h-5 w-5 text-indigo-500" />
                            <CardTitle className="text-lg font-black text-slate-900">
                                {t('admin.settings.retention.title', 'Data retention')}
                            </CardTitle>
                        </div>
                    </CardHeader>
                    <CardContent className="p-6 space-y-3">
                        <Label
                            htmlFor="retention-months"
                            className="text-2xs font-black text-slate-500"
                        >
                            {t('admin.settings.retention.months_label', 'Retention (months)')}
                        </Label>
                        <Input
                            id="retention-months"
                            type="number"
                            min={1}
                            max={240}
                            placeholder="12"
                            value={retentionMonths}
                            onChange={(e) => {
                                const v = e.target.value;
                                setRetentionMonths(v === '' ? '' : Number(v));
                            }}
                            disabled={isArchived || isSavingRetention}
                            className="h-11 rounded-xl max-w-xs"
                        />
                        <p className="text-xs text-slate-500">
                            {t(
                                'admin.settings.retention.help',
                                'Common values: 6, 12, 24, 60 months. Leave empty for system default (12).'
                            )}
                        </p>
                    </CardContent>
                    {(retentionMonths === '' ? null : Number(retentionMonths)) !==
                        (study.data_retention_months ?? null) && (
                        <CardFooter className="flex justify-end border-t border-slate-50 px-6 py-4">
                            <Button
                                onClick={handleSaveRetention}
                                disabled={isSavingRetention || isArchived}
                                className="rounded-xl px-6 font-black bg-indigo-600 hover:bg-indigo-700 active:scale-[0.98] transition-all shadow-sm"
                            >
                                {isSavingRetention ? (
                                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                                ) : (
                                    <Save className="w-4 h-4 mr-2" />
                                )}
                                {t('admin.settings.save_button')}
                            </Button>
                        </CardFooter>
                    )}
                </Card>

                {/* Archiving Section */}
                <Card className="border-none shadow-sm bg-white rounded-2xl overflow-hidden mt-8">
                    <CardHeader className="border-b border-slate-50 pb-4">
                        <div className="flex items-center gap-2 mb-1">
                            <Archive className="h-5 w-5 text-amber-500" />
                            <CardTitle className="text-lg font-black text-slate-900">
                                {t('admin.settings.lifecycle.title')}
                            </CardTitle>
                        </div>
                        <CardDescription className="text-sm font-medium text-slate-500">
                            {t('admin.settings.lifecycle.description')}
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="p-6">
                        <div className="bg-amber-50/50 p-4 rounded-2xl border border-amber-100 text-xs font-medium text-amber-800 flex items-start gap-3">
                            <ShieldAlert className="w-4 h-4 mt-0.5 shrink-0" />
                            <p>{t('admin.settings.lifecycle.notice')}</p>
                        </div>
                    </CardContent>
                    <CardFooter className="px-6 pb-6 pt-0 flex flex-col gap-3 items-start">
                        {isArchived ? (
                            <Alert className="bg-slate-100 border-slate-200">
                                <Archive className="h-4 w-4" />
                                <AlertTitle>
                                    {t('admin.settings.lifecycle.archived_status')}
                                </AlertTitle>
                                <AlertDescription>
                                    {t('admin.settings.lifecycle.description')}
                                </AlertDescription>
                            </Alert>
                        ) : (
                            <Button
                                variant="secondary"
                                disabled={!isClosed}
                                onClick={handleArchive}
                                className="w-full sm:w-auto rounded-xl font-black bg-amber-100 text-amber-700 hover:bg-amber-200 border-none shadow-sm"
                            >
                                <Archive className="w-4 h-4 mr-2" />
                                {t('admin.settings.lifecycle.archive_button')}
                            </Button>
                        )}
                    </CardFooter>
                </Card>

                {/* Danger Zone (Superuser Only) */}
                {user?.is_superuser && (
                    <Card className="border-none shadow-sm bg-white rounded-2xl overflow-hidden mt-8 border-l-4 border-l-red-500">
                        <CardHeader className="border-b border-slate-50 pb-4">
                            <div className="flex items-center gap-2 mb-1">
                                <Trash2 className="h-5 w-5 text-red-500" />
                                <CardTitle className="text-lg font-black text-red-600">
                                    {t('admin.settings.danger.title')}
                                </CardTitle>
                            </div>
                            <CardDescription className="text-sm font-medium text-red-400">
                                {t('admin.settings.danger.description')}
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="p-6">
                            <div className="bg-red-50/50 p-4 rounded-2xl border border-red-100 text-xs font-medium text-red-800 flex items-start gap-3">
                                <ShieldAlert className="w-4 h-4 mt-0.5 shrink-0" />
                                <p>{t('admin.settings.danger.notice')}</p>
                            </div>
                        </CardContent>
                        <CardFooter className="px-6 pb-6 pt-0 flex flex-col items-start gap-2">
                            <Button
                                variant="destructive"
                                disabled={!isArchived}
                                onClick={() => setDeleteOpen(true)}
                                className="w-full sm:w-auto rounded-xl font-black shadow-lg shadow-red-100 flex items-center gap-2 px-6"
                            >
                                <Trash2 size={16} />
                                {t('admin.settings.danger.delete_button')}
                            </Button>
                            {!isArchived && (
                                <p className="text-xs text-red-400/80 font-medium">
                                    * {t('admin.settings.danger.notice').split('. ').pop()}
                                </p>
                            )}
                        </CardFooter>
                    </Card>
                )}
            </div>

            <AlertDialog
                open={deleteOpen}
                onOpenChange={(open) => {
                    setDeleteOpen(open);
                    if (!open) setTypedSlug('');
                }}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            {t('admin.settings.danger.delete_dialog_title', 'Delete this study?')}
                        </AlertDialogTitle>
                        <AlertDialogDescription className="space-y-2 text-left">
                            <span className="block">
                                {t(
                                    'admin.settings.danger.delete_dialog_intro',
                                    'Permanently deletes sorts, audio, and analysis runs.'
                                )}
                            </span>
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <div className="space-y-2 px-1">
                        <Label
                            htmlFor="delete-typed-slug"
                            className="text-xs font-semibold text-slate-700"
                        >
                            {t(
                                'admin.settings.danger.delete_dialog_typed_label',
                                'Type the study slug to confirm'
                            )}
                        </Label>
                        <Input
                            id="delete-typed-slug"
                            value={typedSlug}
                            onChange={(e) => setTypedSlug(e.target.value)}
                            placeholder={slug}
                            autoComplete="off"
                            spellCheck={false}
                        />
                    </div>
                    <AlertDialogFooter>
                        <AlertDialogCancel>{t('common.cancel', 'Cancel')}</AlertDialogCancel>
                        <AlertDialogAction
                            disabled={typedSlug !== slug}
                            onClick={handleDelete}
                            className="bg-red-600 hover:bg-red-700"
                        >
                            {t('admin.settings.danger.delete_dialog_action', 'Delete permanently')}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
