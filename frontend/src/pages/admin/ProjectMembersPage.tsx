import { Users, Trash2, UserPlus, Shield, Mail, Check, Copy, Loader2 } from 'lucide-react';
import { useLoaderData } from 'react-router-dom';
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
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';
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
import { toast } from 'sonner';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ProjectRole } from '@/api/model';
import { StudyPageHeader } from '@/components/admin/layout/StudyPageHeader';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/store/useAuthStore';
import {
    useGetProjectApiAdminProjectsSlugGet,
    useListProjectMembersApiAdminProjectsSlugMembersGet,
    useUpdateProjectMemberApiAdminProjectsSlugMembersUserIdPatch,
    useRemoveProjectMemberApiAdminProjectsSlugMembersUserIdDelete,
    useCreateInvitationApiAdminProjectsSlugInvitationsPost,
} from '@/api/generated';
import { parseApiErrorSync, resolveApiErrorKey } from '@/lib/error-utils';

export default function ProjectMembersPage() {
    const { slug } = useLoaderData() as { slug: string };
    const { t } = useTranslation();
    const { user: currentUser } = useAuthStore();

    const { data: project, isLoading: isProjectLoading } =
        useGetProjectApiAdminProjectsSlugGet(slug);

    const {
        data: membersData,
        isLoading: isMembersLoading,
        refetch: refetchMembers,
    } = useListProjectMembersApiAdminProjectsSlugMembersGet(slug);
    const members = membersData?.items;

    const updateMemberMutation = useUpdateProjectMemberApiAdminProjectsSlugMembersUserIdPatch();
    const removeMemberMutation = useRemoveProjectMemberApiAdminProjectsSlugMembersUserIdDelete();

    const [memberToRemove, setMemberToRemove] = useState<{
        userId: number;
        name: string;
    } | null>(null);

    const handleRoleChange = async (userId: number, role: ProjectRole) => {
        try {
            await updateMemberMutation.mutateAsync({
                slug,
                userId,
                data: { role },
            });
            toast.success(t('admin.projects.settings.team.role_update_success'));
            refetchMembers();
        } catch (err) {
            const { key, fallback } = resolveApiErrorKey(
                err as { code?: string; message?: string }
            );
            toast.error(
                key
                    ? t(key, fallback)
                    : parseApiErrorSync(err, t('admin.projects.settings.team.role_update_error'))
            );
        }
    };

    const requestRemoveMember = (userId: number, name: string) => {
        if (userId === currentUser?.id) {
            toast.error(
                t('admin.account.personal.cannot_remove_self', 'You cannot remove yourself')
            );
            return;
        }
        setMemberToRemove({ userId, name });
    };

    const confirmRemoveMember = async () => {
        if (!memberToRemove) return;
        try {
            await removeMemberMutation.mutateAsync({ slug, userId: memberToRemove.userId });
            toast.success(t('admin.projects.settings.team.remove_success'));
            refetchMembers();
        } catch (err) {
            toast.error(parseApiErrorSync(err, t('admin.projects.settings.team.remove_error')));
        } finally {
            setMemberToRemove(null);
        }
    };

    if (isProjectLoading) {
        return (
            <div className="p-8">
                <Skeleton className="h-12 w-1/3 mb-6" />
                <Skeleton className="h-64 w-full" />
            </div>
        );
    }

    if (!project)
        return <div className="p-8 text-center text-slate-500">{t('common.errors.not_found')}</div>;

    // biome-ignore lint/suspicious/noExplicitAny: API type inference issue
    const userInProject = members?.find((m: any) => m.user_id === currentUser?.id);
    const isOwner = userInProject?.role === 'owner';

    return (
        <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6 pt-2">
            <StudyPageHeader
                title={t('admin.members.title', 'Team members')}
                description={t(
                    'admin.members.description',
                    'Manage who can access this project and what they can do.'
                )}
                icon={Users}
            />

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 space-y-6">
                    <Card className="border-none shadow-sm bg-white rounded-2xl overflow-hidden">
                        <CardHeader className="border-b border-slate-50 pb-4">
                            <CardTitle className="text-lg font-black text-slate-900 flex items-center gap-2">
                                <Users className="size-5 text-indigo-500" />
                                {t('admin.projects.settings.team.title')}
                            </CardTitle>
                            <CardDescription className="text-sm font-medium text-slate-500">
                                {t('admin.projects.settings.team.desc')}
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="p-0">
                            <Table>
                                <caption className="sr-only">
                                    {t('admin.project.table_caption', 'Project members')}
                                </caption>
                                <TableHeader className="bg-slate-50/50">
                                    <TableRow className="hover:bg-transparent border-slate-100">
                                        <TableHead
                                            scope="col"
                                            className="text-2xs font-black px-6 h-12"
                                        >
                                            {t('admin.projects.settings.team.col_user')}
                                        </TableHead>
                                        <TableHead scope="col" className="text-2xs font-black h-12">
                                            {t('admin.projects.settings.team.col_role')}
                                        </TableHead>
                                        <TableHead scope="col" className="text-2xs font-black h-12">
                                            {t('admin.projects.settings.team.col_joined')}
                                        </TableHead>
                                        <TableHead
                                            scope="col"
                                            className="text-2xs font-black text-right px-6 h-12"
                                        >
                                            {t('admin.projects.settings.team.col_actions')}
                                        </TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {/* biome-ignore lint/suspicious/noExplicitAny: API type inference issue */}
                                    {members?.map((member: any) => (
                                        <TableRow
                                            key={member.user_id}
                                            className="border-slate-50 hover:bg-slate-50/30 transition-colors"
                                        >
                                            <TableCell className="px-6 py-4">
                                                <div className="flex items-center gap-3">
                                                    <div className="size-8 rounded-full bg-gradient-to-br from-slate-100 to-slate-200 border border-slate-200 flex items-center justify-center font-bold text-slate-500 shadow-sm">
                                                        {member.user.full_name
                                                            ? member.user.full_name
                                                                  .split(/\s+/)
                                                                  .map((w: string) => w[0])
                                                                  .join('')
                                                                  .substring(0, 2)
                                                                  .toUpperCase()
                                                            : member.user.email
                                                                  .charAt(0)
                                                                  .toUpperCase()}
                                                    </div>
                                                    <div className="flex flex-col">
                                                        <span className="text-sm font-bold text-slate-900">
                                                            {member.user.full_name || 'No Name'}
                                                        </span>
                                                        <span className="text-xs text-slate-400 font-medium flex items-center gap-1">
                                                            <Mail className="size-3" />{' '}
                                                            {member.user.email}
                                                        </span>
                                                    </div>
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <Select
                                                    value={member.role}
                                                    onValueChange={(val) =>
                                                        handleRoleChange(
                                                            member.user_id,
                                                            val as ProjectRole
                                                        )
                                                    }
                                                    disabled={
                                                        !isOwner ||
                                                        member.user_id === currentUser?.id
                                                    }
                                                >
                                                    <SelectTrigger
                                                        className={cn(
                                                            'w-[120px] h-8 rounded-lg text-xs font-bold border-none shadow-none focus:ring-0',
                                                            member.role === 'owner'
                                                                ? 'bg-indigo-50 text-indigo-700'
                                                                : member.role === 'member'
                                                                  ? 'bg-emerald-50 text-emerald-700'
                                                                  : 'bg-slate-100 text-slate-600'
                                                        )}
                                                    >
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent className="rounded-xl border-white/20 glass shadow-2xl">
                                                        <SelectItem
                                                            value="member"
                                                            className="text-xs font-bold py-2 rounded-lg m-1"
                                                        >
                                                            {t(
                                                                'admin.project.roles.member',
                                                                'Member'
                                                            )}
                                                        </SelectItem>
                                                        <SelectItem
                                                            value="viewer"
                                                            className="text-xs font-bold py-2 rounded-lg m-1"
                                                        >
                                                            {t(
                                                                'admin.project.roles.viewer',
                                                                'Viewer'
                                                            )}
                                                        </SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </TableCell>
                                            <TableCell className="text-xs font-medium text-slate-400">
                                                {new Date(member.joined_at).toLocaleDateString()}
                                            </TableCell>
                                            <TableCell className="text-right px-6">
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className="size-9 min-h-[44px] min-w-[44px] p-0 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                                    onClick={() =>
                                                        requestRemoveMember(
                                                            member.user_id,
                                                            member.user.full_name ||
                                                                member.user.email
                                                        )
                                                    }
                                                    disabled={
                                                        !isOwner ||
                                                        member.user_id === currentUser?.id
                                                    }
                                                    aria-label={t(
                                                        'admin.projects.settings.team.remove_member_aria',
                                                        'Remove {{name}}',
                                                        {
                                                            name:
                                                                member.user.full_name ||
                                                                member.user.email,
                                                        }
                                                    )}
                                                >
                                                    <Trash2 className="size-4" />
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                    {isMembersLoading &&
                                        Array.from({ length: 3 }).map((_, i) => (
                                            <TableRow key={i}>
                                                <TableCell colSpan={4}>
                                                    <Skeleton className="h-12 w-full" />
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                </div>

                <div className="space-y-6">
                    <Card className="border-indigo-100 bg-indigo-50/30 rounded-2xl overflow-hidden shadow-sm">
                        <CardHeader>
                            <CardTitle className="text-sm font-black text-indigo-700 flex items-center gap-2">
                                <UserPlus className="size-4" />
                                {t('admin.projects.settings.team_growth_title')}
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <p className="text-xs font-medium text-indigo-900/70 leading-relaxed">
                                {t('admin.projects.settings.team.growth_desc')}
                            </p>
                            <InviteMemberModal slug={slug} isOwner={isOwner} />
                        </CardContent>
                    </Card>

                    <Card className="border-none shadow-sm bg-white rounded-2xl overflow-hidden">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-black text-slate-900 flex items-center gap-2">
                                <Shield className="size-4 text-slate-400" />
                                {t('admin.projects.settings.team.permissions_matrix.title')}
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4 pt-2">
                            <div className="space-y-3">
                                <div className="space-y-1">
                                    <span className="text-2xs font-black text-slate-900 block">
                                        {t(
                                            'admin.projects.settings.team.permissions_matrix.owner.label',
                                            'Owner'
                                        )}
                                    </span>
                                    <p className="text-2xs text-slate-500 leading-tight">
                                        {t(
                                            'admin.projects.settings.team.permissions_matrix.owner.desc',
                                            'Full project, member, and study control.'
                                        )}
                                    </p>
                                </div>
                                <div className="space-y-1">
                                    <span className="text-2xs font-black text-slate-900 block">
                                        {t(
                                            'admin.projects.settings.team.permissions_matrix.member.label',
                                            'Member'
                                        )}
                                    </span>
                                    <p className="text-2xs text-slate-500 leading-tight">
                                        {t(
                                            'admin.projects.settings.team.permissions_matrix.member.desc',
                                            'Can manage studies, concourses, and participants.'
                                        )}
                                    </p>
                                </div>
                                <div className="space-y-1">
                                    <span className="text-2xs font-black text-slate-900 block">
                                        {t(
                                            'admin.projects.settings.team.permissions_matrix.viewer.label'
                                        )}
                                    </span>
                                    <p className="text-2xs text-slate-500 leading-tight">
                                        {t(
                                            'admin.projects.settings.team.permissions_matrix.viewer.desc'
                                        )}
                                    </p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>

            <AlertDialog
                open={memberToRemove !== null}
                onOpenChange={(open) => !open && setMemberToRemove(null)}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            {t(
                                'admin.projects.settings.team.remove_dialog_title',
                                'Remove team member?'
                            )}
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            {t(
                                'admin.projects.settings.team.remove_dialog_body',
                                '{{name}} will lose access to this project. They can be re-invited later.',
                                { name: memberToRemove?.name ?? '' }
                            )}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>{t('common.cancel', 'Cancel')}</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={confirmRemoveMember}
                            className="bg-red-600 hover:bg-red-700"
                        >
                            {t('admin.projects.settings.team.remove_dialog_action', 'Remove')}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}

function InviteMemberModal({ slug, isOwner }: { slug: string; isOwner: boolean }) {
    const { t } = useTranslation();
    const [email, setEmail] = useState('');
    const [role, setRole] = useState<ProjectRole>('member');
    const [open, setOpen] = useState(false);
    const [inviteUrl, setInviteUrl] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);

    const inviteMutation = useCreateInvitationApiAdminProjectsSlugInvitationsPost();

    const handleInvite = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const result = await inviteMutation.mutateAsync({
                slug,
                data: { email, role },
            });
            setInviteUrl(result.invite_url || null);
            toast.success(t('admin.projects.settings.team.invite_modal.success'));
        } catch (err) {
            const { key, fallback } = resolveApiErrorKey(
                err as { code?: string; message?: string }
            );
            toast.error(
                key
                    ? t(key, fallback)
                    : parseApiErrorSync(err, t('admin.projects.settings.team.invite_modal.error'))
            );
        }
    };

    const copyToClipboard = () => {
        if (inviteUrl) {
            navigator.clipboard.writeText(inviteUrl);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
            toast.success(t('admin.projects.settings.team.invite_modal.copy_success'));
        }
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button
                    className="w-full h-11 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold shadow-lg shadow-indigo-500/20 border-none"
                    disabled={!isOwner}
                >
                    <UserPlus className="size-4 mr-2" />
                    {t('admin.projects.settings.team.invite_button')}
                </Button>
            </DialogTrigger>
            <DialogContent className="border-slate-200 bg-white shadow-2xl max-w-sm p-0 overflow-hidden">
                <div className="p-6">
                    <DialogHeader className="mb-4">
                        <DialogTitle className="text-xl font-black text-slate-900 leading-tight">
                            {t('admin.projects.settings.team.invite_modal.title')}
                        </DialogTitle>
                    </DialogHeader>

                    {!inviteUrl ? (
                        <form onSubmit={handleInvite} className="space-y-4 pt-4">
                            <div className="space-y-2">
                                <Label className="text-2xs font-black text-slate-700">
                                    {t('admin.projects.settings.team.invite_modal.email_label')}
                                </Label>
                                <Input
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    placeholder="researcher@university.edu"
                                    className="h-11 rounded-xl bg-slate-50 border-slate-200 focus:bg-white transition-colors"
                                    required
                                />
                            </div>
                            <div className="space-y-2">
                                <Label className="text-2xs font-black text-slate-700">
                                    {t('admin.projects.settings.team.invite_modal.role_label')}
                                </Label>
                                <Select
                                    value={role}
                                    onValueChange={(val) => setRole(val as ProjectRole)}
                                >
                                    <SelectTrigger className="h-11 rounded-xl bg-slate-50 border-slate-200">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent className="rounded-xl border-slate-200 bg-white shadow-2xl">
                                        <SelectItem
                                            value="member"
                                            className="text-xs font-bold py-2 rounded-lg m-1"
                                        >
                                            {t('admin.project.roles.member', 'Member')}
                                        </SelectItem>
                                        <SelectItem
                                            value="viewer"
                                            className="text-xs font-bold py-2 rounded-lg m-1"
                                        >
                                            {t('admin.project.roles.viewer', 'Viewer')}
                                        </SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <DialogFooter className="pt-2">
                                <Button
                                    type="submit"
                                    className="w-full h-11 rounded-xl bg-slate-900 font-bold"
                                    disabled={inviteMutation.isPending}
                                >
                                    {inviteMutation.isPending ? (
                                        <Loader2 className="size-4 animate-spin mr-2" />
                                    ) : (
                                        <Mail className="size-4 mr-2" />
                                    )}
                                    {t('admin.projects.settings.team.invite_modal.send')}
                                </Button>
                            </DialogFooter>
                        </form>
                    ) : (
                        <div className="space-y-4 pt-4">
                            <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-100 space-y-3">
                                <div className="flex items-center gap-2 text-emerald-700 font-bold text-sm">
                                    <Check className="size-4" />
                                    {t('admin.projects.settings.team.invite_modal.success')}
                                </div>
                                <div className="relative group">
                                    <Input
                                        readOnly
                                        value={inviteUrl}
                                        className="pr-10 bg-white/80 border-emerald-200 text-xs font-mono"
                                    />
                                    <Button
                                        size="sm"
                                        variant="ghost"
                                        className="absolute right-1 top-1/2 -translate-y-1/2 size-8 p-0"
                                        onClick={copyToClipboard}
                                    >
                                        {copied ? (
                                            <Check className="size-3 text-emerald-600" />
                                        ) : (
                                            <Copy className="size-3 text-slate-400" />
                                        )}
                                    </Button>
                                </div>
                            </div>
                            <Button
                                variant="outline"
                                className="w-full h-11 rounded-xl border-slate-200 text-slate-600 font-bold hover:bg-slate-50"
                                onClick={() => {
                                    setOpen(false);
                                    setInviteUrl(null);
                                    setEmail('');
                                }}
                            >
                                {t('common.close')}
                            </Button>
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
