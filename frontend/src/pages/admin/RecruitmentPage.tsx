import { useState } from 'react';
import { useParams, useLoaderData, useRevalidator } from 'react-router-dom';
import {
    QrCode,
    Plus,
    Trash2,
    Copy,
    CheckCircle2,
    Users,
    Globe,
    Lock,
    UserPlus,
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
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { QRCodeSVG } from 'qrcode.react';
import {
    useCreateRecruitmentLinksApiAdminRecruitmentSlugLinksPost,
    useRevokeRecruitmentLinkApiAdminRecruitmentLinksLinkIdDelete,
} from '@/api/generated';
import type { RecruitmentLinkRead, RecruitmentLinkType } from '@/api/model';
import { RecruitmentFunnelChart } from '@/components/admin/dashboard/charts/RecruitmentFunnelChart';
import { LinkPerformanceChart } from '@/components/admin/dashboard/charts/LinkPerformanceChart';

const RecruitmentPage = () => {
    const { slug } = useParams<{ slug: string }>();
    const { links: initialLinks } = useLoaderData() as {
        links: RecruitmentLinkRead[];
        slug: string;
    };
    const { t } = useTranslation();
    const revalidator = useRevalidator();

    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [newLinkType, setNewLinkType] = useState<RecruitmentLinkType>('public');
    const [newLinkCount, setNewLinkCount] = useState(1);
    const [newLinkName, setNewLinkName] = useState('');

    const links = initialLinks; // In RR7, useLoaderData remains the source of truth

    const createMutation = useCreateRecruitmentLinksApiAdminRecruitmentSlugLinksPost({
        mutation: {
            onSuccess: () => {
                toast.success('Recruitment links created successfully');
                setIsCreateModalOpen(false);
                revalidator.revalidate(); // Refresh RR7 loader data
                setNewLinkName('');
                setNewLinkCount(1);
            },
            onError: () => {
                toast.error('Failed to create links');
            },
        },
    });

    const revokeMutation = useRevokeRecruitmentLinkApiAdminRecruitmentLinksLinkIdDelete({
        mutation: {
            onSuccess: () => {
                toast.success('Link revoked');
                revalidator.revalidate(); // Refresh RR7 loader data
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
        toast.success('Copied to clipboard');
    };

    const getFullUrl = (token: string) => {
        return `${window.location.origin}/study/${slug}?token=${token}`;
    };

    return (
        <div className="flex flex-1 flex-col gap-6 p-6 pt-2">
            <StudyPageHeader
                title={t('admin.recruitment.title', 'Recruitment')}
                description={t(
                    'admin.recruitment.description',
                    'Manage participant access, recruitment channels, and track conversion rates.'
                )}
                icon={UserPlus}
                actions={
                    <Dialog open={isCreateModalOpen} onOpenChange={setIsCreateModalOpen}>
                        <DialogTrigger asChild>
                            <Button className="bg-indigo-600 hover:bg-indigo-700 shadow-sm font-bold h-11 px-6 rounded-xl">
                                <Plus className="h-4 w-4 mr-2" />
                                {t('admin.recruitment.new_link', 'New Access Link')}
                            </Button>
                        </DialogTrigger>
                        <DialogContent className="sm:max-w-[425px]">
                            <DialogHeader>
                                <DialogTitle className="flex items-center gap-2">
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
                                        className="text-[10px] font-black uppercase tracking-wider text-slate-500"
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
                                    <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-100 text-[11px] text-slate-500 leading-relaxed italic">
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
                                        className="text-[10px] font-black uppercase tracking-wider text-slate-500"
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
                                            className="text-[10px] font-black uppercase tracking-wider text-slate-500"
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
                                                    setNewLinkCount(parseInt(e.target.value, 10))
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

            <div className="grid gap-6 md:grid-cols-4">
                <Card className="md:col-span-1 border-none shadow-sm bg-white rounded-2xl overflow-hidden relative group">
                    <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
                        <Users className="h-12 w-12 text-indigo-600" />
                    </div>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                            {t('admin.recruitment.stats.total_links', 'Total Links')}
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-black text-slate-900">
                            {links?.length || 0}
                        </div>
                        <p className="text-[10px] text-slate-400 mt-1 font-medium">
                            {t('admin.recruitment.stats.active_channels', 'Recruitment channels')}
                        </p>
                    </CardContent>
                </Card>

                <Card className="md:col-span-1 border-none shadow-sm bg-white rounded-2xl overflow-hidden relative group">
                    <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
                        <Globe className="h-12 w-12 text-amber-600" />
                    </div>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                            {t('admin.recruitment.stats.started', 'Started')}
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-black text-amber-600">
                            {/* biome-ignore lint/suspicious/noExplicitAny: API type inference issue */}
                            {links?.reduce((acc, l: any) => acc + (l.start_count || 0), 0) || 0}
                        </div>
                        <p className="text-[10px] text-slate-400 mt-1 font-medium">
                            {t('admin.recruitment.stats.engagements', 'Initial engagements')}
                        </p>
                    </CardContent>
                </Card>

                <Card className="md:col-span-1 border-none shadow-sm bg-white rounded-2xl overflow-hidden relative group border-l-4 border-l-green-500">
                    <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
                        <CheckCircle2 className="h-12 w-12 text-green-600" />
                    </div>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                            {t('admin.recruitment.stats.submitted', 'Submitted')}
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-black text-green-600">
                            {links?.reduce((acc, l) => acc + (l.usage_count || 0), 0) || 0}
                        </div>
                        <p className="text-[10px] text-slate-400 mt-1 font-medium">
                            {t('admin.recruitment.stats.completions', 'Validated responses')}
                        </p>
                    </CardContent>
                </Card>

                <Card className="md:col-span-1 shadow-sm border-slate-200 bg-slate-50/50 overflow-hidden relative group">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                            {t('admin.recruitment.stats.conversion', 'Success Rate')}
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-black text-slate-600">
                            {(() => {
                                const started =
                                    // biome-ignore lint/suspicious/noExplicitAny: API type inference issue
                                    links?.reduce((acc, l: any) => acc + (l.start_count || 0), 0) ||
                                    0;
                                const submitted =
                                    links?.reduce((acc, l) => acc + (l.usage_count || 0), 0) || 0;
                                return started > 0
                                    ? `${Math.round((submitted / started) * 100)}%`
                                    : '0%';
                            })()}
                        </div>
                        <p className="text-[10px] text-slate-400 mt-1 font-medium">
                            {t('admin.recruitment.stats.efficiency', 'Cohort efficiency')}
                        </p>
                    </CardContent>
                </Card>
            </div>

            <div className="grid gap-6 md:grid-cols-12">
                <div className="col-span-12 md:col-span-4">
                    <RecruitmentFunnelChart
                        links={links}
                        className="border-none shadow-sm bg-white rounded-2xl h-full"
                    />
                </div>
                <div className="col-span-12 md:col-span-8">
                    <LinkPerformanceChart
                        links={links}
                        className="border-none shadow-sm bg-white rounded-2xl h-full"
                    />
                </div>
            </div>

            <Card className="border-none shadow-sm bg-white rounded-2xl overflow-hidden">
                <CardHeader className="bg-slate-50/50 border-b border-slate-100 pb-4">
                    <CardTitle className="text-sm font-black uppercase tracking-wider text-slate-500">
                        {t('admin.recruitment.table_title', 'Participant Access Control')}
                    </CardTitle>
                    <CardDescription className="text-sm font-medium text-slate-400">
                        {t(
                            'admin.recruitment.table_description',
                            'Generate and manage secure entry points for your study cohorts.'
                        )}
                    </CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                    <Table>
                        <TableHeader>
                            <TableRow className="hover:bg-transparent border-slate-100">
                                <TableHead className="py-4 text-[10px] font-black uppercase tracking-wider text-slate-400 pl-6">
                                    {t('admin.recruitment.table.name', 'Name / Cohort')}
                                </TableHead>
                                <TableHead className="py-4 text-[10px] font-black uppercase tracking-wider text-slate-400">
                                    {t('admin.recruitment.table.type', 'Type')}
                                </TableHead>
                                <TableHead className="py-4 text-[10px] font-black uppercase tracking-wider text-slate-400">
                                    {t('admin.recruitment.table.token', 'Token')}
                                </TableHead>
                                <TableHead className="py-4 text-[10px] font-black uppercase tracking-wider text-slate-400">
                                    {t('admin.recruitment.table.usage', 'Usage')}
                                </TableHead>
                                <TableHead className="py-4 text-[10px] font-black uppercase tracking-wider text-slate-400">
                                    {t('admin.recruitment.table.status', 'Status')}
                                </TableHead>
                                <TableHead className="py-4 text-[10px] font-black uppercase tracking-wider text-slate-400 text-right pr-6">
                                    {t('admin.recruitment.table.actions', 'Actions')}
                                </TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {links?.length === 0 ? (
                                <TableRow>
                                    <TableCell
                                        colSpan={6}
                                        className="text-center py-20 text-slate-400"
                                    >
                                        <div className="flex flex-col items-center gap-2">
                                            <UserPlus className="h-10 w-10 opacity-20" />
                                            <p className="font-medium">
                                                {t(
                                                    'admin.recruitment.no_links',
                                                    'No recruitment links generated yet.'
                                                )}
                                            </p>
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
                                                <span className="capitalize text-[10px] font-bold text-slate-600">
                                                    {t(
                                                        `admin.recruitment.status.${link.type}`,
                                                        link.type || 'Unknown'
                                                    )}
                                                </span>
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <code className="bg-indigo-50 px-2 py-1 rounded-lg text-[10px] font-mono font-bold text-indigo-600 border border-indigo-100/50">
                                                {link.token}
                                            </code>
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex flex-col gap-1.5">
                                                <span className="text-[10px] font-black text-slate-700">
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
                                                <div className="w-24 h-1.5 bg-slate-100 rounded-full overflow-hidden shadow-inner">
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
                                                <Badge className="bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border-emerald-100 px-2 py-0 shadow-none text-[9px] font-black uppercase tracking-wider">
                                                    {t('admin.status.active')}
                                                </Badge>
                                            ) : (
                                                <Badge
                                                    variant="secondary"
                                                    className="bg-slate-50 text-slate-400 border-slate-200 px-2 py-0 shadow-none text-[9px] font-black uppercase tracking-wider"
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
                                                            className="h-8 w-8 text-slate-400 hover:text-indigo-600"
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
                                                    className="h-8 w-8 text-slate-400 hover:text-red-600"
                                                    onClick={() =>
                                                        revokeMutation.mutate({ linkId: link.id })
                                                    }
                                                    disabled={revokeMutation.isPending}
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
