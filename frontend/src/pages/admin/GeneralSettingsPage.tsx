import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
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
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
    Card,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';
import {
    Form,
    FormControl,
    FormDescription,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { useAuthStore } from '@/store/useAuthStore';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import type { StudyRead, StudyUpdate } from '@/api/model';
import * as z from 'zod';
import { AdminService } from '@/api/admin';
import { parseApiErrorSync } from '@/lib/error-utils';
import {
    Loader2,
    Globe,
    Archive,
    Trash2,
    Save,
    Info,
    ShieldAlert,
    Settings,
    HardDrive,
    AlertTriangle,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { getStudyStorageUsageApiAdminStudiesSlugStorageUsageGet } from '@/api/generated';
import { Progress } from '@/components/ui/progress';

// Removing useAdminStudy as we use loader now

const studyFormSchema = z.object({
    slug: z
        .string()
        .min(3)
        .max(100)
        .regex(/^[a-z0-9-]+$/, 'Slug must be lowercase alphanumeric with hyphens'),
});

type StudyFormValues = z.infer<typeof studyFormSchema>;

// Storage usage response type
interface StorageUsageResponse {
    total_bytes: number;
    total_mb: number;
    file_count: number;
    quota_mb: number;
    quota_bytes: number;
    usage_percent: number;
}

export default function GeneralSettingsPage() {
    const navigate = useNavigate();
    const { study: initialStudy, slug: initialSlug } = useLoaderData() as {
        study: StudyRead;
        slug: string;
    };
    const { workspaceSlug: paramWorkspaceSlug } = useParams<{
        workspaceSlug?: string;
        studySlug?: string;
    }>();
    const { workspace: currentWorkspace } = useAdminContext();
    const { user } = useAuthStore();
    const workspaceSlug = paramWorkspaceSlug || currentWorkspace?.slug;
    const { t } = useTranslation();
    const queryClient = useQueryClient();
    const revalidator = useRevalidator();
    const [isResetDialogOpen, setIsResetDialogOpen] = useState(false);
    const [isResetLoading, setIsResetLoading] = useState(false);

    const study = initialStudy;
    const slug = initialSlug;

    const form = useForm<StudyFormValues>({
        resolver: zodResolver(studyFormSchema),
        defaultValues: {
            slug: study?.slug || '',
        },
    });

    // Initial reset is handled by defaultValues from loader data
    // but we keep keep it for when study updates via mutation if needed (though RR7 usually handles it)
    useEffect(() => {
        if (study) {
            form.reset({
                slug: study.slug || '',
            });
        }
    }, [study, form]);

    async function onSubmit(data: StudyFormValues) {
        if (!slug) return;
        try {
            await AdminService.updateStudy(slug, {
                slug: data.slug,
            } as unknown as StudyUpdate);

            toast.success(t('admin.settings.save_success'), {
                description: t('admin.settings.save_success_desc'),
            });

            // Invalidate queries to update sidebar and local data
            await queryClient.invalidateQueries({
                queryKey: getListStudiesApiAdminStudiesGetQueryKey(),
            });
            await queryClient.invalidateQueries({
                queryKey: getGetStudyApiAdminStudiesSlugGetQueryKey(slug),
            });

            if (data.slug !== slug) {
                const targetUrl = workspaceSlug
                    ? `/app/${workspaceSlug}/studies/${data.slug}/settings`
                    : `/app/${currentWorkspace?.slug}/studies/${data.slug}/settings`;
                navigate(targetUrl);
            } else {
                navigate('.', { replace: true });
            }
        } catch (error) {
            const message = parseApiErrorSync(error, t('admin.settings.save_error'));
            toast.error(t('admin.settings.save_error'), {
                description: message,
            });
        }
    }

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
            const message = parseApiErrorSync(error, t('admin.settings.archive_error'));
            toast.error(t('admin.settings.archive_error'), {
                description: message,
            });
        }
    };
    const handleResetParticipants = async () => {
        setIsResetLoading(true);
        try {
            await AdminService.resetStudyParticipants(slug);
            toast.success(
                t('admin.study_overview.reset_success', 'Participants reset successfully')
            );
            setIsResetDialogOpen(false);
            revalidator.revalidate();
        } catch (_error) {
            toast.error(t('admin.study_overview.reset_error', 'Failed to reset participants'));
        } finally {
            setIsResetLoading(false);
        }
    };

    const handleDelete = async () => {
        if (!study || !slug) return;
        if (!confirm(t('admin.settings.danger.delete_confirm'))) return;
        try {
            await AdminService.deleteStudy(slug);
            useAdminStore.getState().setActiveStudy(null);

            // Invalidate studies list query to remove deleted study from sidebar
            await queryClient.invalidateQueries({
                queryKey: getListStudiesApiAdminStudiesGetQueryKey(),
            });

            toast.success(t('admin.settings.delete_success'), {
                description: t('admin.settings.delete_success_desc'),
            });
            const targetHome = workspaceSlug
                ? `/app/${workspaceSlug}/dashboard`
                : `/app/${currentWorkspace?.slug}/dashboard`;
            navigate(targetHome);
        } catch (error) {
            const message = parseApiErrorSync(error, t('admin.settings.delete_error'));
            toast.error(t('admin.settings.delete_error'), {
                description: message,
            });
        }
    };

    const isClosed = study.state === 'closed';
    const isArchived = study.state === 'archived';

    // Check if audio is enabled for this study
    const audioConfig = (study?.postsort_config as { audio?: { enabled?: boolean } })?.audio;
    const isAudioEnabled = audioConfig?.enabled ?? false;

    // Fetch storage usage if audio is enabled
    const {
        data: storageUsage,
        isLoading: isLoadingStorage,
        error: storageError,
    } = useQuery<StorageUsageResponse>({
        queryKey: ['storage-usage', slug],
        queryFn: async () => {
            if (!slug) throw new Error('No slug');
            const response = await getStudyStorageUsageApiAdminStudiesSlugStorageUsageGet(slug);
            return response as StorageUsageResponse;
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
                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                        {/* Basic Information Card - Only URL Slug */}
                        <Card className="border-none shadow-sm bg-white rounded-2xl overflow-hidden">
                            <CardHeader className="border-b border-slate-50 pb-4">
                                <div className="flex items-center gap-2 mb-1">
                                    <Info className="h-5 w-5 text-indigo-500" />
                                    <CardTitle className="text-lg font-black text-slate-900">
                                        {t('admin.settings.basic.title')}
                                    </CardTitle>
                                </div>
                                <CardDescription className="text-sm font-medium text-slate-500">
                                    {t('admin.settings.basic.description')}
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="p-6">
                                {/* Slug */}
                                <FormField
                                    control={form.control}
                                    name="slug"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel className="text-[10px] font-black uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                                                <Globe className="w-3 h-3" />
                                                {t('admin.settings.basic.slug_label')}
                                            </FormLabel>
                                            <FormControl>
                                                <div className="relative">
                                                    <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-mono text-xs select-none">
                                                        /study/
                                                    </div>
                                                    <Input
                                                        {...field}
                                                        disabled={isArchived}
                                                        className="h-11 rounded-xl bg-slate-50 border-slate-100 pl-14 font-mono text-xs focus-visible:ring-indigo-500"
                                                    />
                                                </div>
                                            </FormControl>
                                            <FormDescription className="text-[11px]">
                                                {t('admin.settings.basic.slug_description')}
                                            </FormDescription>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            </CardContent>
                            <CardFooter className="flex justify-end border-t border-slate-50 px-6 py-4">
                                <Button
                                    type="submit"
                                    disabled={isArchived || form.formState.isSubmitting}
                                    className="rounded-xl px-6 font-black bg-indigo-600 hover:bg-indigo-700 active:scale-[0.98] transition-all shadow-sm"
                                >
                                    {form.formState.isSubmitting ? (
                                        <Loader2 className="w-4 h-4 animate-spin mr-2" />
                                    ) : (
                                        <Save className="w-4 h-4 mr-2" />
                                    )}
                                    {t('admin.settings.save_button')}
                                </Button>
                            </CardFooter>
                        </Card>
                    </form>
                </Form>

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
                            <CardDescription className="text-sm font-medium text-slate-500">
                                {t(
                                    'admin.settings.storage.description',
                                    'Monitor audio recording storage for this study'
                                )}
                            </CardDescription>
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

                                        <div className="flex justify-between text-xs text-slate-500">
                                            <span>
                                                {t('admin.settings.storage.files_count', 'Files')}:{' '}
                                                {storageUsage.file_count}
                                            </span>
                                            <span>
                                                {storageUsage.usage_percent.toFixed(1)}%{' '}
                                                {t('admin.settings.storage.used_lowercase', 'used')}
                                            </span>
                                        </div>
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
                                </div>
                            ) : null}
                        </CardContent>
                    </Card>
                )}

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
                            <>
                                <Button
                                    variant="secondary"
                                    disabled={!isClosed}
                                    onClick={handleArchive}
                                    className="w-full sm:w-auto rounded-xl font-black bg-amber-100 text-amber-700 hover:bg-amber-200 border-none shadow-sm"
                                >
                                    <Archive className="w-4 h-4 mr-2" />
                                    {t('admin.settings.lifecycle.archive_button')}
                                </Button>
                                {!isClosed && (
                                    <p className="text-[10px] text-slate-400 font-medium ml-1">
                                        * {t('admin.settings.lifecycle.notice').split('.')[0]}.
                                    </p>
                                )}
                            </>
                        )}
                    </CardFooter>
                </Card>

                {/* Reset Data Section */}
                <Card className="border-none shadow-sm bg-white rounded-2xl overflow-hidden mt-8 border-l-4 border-l-amber-500">
                    <CardHeader className="border-b border-slate-50 pb-4">
                        <div className="flex items-center gap-2 mb-1">
                            <Trash2 className="h-5 w-5 text-amber-500" />
                            <CardTitle className="text-lg font-black text-slate-900">
                                {t('admin.study_overview.reset_participants', 'Reset Data')}
                            </CardTitle>
                        </div>
                        <CardDescription className="text-sm font-medium text-slate-500">
                            {t(
                                'admin.study_overview.reset_description',
                                'This will permanently delete all participant data and Q-sort submissions for this study.'
                            )}
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="p-6">
                        <div className="bg-amber-50/50 p-4 rounded-2xl border border-amber-100 text-xs font-medium text-amber-800 flex items-start gap-3">
                            <ShieldAlert className="w-4 h-4 mt-0.5 shrink-0" />
                            <p>
                                {t(
                                    'admin.study_overview.reset_description',
                                    'This action cannot be undone.'
                                )}
                            </p>
                        </div>
                    </CardContent>
                    <CardFooter className="px-6 pb-6 pt-0 flex flex-col items-start gap-2">
                        <Button
                            variant="destructive"
                            onClick={() => setIsResetDialogOpen(true)}
                            className="w-full sm:w-auto rounded-xl font-black shadow-lg shadow-red-100 flex items-center gap-2 px-6 bg-red-50 text-red-600 hover:bg-red-100 border-red-200 border"
                        >
                            <Trash2 size={16} />
                            {t('admin.study_overview.reset_participants', 'Reset Data')}
                        </Button>
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
                                onClick={handleDelete}
                                className="w-full sm:w-auto rounded-xl font-black shadow-lg shadow-red-100 flex items-center gap-2 px-6"
                            >
                                <Trash2 size={16} />
                                {t('admin.settings.danger.delete_button')}
                            </Button>
                            {!isArchived && (
                                <p className="text-[11px] text-red-400/80 font-medium">
                                    * {t('admin.settings.danger.notice').split('. ').pop()}
                                </p>
                            )}
                        </CardFooter>
                    </Card>
                )}
            </div>
            <AlertDialog open={isResetDialogOpen} onOpenChange={setIsResetDialogOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            {t('admin.study_overview.reset_title', 'Reset all participations?')}
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            {t(
                                'admin.study_overview.reset_description',
                                'This action cannot be undone. This will permanently delete all participant data and Q-sort submissions for this study.'
                            )}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>{t('common.cancel', 'Cancel')}</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleResetParticipants}
                            disabled={isResetLoading}
                            className="bg-red-600 hover:bg-red-700 font-bold"
                        >
                            {isResetLoading ? (
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            ) : (
                                <Trash2 className="w-4 h-4 mr-2" />
                            )}
                            {t('admin.study_overview.reset_participants', 'Reset Data')}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
