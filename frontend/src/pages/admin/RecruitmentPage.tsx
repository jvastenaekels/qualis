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
import { QRCodeSVG } from 'qrcode.react';
import type { RecruitmentLinkType } from '@/api/model';
import { useRecruitmentPage } from '@/hooks/admin/useRecruitmentPage';
import { EmptyState } from '@/components/ui/empty-state';

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: JSX shell complexity from state-aware banners + multi-row table cells with per-link-type rendering; all logic lives in useRecruitmentPage
const RecruitmentPage = () => {
    const { t } = useTranslation();
    const api = useRecruitmentPage();
    const {
        study,
        links,
        isSlugLocked,
        isArchived,
        studyUrl,
        slugForm,
        accessForm,
        passwordEnabled,
        onSlugSubmit,
        onAccessRulesSubmit,
        isCreateModalOpen,
        setIsCreateModalOpen,
        handleCreateModalOpenChange,
        newLinkType,
        setNewLinkType,
        newLinkCount,
        setNewLinkCount,
        newLinkName,
        setNewLinkName,
        isCreatingLink,
        isRevokingLink,
        handleCreate,
        handleRevoke,
        copyToClipboard,
        getFullUrl,
    } = api;

    return (
        <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6 pt-2">
            <StudyPageHeader
                title={t('admin.recruitment.title', 'Access')}
                description={t(
                    'admin.recruitment.description',
                    'Configure the study URL, manage participant access, and track recruitment efficiency.'
                )}
                icon={Link2}
            />

            {/* Guidance Card — Wave E (E10): persistent dismissal across
                sessions. First-time visitors see it open; once dismissed it
                stays collapsed so returning admins aren't re-greeted by help
                they have already read (audit REPORT.md finding H6). */}
            {/* State-aware banner */}
            {study.state === 'draft' && (
                <div
                    className="flex items-center gap-3 p-4 bg-indigo-50/60 border border-indigo-100 rounded-2xl text-sm text-indigo-800 font-medium"
                    role="alert"
                >
                    <FileEdit className="size-4 shrink-0" />
                    {t(
                        'admin.recruitment.state_draft',
                        'Draft mode — links work after you activate the study.'
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
                                aria-label={t('admin.recruitment.copy_link', 'Copy URL')}
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
                                            {t('admin.recruitment.qr_title', 'Share via QR')}
                                        </DialogTitle>
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
                    <Form {...slugForm}>
                        <form onSubmit={slugForm.handleSubmit(onSlugSubmit)} className="space-y-4">
                            <FormField
                                control={slugForm.control}
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
                                        slugForm.formState.isSubmitting ||
                                        !slugForm.formState.isDirty
                                    }
                                    className="rounded-xl px-6 font-black bg-indigo-600 hover:bg-indigo-700 active:scale-[0.98] transition-all shadow-sm"
                                >
                                    {slugForm.formState.isSubmitting ? (
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

                        {/* Collection Window — D2 from progressive-disclosure
                            audit (REPORT.md 🟡12). Most studies don't need a
                            time window; the date pickers were unconditional
                            visual noise. Now gated behind a toggle that
                            derives its initial state from the form values:
                            on if either date was previously set. */}
                        <div className="space-y-4">
                            <div className="flex items-start justify-between gap-4">
                                <div className="space-y-0.5">
                                    <Label className="text-sm font-black text-slate-700">
                                        {t(
                                            'admin.recruitment.access_rules.window_toggle',
                                            'Limit collection window'
                                        )}
                                    </Label>
                                    <p className="text-xs text-slate-400 font-medium">
                                        {t(
                                            'admin.recruitment.access_rules.window_toggle_help',
                                            'Restrict participant access to a specific time range.'
                                        )}
                                    </p>
                                </div>
                                <Switch
                                    checked={
                                        !!accessForm.watch('startDate') ||
                                        !!accessForm.watch('endDate') ||
                                        accessForm.watch('windowEnabledOverride') === true
                                    }
                                    onCheckedChange={(checked) => {
                                        if (checked) {
                                            accessForm.setValue('windowEnabledOverride', true, {
                                                shouldDirty: true,
                                            });
                                        } else {
                                            accessForm.setValue('startDate', '', {
                                                shouldDirty: true,
                                            });
                                            accessForm.setValue('endDate', '', {
                                                shouldDirty: true,
                                            });
                                            accessForm.setValue('windowEnabledOverride', false, {
                                                shouldDirty: true,
                                            });
                                        }
                                    }}
                                    disabled={isArchived}
                                />
                            </div>
                            {(!!accessForm.watch('startDate') ||
                                !!accessForm.watch('endDate') ||
                                accessForm.watch('windowEnabledOverride') === true) && (
                                <>
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
                                </>
                            )}
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
                                {t('admin.recruitment.table_title', 'Recruitment links')}
                            </CardTitle>
                        </div>
                        <div className="flex items-center gap-3">
                            <Dialog
                                open={isCreateModalOpen}
                                onOpenChange={handleCreateModalOpenChange}
                            >
                                <DialogTrigger asChild>
                                    <Button
                                        size="sm"
                                        className="bg-indigo-600 hover:bg-indigo-700 shadow-sm font-bold rounded-xl"
                                    >
                                        <Plus className="h-4 w-4 mr-1.5" />
                                        {t('admin.recruitment.new_link', 'New Access Link')}
                                    </Button>
                                </DialogTrigger>
                                <DialogContent className="sm:max-w-[425px]">
                                    <DialogHeader>
                                        <DialogTitle className="text-xl font-black tracking-tight flex items-center gap-2">
                                            <div className="p-2 bg-indigo-50 rounded-lg">
                                                <Plus className="h-5 w-5 text-indigo-600" />
                                            </div>
                                            {t(
                                                'admin.recruitment.create_title',
                                                'Create Access Links'
                                            )}
                                        </DialogTitle>
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
                                                <SelectTrigger
                                                    id="type"
                                                    className="h-11 rounded-xl"
                                                >
                                                    <SelectValue
                                                        placeholder={t(
                                                            'admin.recruitment.select_type',
                                                            'Select type'
                                                        )}
                                                    />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="public">
                                                        <span className="flex items-center gap-2 font-medium">
                                                            <Globe className="h-4 w-4 text-blue-500 flex-shrink-0" />
                                                            {t(
                                                                'admin.recruitment.types.public',
                                                                'Public (Multiple usage)'
                                                            )}
                                                        </span>
                                                    </SelectItem>
                                                    <SelectItem value="individual">
                                                        <span className="flex items-center gap-2 font-medium">
                                                            <Users className="h-4 w-4 text-indigo-500 flex-shrink-0" />
                                                            {t(
                                                                'admin.recruitment.types.individual',
                                                                'Individual (Single usage)'
                                                            )}
                                                        </span>
                                                    </SelectItem>
                                                    <SelectItem value="limited">
                                                        <span className="flex items-center gap-2 font-medium">
                                                            <Lock className="h-4 w-4 text-orange-500 flex-shrink-0" />
                                                            {t(
                                                                'admin.recruitment.types.limited',
                                                                'Limited (Set capacity)'
                                                            )}
                                                        </span>
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
                                            disabled={isCreatingLink}
                                            className="bg-indigo-600 hover:bg-indigo-700 font-bold px-8 rounded-xl shadow-lg shadow-indigo-200"
                                        >
                                            {isCreatingLink
                                                ? t('common.generating', 'Generating...')
                                                : t(
                                                      'admin.recruitment.generate_links',
                                                      'Generate Links'
                                                  )}
                                        </Button>
                                    </DialogFooter>
                                </DialogContent>
                            </Dialog>
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
                                    className="py-4 text-2xs font-black text-slate-400 cursor-help"
                                    title={t(
                                        'admin.recruitment.table.type_help',
                                        'Public, Single-use, or Capacity-limited — see strategy descriptions in the “New access link” dialog.'
                                    )}
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
                                        {/* Wave E (E2): migrated to <EmptyState> primitive. */}
                                        <div className="bg-slate-50/50 rounded-xl border border-dashed border-slate-200">
                                            <EmptyState
                                                icon={Link2}
                                                title={t(
                                                    'admin.recruitment.empty_title',
                                                    'No recruitment links yet'
                                                )}
                                                body={t(
                                                    'admin.recruitment.empty_description',
                                                    'Create your first link to start inviting participants.'
                                                )}
                                                cta={{
                                                    label: t(
                                                        'admin.recruitment.empty_cta',
                                                        'Create access link'
                                                    ),
                                                    onClick: () => setIsCreateModalOpen(true),
                                                }}
                                                variant="inline"
                                            />
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ) : (
                                // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: per-link-type rendering branches (public / individual / limited) in usage cell + status cell are intentionally inline for readability; pure JSX, no logic
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
                                            {link.type === 'public' && (
                                                <div className="flex items-center gap-3 text-2xs">
                                                    <span className="flex items-center gap-1 text-slate-500 font-medium">
                                                        <Globe className="size-3 text-amber-500" />
                                                        <span className="font-black text-slate-700">
                                                            {link.start_count || 0}
                                                        </span>{' '}
                                                        {t(
                                                            'admin.recruitment.usage.started',
                                                            'started'
                                                        )}
                                                    </span>
                                                    <span className="flex items-center gap-1 text-slate-500 font-medium">
                                                        <CheckCircle2 className="size-3 text-emerald-500" />
                                                        <span className="font-black text-slate-700">
                                                            {link.usage_count}
                                                        </span>{' '}
                                                        {t(
                                                            'admin.recruitment.usage.submitted',
                                                            'submitted'
                                                        )}
                                                    </span>
                                                </div>
                                            )}
                                            {link.type === 'individual' && (
                                                <div className="text-2xs">
                                                    {link.usage_count > 0 ? (
                                                        <Badge className="bg-emerald-50 text-emerald-700 border-emerald-100 px-2 py-0 shadow-none text-[9px] font-black">
                                                            <CheckCircle2 className="size-3 mr-1" />
                                                            {t(
                                                                'admin.recruitment.usage.completed',
                                                                'Completed'
                                                            )}
                                                        </Badge>
                                                    ) : (link.start_count || 0) > 0 ? (
                                                        <Badge className="bg-amber-50 text-amber-700 border-amber-100 px-2 py-0 shadow-none text-[9px] font-black">
                                                            <Globe className="size-3 mr-1" />
                                                            {t(
                                                                'admin.recruitment.usage.in_progress',
                                                                'In progress'
                                                            )}
                                                        </Badge>
                                                    ) : (
                                                        <Badge
                                                            variant="secondary"
                                                            className="bg-slate-50 text-slate-400 border-slate-200 px-2 py-0 shadow-none text-[9px] font-black"
                                                        >
                                                            {t(
                                                                'admin.recruitment.usage.unused',
                                                                'Unused'
                                                            )}
                                                        </Badge>
                                                    )}
                                                </div>
                                            )}
                                            {link.type === 'limited' && (
                                                <div className="flex flex-col gap-1.5">
                                                    <span className="text-2xs font-black text-slate-700">
                                                        {link.usage_count}
                                                        <span className="text-slate-300 font-medium">
                                                            {' '}
                                                            / {link.capacity}
                                                        </span>
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
                                                                : 0
                                                        }
                                                        aria-valuemin={0}
                                                        aria-valuemax={100}
                                                        aria-label={t(
                                                            'admin.recruitment.progress_label',
                                                            '{{count}} of {{max}} responses',
                                                            {
                                                                count: link.usage_count,
                                                                max: link.capacity ?? 0,
                                                            }
                                                        )}
                                                    >
                                                        <div
                                                            className={cn(
                                                                'h-full transition-all duration-500',
                                                                link.capacity &&
                                                                    link.usage_count /
                                                                        link.capacity >=
                                                                        1
                                                                    ? 'bg-amber-500'
                                                                    : 'bg-indigo-500'
                                                            )}
                                                            style={{
                                                                width: `${link.capacity ? Math.min((link.usage_count / link.capacity) * 100, 100) : 0}%`,
                                                            }}
                                                        />
                                                    </div>
                                                </div>
                                            )}
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
                                                                    'Share via QR'
                                                                )}
                                                            </DialogTitle>
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
                                                    onClick={() => handleRevoke(link.id)}
                                                    disabled={isRevokingLink}
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
