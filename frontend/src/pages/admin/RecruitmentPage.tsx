import { useState, useEffect } from 'react';
import { useParams, useLoaderData, useRevalidator, useNavigate } from 'react-router-dom';
import {
    QrCode,
    Plus,
    Trash2,
    Copy,
    CheckCircle2,
    Users,
    Globe,
    Lock,
    Link2,
    Save,
    Loader2,
    ExternalLink,
    Info,
    FileEdit,
    Archive,
    Shield,
    X,
    Calendar,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { StudyPageHeader } from '@/components/admin/layout/StudyPageHeader';
import { GuidanceCard } from '@/components/admin/GuidanceCard';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    Form,
    FormControl,
    FormDescription,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from '@/components/ui/form';
import { toast } from 'sonner';
import { QRCodeSVG } from 'qrcode.react';
import {
    useCreateRecruitmentLinksApiAdminRecruitmentSlugLinksPost,
    useRevokeRecruitmentLinkApiAdminRecruitmentLinksLinkIdDelete,
    getListStudiesApiAdminStudiesGetQueryKey,
    getGetStudyApiAdminStudiesSlugGetQueryKey,
} from '@/api/generated';
import type { RecruitmentLinkRead, RecruitmentLinkType, StudyRead, StudyUpdate } from '@/api/model';
import { useQueryClient } from '@tanstack/react-query';
import { useAdminContext } from '@/hooks/useAdminContext';
import { AdminService } from '@/api/admin';
import { parseApiErrorSync } from '@/lib/error-utils';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';

const slugFormSchema = z.object({
    slug: z
        .string()
        .min(3)
        .max(100)
        .regex(/^[a-z0-9-]+$/, 'Slug must be lowercase alphanumeric with hyphens'),
});

type SlugFormValues = z.infer<typeof slugFormSchema>;

const accessRulesSchema = z.object({
    passwordEnabled: z.boolean(),
    accessPassword: z.string().optional().or(z.literal('')),
    startDate: z.string().optional().or(z.literal('')),
    endDate: z.string().optional().or(z.literal('')),
});

type AccessRulesValues = z.infer<typeof accessRulesSchema>;

function toLocalDatetimeString(iso: string): string {
    const date = new Date(iso);
    const offset = date.getTimezoneOffset();
    const local = new Date(date.getTime() - offset * 60000);
    return local.toISOString().slice(0, 16);
}

const RecruitmentPage = () => {
    const { studySlug: slug, workspaceSlug } = useParams<{
        studySlug: string;
        workspaceSlug: string;
    }>();
    const { links: initialLinks, study } = useLoaderData() as {
        links: RecruitmentLinkRead[];
        study: StudyRead;
        slug: string;
    };
    const { t } = useTranslation();
    const revalidator = useRevalidator();
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const { workspace: currentWorkspace } = useAdminContext();

    const isSlugLocked = study.state !== 'draft';

    const form = useForm<SlugFormValues>({
        resolver: zodResolver(slugFormSchema),
        defaultValues: { slug: study?.slug || '' },
    });

    useEffect(() => {
        if (study) {
            form.reset({ slug: study.slug || '' });
        }
    }, [study, form]);

    const isArchived = study.state === 'archived';

    const accessForm = useForm<AccessRulesValues>({
        resolver: zodResolver(accessRulesSchema),
        defaultValues: {
            passwordEnabled: study.requires_password ?? false,
            accessPassword: '',
            startDate: study.start_date ? toLocalDatetimeString(study.start_date) : '',
            endDate: study.end_date ? toLocalDatetimeString(study.end_date) : '',
        },
    });

    useEffect(() => {
        if (study) {
            accessForm.reset({
                passwordEnabled: study.requires_password ?? false,
                accessPassword: '',
                startDate: study.start_date ? toLocalDatetimeString(study.start_date) : '',
                endDate: study.end_date ? toLocalDatetimeString(study.end_date) : '',
            });
        }
    }, [study, accessForm]);

    const passwordEnabled = accessForm.watch('passwordEnabled');

    const onAccessRulesSubmit = async (data: AccessRulesValues) => {
        if (!slug) return;
        try {
            const update: Record<string, unknown> = {};

            if (!data.passwordEnabled) {
                update.access_password = null;
            } else if (data.accessPassword) {
                update.access_password = data.accessPassword;
            }

            update.start_date = data.startDate ? new Date(data.startDate).toISOString() : null;
            update.end_date = data.endDate ? new Date(data.endDate).toISOString() : null;

            await AdminService.updateStudy(slug, update as unknown as StudyUpdate);

            toast.success(t('admin.recruitment.access_rules.save_success', 'Access rules updated'));

            await queryClient.invalidateQueries({
                queryKey: getGetStudyApiAdminStudiesSlugGetQueryKey(slug),
            });
            revalidator.revalidate();
        } catch (error) {
            const message = parseApiErrorSync(
                error,
                t('admin.recruitment.access_rules.save_error', 'Failed to update access rules')
            );
            toast.error(
                t('admin.recruitment.access_rules.save_error', 'Failed to update access rules'),
                { description: message }
            );
        }
    };

    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [newLinkType, setNewLinkType] = useState<RecruitmentLinkType>('public');
    const [newLinkCount, setNewLinkCount] = useState(1);
    const [newLinkName, setNewLinkName] = useState('');

    const links = initialLinks; // In RR7, useLoaderData remains the source of truth

    const createMutation = useCreateRecruitmentLinksApiAdminRecruitmentSlugLinksPost({
        mutation: {
            onSuccess: () => {
                toast.success(
                    t('admin.recruitment.toasts.created', 'Recruitment links created successfully')
                );
                setIsCreateModalOpen(false);
                revalidator.revalidate(); // Refresh RR7 loader data
                setNewLinkName('');
                setNewLinkCount(1);
            },
            onError: () => {
                toast.error(t('admin.recruitment.toasts.failed', 'Failed to create links'));
            },
        },
    });

    const revokeMutation = useRevokeRecruitmentLinkApiAdminRecruitmentLinksLinkIdDelete({
        mutation: {
            onSuccess: () => {
                toast.success(t('admin.recruitment.toasts.revoked', 'Link revoked'));
                revalidator.revalidate();
            },
            onError: () => {
                toast.error(t('admin.recruitment.toasts.revoke_failed', 'Failed to revoke link'));
            },
        },
    });

    const handleCreate = () => {
        createMutation.mutate({
            // biome-ignore lint/style/noNonNullAssertion: guaranteed by loader
            slug: slug!,
            params: { count: newLinkCount },
            data: {
                type: newLinkType,
                name: newLinkName || undefined,
                capacity: newLinkType === 'individual' ? 1 : undefined,
            },
        });
    };

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
        toast.success(t('admin.recruitment.toasts.copied', 'Copied to clipboard'));
    };

    const getFullUrl = (token: string) => {
        return `${window.location.origin}/study/${slug}?token=${token}`;
    };

    const studyUrl = `${window.location.origin}/study/${slug}`;

    const onSlugSubmit = async (data: SlugFormValues) => {
        if (!slug) return;
        try {
            await AdminService.updateStudy(slug, {
                slug: data.slug,
            } as unknown as StudyUpdate);

            toast.success(t('admin.settings.save_success', 'Settings updated'), {
                description: t(
                    'admin.settings.save_success_desc',
                    'Study settings have been saved.'
                ),
            });

            await queryClient.invalidateQueries({
                queryKey: getListStudiesApiAdminStudiesGetQueryKey(),
            });
            await queryClient.invalidateQueries({
                queryKey: getGetStudyApiAdminStudiesSlugGetQueryKey(slug),
            });

            if (data.slug !== slug) {
                const ws = workspaceSlug || currentWorkspace?.slug;
                navigate(`/app/${ws}/studies/${data.slug}/recruitment`);
            } else {
                navigate('.', { replace: true });
            }
        } catch (error) {
            const message = parseApiErrorSync(
                error,
                t('admin.settings.save_error', 'Error updating settings')
            );
            toast.error(t('admin.settings.save_error', 'Error updating settings'), {
                description: message,
            });
        }
    };

    return (
        <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6 pt-2">
            <StudyPageHeader
                title={t('admin.recruitment.title', 'Access & Recruitment')}
                description={t(
                    'admin.recruitment.description',
                    'Configure the study URL, manage participant access, and track recruitment efficiency.'
                )}
                icon={Link2}
                actions={
                    <Dialog
                        open={isCreateModalOpen}
                        onOpenChange={(open) => {
                            setIsCreateModalOpen(open);
                            if (!open) {
                                setNewLinkType('public');
                                setNewLinkCount(1);
                                setNewLinkName('');
                            }
                        }}
                    >
                        <DialogTrigger asChild>
                            <Button className="bg-indigo-600 hover:bg-indigo-700 shadow-sm font-bold h-11 px-6 rounded-xl">
                                <Plus className="h-4 w-4 mr-2" />
                                {t('admin.recruitment.new_link', 'New Access Link')}
                            </Button>
                        </DialogTrigger>
                        <DialogContent className="sm:max-w-[425px]">
                            <DialogHeader>
                                <DialogTitle className="text-xl font-black tracking-tight flex items-center gap-2">
                                    <div className="p-2 bg-indigo-50 rounded-lg">
                                        <Plus className="h-5 w-5 text-indigo-600" />
                                    </div>
                                    {t('admin.recruitment.create_title', 'Create Access Links')}
                                </DialogTitle>
                                <DialogDescription className="pt-2">
                                    {t(
                                        'admin.recruitment.create_description',
                                        'Generate links for your participants. Individual links are valid for one submission only.'
                                    )}
                                </DialogDescription>
                            </DialogHeader>
                            <div className="grid gap-5 py-4">
                                <div className="grid gap-2">
                                    <Label
                                        htmlFor="type"
                                        className="text-2xs font-black text-slate-500"
                                    >
                                        {t('admin.recruitment.link_type', 'Link Type')}
                                    </Label>
                                    <Select
                                        value={newLinkType}
                                        onValueChange={(v) =>
                                            setNewLinkType(v as RecruitmentLinkType)
                                        }
                                    >
                                        <SelectTrigger id="type" className="h-11 rounded-xl">
                                            <SelectValue
                                                placeholder={t(
                                                    'admin.recruitment.select_type',
                                                    'Select type'
                                                )}
                                            />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="public">
                                                <div className="flex items-center gap-2">
                                                    <Globe className="h-4 w-4 text-blue-500" />
                                                    <span>
                                                        {t(
                                                            'admin.recruitment.types.public',
                                                            'Public (Multiple usage)'
                                                        )}
                                                    </span>
                                                </div>
                                            </SelectItem>
                                            <SelectItem value="individual">
                                                <div className="flex items-center gap-2">
                                                    <Users className="h-4 w-4 text-indigo-500" />
                                                    <span>
                                                        {t(
                                                            'admin.recruitment.types.individual',
                                                            'Individual (Single usage)'
                                                        )}
                                                    </span>
                                                </div>
                                            </SelectItem>
                                            <SelectItem value="limited">
                                                <div className="flex items-center gap-2">
                                                    <Lock className="h-4 w-4 text-orange-500" />
                                                    <span>
                                                        {t(
                                                            'admin.recruitment.types.limited',
                                                            'Limited (Set capacity)'
                                                        )}
                                                    </span>
                                                </div>
                                            </SelectItem>
                                        </SelectContent>
                                    </Select>
                                    <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-100 text-xs text-slate-500 leading-relaxed italic">
                                        {newLinkType === 'public' &&
                                            t(
                                                'admin.recruitment.guidance.public',
                                                'Ideal for social media or generic newsletters. Anyone with this link can participate multiple times.'
                                            )}
                                        {newLinkType === 'individual' &&
                                            t(
                                                'admin.recruitment.guidance.individual',
                                                'Each link is unique and expires after one submission. Best for controlled samples.'
                                            )}
                                        {newLinkType === 'limited' &&
                                            t(
                                                'admin.recruitment.guidance.limited',
                                                'Set a maximum number of submissions for a single link. Good for small target groups.'
                                            )}
                                    </div>
                                </div>
                                <div className="grid gap-2">
                                    <Label
                                        htmlFor="name"
                                        className="text-2xs font-black text-slate-500"
                                    >
                                        {t(
                                            'admin.recruitment.campaign_name',
                                            'Campaign Name (Optional)'
                                        )}
                                    </Label>
                                    <div className="relative">
                                        <Users className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                                        <Input
                                            id="name"
                                            placeholder={t(
                                                'admin.recruitment.name_placeholder',
                                                'e.g. Social Media, Batch A'
                                            )}
                                            value={newLinkName}
                                            onChange={(e) => setNewLinkName(e.target.value)}
                                            className="h-11 pl-10 rounded-xl"
                                        />
                                    </div>
                                </div>
                                {newLinkType !== 'public' && (
                                    <div className="grid gap-2 animate-in fade-in slide-in-from-top-2 duration-300">
                                        <Label
                                            htmlFor="count"
                                            className="text-2xs font-black text-slate-500"
                                        >
                                            {newLinkType === 'individual'
                                                ? t(
                                                      'admin.recruitment.link_count',
                                                      'Number of links to generate'
                                                  )
                                                : t(
                                                      'admin.recruitment.capacity_label',
                                                      'Participant Capacity'
                                                  )}
                                        </Label>
                                        <div className="relative">
                                            <QrCode className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                                            <Input
                                                id="count"
                                                type="number"
                                                min="1"
                                                max="500"
                                                value={newLinkCount}
                                                onChange={(e) =>
                                                    setNewLinkCount(
                                                        parseInt(e.target.value, 10) || 1
                                                    )
                                                }
                                                className="h-11 pl-10 rounded-xl"
                                            />
                                        </div>
                                    </div>
                                )}
                            </div>
                            <DialogFooter className="mt-2 text-center sm:text-right">
                                <Button
                                    variant="ghost"
                                    onClick={() => setIsCreateModalOpen(false)}
                                    className="rounded-xl"
                                >
                                    {t('common.cancel', 'Cancel')}
                                </Button>
                                <Button
                                    onClick={handleCreate}
                                    disabled={createMutation.isPending}
                                    className="bg-indigo-600 hover:bg-indigo-700 font-bold px-8 rounded-xl shadow-lg shadow-indigo-200"
                                >
                                    {createMutation.isPending
                                        ? t('common.generating', 'Generating...')
                                        : t('admin.recruitment.generate_links', 'Generate Links')}
                                </Button>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>
                }
            />

            {/* Guidance Card */}
            <GuidanceCard
                type="info"
                collapsible
                defaultOpen
                title={t('admin.recruitment.guidance_title', 'How participant access works')}
            >
                <p className="text-sm font-medium opacity-80 leading-relaxed max-w-2xl">
                    {t(
                        'admin.recruitment.guidance_body',
                        'The Study URL is the public web address for your study. Recruitment links append unique tokens to this URL to control and track who can participate. Share links directly, via email, or print QR codes for physical materials.'
                    )}
                </p>
            </GuidanceCard>

            {/* State-aware banner */}
            {study.state === 'draft' && (
                <div
                    className="flex items-center gap-3 p-4 bg-indigo-50/60 border border-indigo-100 rounded-2xl text-sm text-indigo-800 font-medium"
                    role="alert"
                >
                    <FileEdit className="size-4 shrink-0" />
                    {t(
                        'admin.recruitment.state_draft',
                        'Your study is in draft mode. Configure the URL and prepare recruitment links — participants cannot access the study until it is activated.'
                    )}
                </div>
            )}
            {study.state === 'closed' && (
                <div
                    className="flex items-center gap-3 p-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm text-slate-600 font-medium"
                    role="alert"
                >
                    <Lock className="size-4 shrink-0" />
                    {t(
                        'admin.recruitment.state_closed',
                        'This study is closed. Existing links remain visible but new participants cannot start.'
                    )}
                </div>
            )}
            {study.state === 'archived' && (
                <div
                    className="flex items-center gap-3 p-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm text-slate-600 font-medium"
                    role="alert"
                >
                    <Archive className="size-4 shrink-0" />
                    {t(
                        'admin.recruitment.state_archived',
                        'This study is archived. All recruitment data is read-only.'
                    )}
                </div>
            )}

            {/* Study URL Card */}
            <Card className="border-none shadow-sm bg-white rounded-2xl overflow-hidden">
                <CardHeader className="border-b border-slate-50 pb-4">
                    <div className="flex items-center gap-2 mb-1">
                        <Link2 className="h-5 w-5 text-indigo-500" />
                        <CardTitle className="text-lg font-black text-slate-900">
                            {t('admin.recruitment.study_url.title', 'Study URL')}
                        </CardTitle>
                    </div>
                    <CardDescription className="text-sm font-medium text-slate-500">
                        {t(
                            'admin.recruitment.study_url.description',
                            'The public address where participants access your study.'
                        )}
                    </CardDescription>
                </CardHeader>
                <CardContent className="p-6 space-y-5">
                    {/* Full URL display */}
                    <div className="space-y-1.5">
                        <Label className="text-2xs font-black text-slate-500">
                            {t('admin.recruitment.study_url.full_url_label', 'Full URL')}
                        </Label>
                        <div className="flex items-center gap-2">
                            <div className="flex-1 bg-slate-50 border border-slate-100 rounded-xl px-4 py-2.5 font-mono text-sm text-slate-700 truncate">
                                {studyUrl}
                            </div>
                            <Button
                                type="button"
                                variant="outline"
                                size="icon"
                                className="h-10 w-10 rounded-xl shrink-0"
                                onClick={() => copyToClipboard(studyUrl)}
                                aria-label={t('admin.recruitment.copy_link', 'Copy secure URL')}
                            >
                                <Copy className="h-4 w-4" />
                            </Button>
                            <Dialog>
                                <DialogTrigger asChild>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="icon"
                                        className="h-10 w-10 rounded-xl shrink-0"
                                        aria-label={t('admin.recruitment.show_qr', 'Show QR code')}
                                    >
                                        <QrCode className="h-4 w-4" />
                                    </Button>
                                </DialogTrigger>
                                <DialogContent className="sm:max-w-md flex flex-col items-center">
                                    <DialogHeader className="w-full text-center items-center">
                                        <div className="p-3 bg-indigo-50 rounded-2xl mb-2">
                                            <QrCode className="h-8 w-8 text-indigo-600" />
                                        </div>
                                        <DialogTitle className="text-xl font-black tracking-tight">
                                            {t('admin.recruitment.qr_title', 'Share Access')}
                                        </DialogTitle>
                                        <DialogDescription className="max-w-[280px]">
                                            {t(
                                                'admin.recruitment.qr_desc',
                                                'Participants can scan this code to access the study instantly.'
                                            )}
                                        </DialogDescription>
                                    </DialogHeader>
                                    <div className="p-6 bg-white rounded-xl shadow-inner border border-slate-100 my-4">
                                        <QRCodeSVG
                                            value={studyUrl}
                                            size={200}
                                            title={t(
                                                'admin.recruitment.qr_alt',
                                                'QR code for {{url}}',
                                                {
                                                    url: studyUrl,
                                                }
                                            )}
                                        />
                                    </div>
                                    <p className="text-xs text-slate-400 font-mono break-all text-center px-4">
                                        {studyUrl}
                                    </p>
                                </DialogContent>
                            </Dialog>
                            <Button
                                type="button"
                                variant="outline"
                                size="icon"
                                className="h-10 w-10 rounded-xl shrink-0"
                                onClick={() => window.open(studyUrl, '_blank')}
                                aria-label={t('admin.recruitment.live_study', 'Live study')}
                            >
                                <ExternalLink className="h-4 w-4" />
                            </Button>
                        </div>
                    </div>

                    {/* Editable slug field */}
                    <Form {...form}>
                        <form onSubmit={form.handleSubmit(onSlugSubmit)} className="space-y-4">
                            <FormField
                                control={form.control}
                                name="slug"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel className="text-2xs font-black text-slate-500 flex items-center gap-1.5">
                                            <Globe className="w-3 h-3" />
                                            {t(
                                                'admin.recruitment.study_url.slug_label',
                                                'URL slug'
                                            )}
                                        </FormLabel>
                                        <FormControl>
                                            <div className="relative">
                                                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-mono text-xs select-none">
                                                    /study/
                                                </div>
                                                <Input
                                                    {...field}
                                                    disabled={isSlugLocked}
                                                    className="h-11 rounded-xl bg-slate-50 border-slate-100 pl-14 font-mono text-xs focus-visible:ring-indigo-500"
                                                />
                                            </div>
                                        </FormControl>
                                        {isSlugLocked ? (
                                            <p className="text-xs text-amber-600 flex items-center gap-1.5 mt-1.5">
                                                <Info className="size-3 shrink-0" />
                                                {t(
                                                    'admin.recruitment.study_url.slug_locked',
                                                    'The URL slug can only be changed while the study is in draft mode.'
                                                )}
                                            </p>
                                        ) : (
                                            <FormDescription className="text-xs">
                                                {t(
                                                    'admin.recruitment.study_url.slug_description',
                                                    'The unique identifier used in the study URL. Lowercase letters, numbers, and hyphens only.'
                                                )}
                                            </FormDescription>
                                        )}
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <div className="flex justify-end">
                                <Button
                                    type="submit"
                                    disabled={
                                        isSlugLocked ||
                                        form.formState.isSubmitting ||
                                        !form.formState.isDirty
                                    }
                                    className="rounded-xl px-6 font-black bg-indigo-600 hover:bg-indigo-700 active:scale-[0.98] transition-all shadow-sm"
                                >
                                    {form.formState.isSubmitting ? (
                                        <Loader2 className="w-4 h-4 animate-spin mr-2" />
                                    ) : (
                                        <Save className="w-4 h-4 mr-2" />
                                    )}
                                    {t('admin.settings.save_button', 'Save changes')}
                                </Button>
                            </div>
                        </form>
                    </Form>
                </CardContent>
            </Card>

            {/* Access Rules Card */}
            <Card className="border-none shadow-sm bg-white rounded-2xl overflow-hidden">
                <CardHeader className="border-b border-slate-50 pb-4">
                    <div className="flex items-center gap-2 mb-1">
                        <Shield className="h-5 w-5 text-indigo-500" />
                        <CardTitle className="text-lg font-black text-slate-900">
                            {t('admin.recruitment.access_rules.title', 'Access rules')}
                        </CardTitle>
                    </div>
                    <CardDescription className="text-sm font-medium text-slate-500">
                        {t(
                            'admin.recruitment.access_rules.description',
                            'Control when and how participants can access the study.'
                        )}
                    </CardDescription>
                </CardHeader>
                <CardContent className="p-6">
                    <form
                        onSubmit={accessForm.handleSubmit(onAccessRulesSubmit)}
                        className="space-y-6"
                    >
                        {/* Password Protection */}
                        <div className="space-y-4">
                            <Label className="text-2xs font-black text-slate-400 uppercase tracking-wider">
                                {t(
                                    'admin.recruitment.access_rules.password_toggle',
                                    'Require a password'
                                )}
                            </Label>
                            <div className="flex items-center justify-between gap-4 p-4 bg-slate-50/50 rounded-xl border border-slate-100">
                                <div className="space-y-0.5">
                                    <p className="text-sm font-bold text-slate-700">
                                        {t(
                                            'admin.recruitment.access_rules.password_toggle',
                                            'Require a password'
                                        )}
                                    </p>
                                    <p className="text-xs text-slate-500">
                                        {t(
                                            'admin.recruitment.access_rules.password_toggle_desc',
                                            'Participants must enter a password before starting the study.'
                                        )}
                                    </p>
                                </div>
                                <Switch
                                    checked={passwordEnabled}
                                    onCheckedChange={(checked) => {
                                        accessForm.setValue('passwordEnabled', checked, {
                                            shouldDirty: true,
                                        });
                                        if (!checked) {
                                            accessForm.setValue('accessPassword', '', {
                                                shouldDirty: true,
                                            });
                                        }
                                    }}
                                    disabled={isSlugLocked}
                                />
                            </div>

                            {passwordEnabled && (
                                <div className="space-y-2 animate-in fade-in slide-in-from-top-2 duration-300">
                                    <Label
                                        htmlFor="access-password"
                                        className="text-2xs font-black text-slate-500"
                                    >
                                        {t(
                                            'admin.recruitment.access_rules.password_label',
                                            'Access password'
                                        )}
                                    </Label>
                                    <div className="relative">
                                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                                        <Input
                                            id="access-password"
                                            type="text"
                                            placeholder={t(
                                                'admin.recruitment.access_rules.password_placeholder',
                                                'Enter access password'
                                            )}
                                            disabled={isSlugLocked}
                                            {...accessForm.register('accessPassword')}
                                            className="h-11 pl-10 rounded-xl bg-slate-50 border-slate-100 font-mono text-xs focus-visible:ring-indigo-500"
                                        />
                                    </div>
                                    {isSlugLocked ? (
                                        <p className="text-xs text-amber-600 flex items-center gap-1.5">
                                            <Info className="size-3 shrink-0" />
                                            {t(
                                                'admin.recruitment.access_rules.password_locked',
                                                'Password protection can only be changed while the study is in draft mode.'
                                            )}
                                        </p>
                                    ) : study.requires_password ? (
                                        <p className="text-xs text-slate-500">
                                            {t(
                                                'admin.recruitment.access_rules.password_set',
                                                'A password is currently set. Enter a new value to change it, or toggle off to remove.'
                                            )}
                                        </p>
                                    ) : null}
                                </div>
                            )}
                        </div>

                        <Separator />

                        {/* Collection Window */}
                        <div className="space-y-4">
                            <Label className="text-2xs font-black text-slate-400 uppercase tracking-wider">
                                {t(
                                    'admin.recruitment.access_rules.collection_window',
                                    'Collection window'
                                )}
                            </Label>
                            <div className="grid gap-4 sm:grid-cols-2">
                                <div className="space-y-2">
                                    <Label
                                        htmlFor="start-date"
                                        className="text-2xs font-black text-slate-500"
                                    >
                                        {t(
                                            'admin.recruitment.access_rules.start_date_label',
                                            'Opens at'
                                        )}
                                    </Label>
                                    <div className="relative">
                                        <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                                        <Input
                                            id="start-date"
                                            type="datetime-local"
                                            disabled={isArchived}
                                            {...accessForm.register('startDate')}
                                            className="h-11 pl-10 pr-10 rounded-xl bg-slate-50 border-slate-100 text-xs focus-visible:ring-indigo-500"
                                        />
                                        {accessForm.watch('startDate') && !isArchived && (
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    accessForm.setValue('startDate', '', {
                                                        shouldDirty: true,
                                                    })
                                                }
                                                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                                                aria-label={t(
                                                    'admin.recruitment.access_rules.clear_date',
                                                    'Clear date'
                                                )}
                                            >
                                                <X className="size-3.5" />
                                            </button>
                                        )}
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <Label
                                        htmlFor="end-date"
                                        className="text-2xs font-black text-slate-500"
                                    >
                                        {t(
                                            'admin.recruitment.access_rules.end_date_label',
                                            'Closes at'
                                        )}
                                    </Label>
                                    <div className="relative">
                                        <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                                        <Input
                                            id="end-date"
                                            type="datetime-local"
                                            disabled={isArchived}
                                            {...accessForm.register('endDate')}
                                            className="h-11 pl-10 pr-10 rounded-xl bg-slate-50 border-slate-100 text-xs focus-visible:ring-indigo-500"
                                        />
                                        {accessForm.watch('endDate') && !isArchived && (
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    accessForm.setValue('endDate', '', {
                                                        shouldDirty: true,
                                                    })
                                                }
                                                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                                                aria-label={t(
                                                    'admin.recruitment.access_rules.clear_date',
                                                    'Clear date'
                                                )}
                                            >
                                                <X className="size-3.5" />
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                            <p className="text-xs text-slate-400 font-medium">
                                {t(
                                    'admin.recruitment.access_rules.date_hint',
                                    'Leave empty for no time restriction.'
                                )}
                            </p>
                        </div>

                        <div className="flex justify-end">
                            <Button
                                type="submit"
                                disabled={
                                    isArchived ||
                                    accessForm.formState.isSubmitting ||
                                    !accessForm.formState.isDirty
                                }
                                className="rounded-xl px-6 font-black bg-indigo-600 hover:bg-indigo-700 active:scale-[0.98] transition-all shadow-sm"
                            >
                                {accessForm.formState.isSubmitting ? (
                                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                                ) : (
                                    <Save className="w-4 h-4 mr-2" />
                                )}
                                {t(
                                    'admin.recruitment.access_rules.save_button',
                                    'Save access rules'
                                )}
                            </Button>
                        </div>
                    </form>
                </CardContent>
            </Card>

            <Card className="border-none shadow-sm bg-white rounded-2xl overflow-hidden">
                <CardHeader className="bg-slate-50/50 border-b border-slate-100 pb-4">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                        <div>
                            <CardTitle className="text-sm font-black text-slate-500">
                                {t('admin.recruitment.table_title', 'Participant Access Control')}
                            </CardTitle>
                            <CardDescription className="text-sm font-medium text-slate-500">
                                {t(
                                    'admin.recruitment.table_description',
                                    'Generate and manage secure entry points for your study cohorts.'
                                )}
                            </CardDescription>
                        </div>
                        <div className="flex items-center gap-4 text-xs font-bold text-slate-500">
                            <span className="flex items-center gap-1.5">
                                <Users className="size-3.5 text-indigo-500" />
                                {links?.length || 0}{' '}
                                {t('admin.recruitment.stats_summary.links', 'links')}
                            </span>
                            <span className="flex items-center gap-1.5">
                                <Globe className="size-3.5 text-amber-500" />
                                {links?.reduce((acc, l) => acc + (l.start_count || 0), 0) || 0}{' '}
                                {t('admin.recruitment.stats_summary.started', 'started')}
                            </span>
                            <span className="flex items-center gap-1.5">
                                <CheckCircle2 className="size-3.5 text-emerald-500" />
                                {links?.reduce((acc, l) => acc + (l.usage_count || 0), 0) || 0}{' '}
                                {t('admin.recruitment.stats_summary.submitted', 'submitted')}
                            </span>
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="p-0">
                    <Table>
                        <caption className="sr-only">
                            {t('admin.recruitment.table_caption', 'Recruitment links')}
                        </caption>
                        <TableHeader>
                            <TableRow className="hover:bg-transparent border-slate-100">
                                <TableHead
                                    scope="col"
                                    className="py-4 text-2xs font-black text-slate-400 pl-6"
                                >
                                    {t('admin.recruitment.table.name', 'Name / Cohort')}
                                </TableHead>
                                <TableHead
                                    scope="col"
                                    className="py-4 text-2xs font-black text-slate-400"
                                >
                                    {t('admin.recruitment.table.type', 'Type')}
                                </TableHead>
                                <TableHead
                                    scope="col"
                                    className="py-4 text-2xs font-black text-slate-400"
                                >
                                    {t('admin.recruitment.table.token', 'Token')}
                                </TableHead>
                                <TableHead
                                    scope="col"
                                    className="py-4 text-2xs font-black text-slate-400"
                                >
                                    {t('admin.recruitment.table.usage', 'Usage')}
                                </TableHead>
                                <TableHead
                                    scope="col"
                                    className="py-4 text-2xs font-black text-slate-400"
                                >
                                    {t('admin.recruitment.table.status', 'Status')}
                                </TableHead>
                                <TableHead
                                    scope="col"
                                    className="py-4 text-2xs font-black text-slate-400 text-right pr-6"
                                >
                                    {t('admin.recruitment.table.actions', 'Actions')}
                                </TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {links?.length === 0 ? (
                                <TableRow className="hover:bg-transparent">
                                    <TableCell colSpan={6} className="p-6">
                                        <div className="text-center py-12 bg-slate-50/50 rounded-xl border border-dashed border-slate-200">
                                            <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 mb-4">
                                                <Link2 className="h-6 w-6 text-slate-400" />
                                            </div>
                                            <p className="text-sm font-bold text-slate-700 mb-1">
                                                {t(
                                                    'admin.recruitment.empty_title',
                                                    'No recruitment links yet'
                                                )}
                                            </p>
                                            <p className="text-xs text-slate-400 font-medium mb-4 max-w-xs mx-auto">
                                                {t(
                                                    'admin.recruitment.empty_description',
                                                    'Create your first link to start inviting participants.'
                                                )}
                                            </p>
                                            <Button
                                                size="sm"
                                                onClick={() => setIsCreateModalOpen(true)}
                                                className="bg-indigo-600 hover:bg-indigo-700 font-bold rounded-xl shadow-sm"
                                            >
                                                <Plus className="h-4 w-4 mr-1.5" />
                                                {t(
                                                    'admin.recruitment.empty_cta',
                                                    'Create access link'
                                                )}
                                            </Button>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ) : (
                                links?.map((link) => (
                                    <TableRow key={link.id}>
                                        <TableCell className="font-bold text-slate-900 pl-6">
                                            {link.name || (
                                                <span className="text-slate-300 italic font-normal">
                                                    {t('admin.recruitment.unnamed', 'Unnamed')}
                                                </span>
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex items-center gap-2">
                                                {link.type === 'public' ? (
                                                    <Globe className="h-3.5 w-3.5 text-blue-500" />
                                                ) : link.type === 'individual' ? (
                                                    <Users className="h-3.5 w-3.5 text-indigo-500" />
                                                ) : (
                                                    <Lock className="h-3.5 w-3.5 text-orange-500" />
                                                )}
                                                <span className="capitalize text-2xs font-bold text-slate-600">
                                                    {t(
                                                        `admin.recruitment.status.${link.type}`,
                                                        link.type || 'Unknown'
                                                    )}
                                                </span>
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <code className="bg-indigo-50 px-2 py-1 rounded-lg text-2xs font-mono font-bold text-indigo-600 border border-indigo-100/50">
                                                {link.token}
                                            </code>
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex flex-col gap-1.5">
                                                <span className="text-2xs font-black text-slate-700">
                                                    {link.usage_count}
                                                    {link.capacity ? (
                                                        <span className="text-slate-300 font-medium">
                                                            {' '}
                                                            / {link.capacity}
                                                        </span>
                                                    ) : (
                                                        ''
                                                    )}
                                                </span>
                                                <div
                                                    className="w-24 h-1.5 bg-slate-100 rounded-full overflow-hidden shadow-inner"
                                                    role="progressbar"
                                                    aria-valuenow={
                                                        link.capacity
                                                            ? Math.min(
                                                                  Math.round(
                                                                      (link.usage_count /
                                                                          link.capacity) *
                                                                          100
                                                                  ),
                                                                  100
                                                              )
                                                            : 100
                                                    }
                                                    aria-valuemin={0}
                                                    aria-valuemax={100}
                                                    aria-label={t(
                                                        'admin.recruitment.progress_label',
                                                        '{{count}} of {{max}} responses',
                                                        {
                                                            count: link.usage_count,
                                                            max: link.capacity ?? '∞',
                                                        }
                                                    )}
                                                >
                                                    <div
                                                        className={cn(
                                                            'h-full transition-all duration-500',
                                                            link.capacity &&
                                                                link.usage_count / link.capacity >=
                                                                    1
                                                                ? 'bg-amber-500'
                                                                : 'bg-indigo-500'
                                                        )}
                                                        style={{
                                                            width: `${link.capacity ? Math.min((link.usage_count / link.capacity) * 100, 100) : 100}%`,
                                                        }}
                                                    />
                                                </div>
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            {link.is_active ? (
                                                <Badge className="bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border-emerald-100 px-2 py-0 shadow-none text-[9px] font-black">
                                                    {t('admin.status.active')}
                                                </Badge>
                                            ) : (
                                                <Badge
                                                    variant="secondary"
                                                    className="bg-slate-50 text-slate-400 border-slate-200 px-2 py-0 shadow-none text-[9px] font-black"
                                                >
                                                    {t('admin.recruitment.revoked', 'Revoked')}
                                                </Badge>
                                            )}
                                        </TableCell>
                                        <TableCell className="text-right pr-6">
                                            <div className="flex justify-end gap-2">
                                                <Dialog>
                                                    <DialogTrigger asChild>
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            className="h-9 w-9 min-h-[44px] min-w-[44px] text-slate-400 hover:text-indigo-600"
                                                            aria-label={t(
                                                                'admin.recruitment.show_qr',
                                                                'Show QR code'
                                                            )}
                                                        >
                                                            <QrCode className="h-4 w-4" />
                                                        </Button>
                                                    </DialogTrigger>
                                                    <DialogContent className="sm:max-w-md flex flex-col items-center">
                                                        <DialogHeader className="w-full text-center items-center">
                                                            <div className="p-3 bg-indigo-50 rounded-2xl mb-2">
                                                                <QrCode className="h-8 w-8 text-indigo-600" />
                                                            </div>
                                                            <DialogTitle className="text-xl font-black tracking-tight">
                                                                {t(
                                                                    'admin.recruitment.qr_title',
                                                                    'Share Access'
                                                                )}
                                                            </DialogTitle>
                                                            <DialogDescription className="max-w-[280px]">
                                                                {t(
                                                                    'admin.recruitment.qr_desc',
                                                                    'Participants can scan this code to access the study instantly.'
                                                                )}
                                                            </DialogDescription>
                                                        </DialogHeader>
                                                        <div className="p-6 bg-white rounded-xl shadow-inner border border-slate-100 my-4">
                                                            <QRCodeSVG
                                                                value={getFullUrl(link.token)}
                                                                size={200}
                                                                title={t(
                                                                    'admin.recruitment.qr_alt',
                                                                    'QR code for {{url}}',
                                                                    { url: getFullUrl(link.token) }
                                                                )}
                                                            />
                                                        </div>
                                                        <div className="flex flex-col items-center gap-2 w-full">
                                                            <p className="text-xs text-slate-400 font-mono break-all text-center px-4">
                                                                {getFullUrl(link.token)}
                                                            </p>
                                                            <Button
                                                                variant="outline"
                                                                size="sm"
                                                                onClick={() =>
                                                                    copyToClipboard(
                                                                        getFullUrl(link.token)
                                                                    )
                                                                }
                                                                className="mt-2 rounded-xl h-10 px-6 font-bold flex items-center gap-2 hover:bg-indigo-50 hover:text-indigo-600 hover:border-indigo-200 transition-all"
                                                            >
                                                                <Copy className="h-3.5 w-3.5" />
                                                                {t(
                                                                    'admin.recruitment.copy_link',
                                                                    'Copy Link'
                                                                )}
                                                            </Button>
                                                        </div>
                                                    </DialogContent>
                                                </Dialog>

                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-9 w-9 min-h-[44px] min-w-[44px] text-slate-400 hover:text-red-600"
                                                    onClick={() =>
                                                        revokeMutation.mutate({ linkId: link.id })
                                                    }
                                                    disabled={revokeMutation.isPending}
                                                    aria-label={t(
                                                        'admin.recruitment.delete_link',
                                                        'Delete link'
                                                    )}
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    );
};

export default RecruitmentPage;
