import { Briefcase, Users, Settings, Save, Trash2, UserPlus, Shield, Mail } from 'lucide-react';
import { useLoaderData, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
    Form,
    FormControl,
    FormDescription,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from '@/components/ui/form';
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
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { useEffect } from 'react';
import * as z from 'zod';
import type { WorkspaceRole } from '@/api/model';
import { StudyPageHeader } from '@/components/admin/layout/StudyPageHeader';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/store/useAuthStore';
import {
    useGetWorkspaceApiAdminWorkspacesSlugGet,
    useListWorkspaceMembersApiAdminWorkspacesSlugMembersGet,
    useUpdateWorkspaceApiAdminWorkspacesSlugPatch,
    useUpdateWorkspaceMemberApiAdminWorkspacesSlugMembersUserIdPatch,
    useRemoveWorkspaceMemberApiAdminWorkspacesSlugMembersUserIdDelete,
} from '@/api/generated';

const workspaceSchema = z.object({
    title: z.string().min(1, 'Title is required').max(50),
    slug: z
        .string()
        .min(3)
        .max(50)
        .regex(/^[a-z0-9-]+$/, 'Slug must be lowercase alphanumeric with hyphens'),
});

type WorkspaceFormValues = z.infer<typeof workspaceSchema>;

export default function WorkspaceSettingsPage() {
    const { slug } = useLoaderData() as { slug: string };
    const navigate = useNavigate();
    // const { t } = useTranslation(); // Unused
    const { user: currentUser } = useAuthStore();

    const { data: workspace, isLoading: isWorkspaceLoading } =
        useGetWorkspaceApiAdminWorkspacesSlugGet(slug);

    const {
        data: members,
        isLoading: isMembersLoading,
        refetch: refetchMembers,
    } = useListWorkspaceMembersApiAdminWorkspacesSlugMembersGet(slug);

    const updateWorkspaceMutation = useUpdateWorkspaceApiAdminWorkspacesSlugPatch();
    const updateMemberMutation = useUpdateWorkspaceMemberApiAdminWorkspacesSlugMembersUserIdPatch();
    const removeMemberMutation =
        useRemoveWorkspaceMemberApiAdminWorkspacesSlugMembersUserIdDelete();

    const form = useForm<WorkspaceFormValues>({
        resolver: zodResolver(workspaceSchema),
        defaultValues: {
            title: '',
            slug: '',
        },
    });

    // Sync form with data
    useEffect(() => {
        if (workspace) {
            form.reset({
                title: workspace.title,
                slug: workspace.slug,
            });
        }
    }, [form, workspace]);

    async function onUpdateWorkspace(data: WorkspaceFormValues) {
        try {
            await updateWorkspaceMutation.mutateAsync({
                slug,
                data: {
                    title: data.title,
                    slug: data.slug,
                },
            });
            toast.success('Workspace updated');
            if (data.slug !== slug) {
                navigate(`/admin/workspaces/${data.slug}/settings`);
            }
        } catch (_err) {
            toast.error('Failed to update workspace');
        }
    }

    const handleRoleChange = async (userId: number, role: WorkspaceRole) => {
        try {
            await updateMemberMutation.mutateAsync({
                slug,
                userId,
                data: { role },
            });
            toast.success('Member role updated');
            refetchMembers();
        } catch (_err) {
            toast.error('Failed to update member role');
        }
    };

    const handleRemoveMember = async (userId: number) => {
        if (userId === currentUser?.id) {
            toast.error('You cannot remove yourself');
            return;
        }
        if (!confirm('Are you sure you want to remove this member?')) return;
        try {
            await removeMemberMutation.mutateAsync({ slug, userId });
            toast.success('Member removed');
            refetchMembers();
        } catch (_err) {
            toast.error('Failed to remove member');
        }
    };

    if (isWorkspaceLoading) {
        return (
            <div className="p-8">
                <Skeleton className="h-12 w-1/3 mb-6" />
                <Skeleton className="h-64 w-full" />
            </div>
        );
    }

    if (!workspace)
        return <div className="p-8 text-center text-slate-500">Workspace not found</div>;

    // biome-ignore lint/suspicious/noExplicitAny: API type inference issue
    const userInWorkspace = members?.find((m: any) => m.user_id === currentUser?.id);
    const isAdmin = userInWorkspace?.role === 'admin';

    return (
        <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6 pt-2">
            <StudyPageHeader
                title={workspace.title}
                description="Manage workspace identity and team access control."
                icon={Briefcase}
            />

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                {/* Workspace Profile */}
                <div className="xl:col-span-2 space-y-6">
                    <Card className="border-white/20 glass overflow-hidden shadow-xl shadow-indigo-500/5">
                        <CardHeader className="bg-white/40 border-b border-sidebar-border/50">
                            <CardTitle className="text-xl font-black text-slate-900 flex items-center gap-2">
                                <Settings className="size-5 text-indigo-500" />
                                General Settings
                            </CardTitle>
                            <CardDescription>
                                Identity and primary identification of your workspace.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="pt-6">
                            <Form {...form}>
                                <form
                                    onSubmit={form.handleSubmit(onUpdateWorkspace)}
                                    className="space-y-4"
                                >
                                    <FormField
                                        control={form.control}
                                        name="title"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel className="text-xs font-black uppercase tracking-widest text-slate-500">
                                                    Workspace Title
                                                </FormLabel>
                                                <FormControl>
                                                    <Input
                                                        {...field}
                                                        placeholder="My Awesome Lab"
                                                        className="h-11 rounded-xl bg-white/50"
                                                        disabled={!isAdmin}
                                                    />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                    <FormField
                                        control={form.control}
                                        name="slug"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel className="text-xs font-black uppercase tracking-widest text-slate-500">
                                                    URL Slug
                                                </FormLabel>
                                                <FormControl>
                                                    <div className="relative">
                                                        <Input
                                                            {...field}
                                                            placeholder="my-lab"
                                                            className="h-11 rounded-xl pl-32 bg-white/50"
                                                            disabled={!isAdmin}
                                                        />
                                                        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400 select-none border-r pr-3 mr-3 h-4 flex items-center">
                                                            /admin/w/
                                                        </div>
                                                    </div>
                                                </FormControl>
                                                <FormDescription className="text-[10px] italic">
                                                    Changing the slug will update all your research
                                                    dashboard links.
                                                </FormDescription>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                    {isAdmin && (
                                        <div className="flex justify-end pt-2">
                                            <Button
                                                type="submit"
                                                className="h-11 rounded-xl px-6 font-bold shadow-lg shadow-indigo-500/20"
                                                disabled={false} // updateWorkspaceMutation.isPending
                                            >
                                                <Save className="size-4 mr-2" />
                                                Save Changes
                                            </Button>
                                        </div>
                                    )}
                                </form>
                            </Form>
                        </CardContent>
                    </Card>

                    {/* Member Management */}
                    <Card className="border-white/20 glass overflow-hidden shadow-xl shadow-indigo-500/5">
                        <CardHeader className="bg-white/40 border-b border-sidebar-border/50">
                            <CardTitle className="text-xl font-black text-slate-900 flex items-center gap-2">
                                <Users className="size-5 text-indigo-500" />
                                Team Members
                            </CardTitle>
                            <CardDescription>
                                List of users with access to this workspace.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="p-0">
                            <Table>
                                <TableHeader className="bg-slate-50/50">
                                    <TableRow className="hover:bg-transparent border-slate-100">
                                        <TableHead className="text-[10px] font-black uppercase tracking-widest px-6 h-12">
                                            User
                                        </TableHead>
                                        <TableHead className="text-[10px] font-black uppercase tracking-widest h-12">
                                            Role
                                        </TableHead>
                                        <TableHead className="text-[10px] font-black uppercase tracking-widest h-12">
                                            Joined
                                        </TableHead>
                                        <TableHead className="text-[10px] font-black uppercase tracking-widest text-right px-6 h-12">
                                            Actions
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
                                                        {member.user.full_name?.charAt(0) ||
                                                            member.user.email
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
                                                            val as WorkspaceRole
                                                        )
                                                    }
                                                    disabled={
                                                        !isAdmin ||
                                                        member.user_id === currentUser?.id
                                                    }
                                                >
                                                    <SelectTrigger
                                                        className={cn(
                                                            'w-[120px] h-8 rounded-lg text-xs font-bold border-none shadow-none focus:ring-0',
                                                            member.role === 'admin'
                                                                ? 'bg-indigo-50 text-indigo-700'
                                                                : member.role === 'researcher'
                                                                  ? 'bg-emerald-50 text-emerald-700'
                                                                  : 'bg-slate-100 text-slate-600'
                                                        )}
                                                    >
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent className="rounded-xl border-white/20 glass shadow-2xl">
                                                        <SelectItem
                                                            value="admin"
                                                            className="text-xs font-bold py-2 rounded-lg m-1"
                                                        >
                                                            Admin
                                                        </SelectItem>
                                                        <SelectItem
                                                            value="researcher"
                                                            className="text-xs font-bold py-2 rounded-lg m-1"
                                                        >
                                                            Researcher
                                                        </SelectItem>
                                                        <SelectItem
                                                            value="viewer"
                                                            className="text-xs font-bold py-2 rounded-lg m-1"
                                                        >
                                                            Viewer
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
                                                    className="size-8 p-0 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                                    onClick={() =>
                                                        handleRemoveMember(member.user_id)
                                                    }
                                                    disabled={
                                                        !isAdmin ||
                                                        member.user_id === currentUser?.id
                                                    }
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

                {/* Sidebar - Invitations & Permissions Info */}
                <div className="space-y-6">
                    <Card className="border-indigo-100 bg-indigo-50/30 overflow-hidden">
                        <CardHeader>
                            <CardTitle className="text-sm font-black uppercase tracking-widest text-indigo-700 flex items-center gap-2">
                                <UserPlus className="size-4" />
                                Team Growth
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <p className="text-xs font-medium text-indigo-900/70 leading-relaxed">
                                Need more researchers? You can invite collaborators to your
                                workspace. They will be able to manage all studies within this
                                workspace.
                            </p>
                            <Button
                                className="w-full h-11 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold shadow-lg shadow-indigo-500/20 border-none cursor-not-allowed opacity-60"
                                disabled
                            >
                                Invite Collaborator
                            </Button>
                            <p className="text-[10px] text-center font-black uppercase tracking-tighter text-indigo-400">
                                Coming Soon
                            </p>
                        </CardContent>
                    </Card>

                    <Card className="border-slate-100 bg-white shadow-sm overflow-hidden">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-black uppercase tracking-widest text-slate-900 flex items-center gap-2">
                                <Shield className="size-4 text-slate-400" />
                                Permissions Matrix
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4 pt-2">
                            <div className="space-y-3">
                                <div className="space-y-1">
                                    <div className="flex items-center justify-between">
                                        <span className="text-[10px] font-black uppercase text-slate-900">
                                            Admin
                                        </span>
                                        <Badge
                                            variant="outline"
                                            className="text-[8px] h-4 bg-indigo-50 border-indigo-100 text-indigo-700"
                                        >
                                            Full Access
                                        </Badge>
                                    </div>
                                    <p className="text-[10px] text-slate-500 leading-tight">
                                        Can manage workspace settings, members, and all studies.
                                    </p>
                                </div>
                                <div className="space-y-1">
                                    <div className="flex items-center justify-between">
                                        <span className="text-[10px] font-black uppercase text-slate-900">
                                            Researcher
                                        </span>
                                        <Badge
                                            variant="outline"
                                            className="text-[8px] h-4 bg-emerald-50 border-emerald-100 text-emerald-700"
                                        >
                                            Creation
                                        </Badge>
                                    </div>
                                    <p className="text-[10px] text-slate-500 leading-tight">
                                        Can create and manage all studies. Restricted from workspace
                                        settings.
                                    </p>
                                </div>
                                <div className="space-y-1">
                                    <div className="flex items-center justify-between">
                                        <span className="text-[10px] font-black uppercase text-slate-900">
                                            Viewer
                                        </span>
                                        <Badge
                                            variant="outline"
                                            className="text-[8px] h-4 bg-slate-50 border-slate-100 text-slate-500"
                                        >
                                            Read Only
                                        </Badge>
                                    </div>
                                    <p className="text-[10px] text-slate-500 leading-tight">
                                        Read-only access to all studies and data in the workspace.
                                    </p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}
