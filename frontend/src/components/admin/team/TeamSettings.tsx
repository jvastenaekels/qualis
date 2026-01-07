import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { Users, UserPlus, Copy, Check, Shield, User, Trash2, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import {
    useGetStudyApiAdminStudiesSlugGet,
    useInviteCollaboratorApiAdminInvitationsSlugInvitePost,
} from '@/api/generated';
import { StudyRole } from '@/api/model';
import { EmptyState } from '@/components/admin/EmptyState';
import { useTranslation } from 'react-i18next';

const TeamSettings = () => {
    const { t } = useTranslation();
    const { slug } = useParams<{ slug: string }>();
    const { data: study, isLoading, refetch } = useGetStudyApiAdminStudiesSlugGet(slug || '');
    const inviteMutation = useInviteCollaboratorApiAdminInvitationsSlugInvitePost();

    const [inviteEmail, setInviteEmail] = useState('');
    const [inviteRole, setInviteRole] = useState<StudyRole>(StudyRole.editor);
    const [inviteLink, setInviteLink] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);

    const handleInvite = async () => {
        if (!slug || !inviteEmail) return;

        try {
            const result = await inviteMutation.mutateAsync({
                slug,
                data: {
                    email: inviteEmail,
                    role: inviteRole,
                },
            });
            setInviteLink(result.invite_url);
            toast.success(t('admin.team.invite_success', 'Invitation link generated!'));
            setInviteEmail('');
            refetch(); // Refresh member list (though it might only show on registration)
        } catch (error) {
            toast.error(t('admin.team.invite_error', 'Failed to generate invitation'));
            console.error(error);
        }
    };

    const copyToClipboard = () => {
        if (inviteLink) {
            navigator.clipboard.writeText(inviteLink);
            setCopied(true);
            toast.success(t('admin.team.copy_success', 'Link copied to clipboard'));
            setTimeout(() => setCopied(false), 2000);
        }
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center p-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    // biome-ignore lint/suspicious/noExplicitAny: missing type in generated client
    const members = (study as any)?.collaborators || [];

    return (
        <div className="space-y-6">
            <div className="grid gap-6 md:grid-cols-2">
                {/* Invitation Card */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <UserPlus className="h-5 w-5 text-primary" />
                            {t('admin.team.invite_title', 'Invite Collaborator')}
                        </CardTitle>
                        <CardDescription>
                            {t(
                                'admin.team.invite_description',
                                'Generate a secure link to invite a new member to this study.'
                            )}
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="email">
                                {t('admin.team.email_label', 'Email Address')}
                            </Label>
                            <Input
                                id="email"
                                type="email"
                                placeholder="researcher@university.edu"
                                value={inviteEmail}
                                onChange={(e) => setInviteEmail(e.target.value)}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="role">{t('admin.team.role_label', 'Role')}</Label>
                            <Select
                                value={inviteRole}
                                onValueChange={(v) => setInviteRole(v as StudyRole)}
                            >
                                <SelectTrigger id="role">
                                    <SelectValue
                                        placeholder={t('admin.team.select_role', 'Select a role')}
                                    />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value={StudyRole.owner}>
                                        {t('admin.team.roles.owner', 'Owner (Full Control)')}
                                    </SelectItem>
                                    <SelectItem value={StudyRole.editor}>
                                        {t('admin.team.roles.editor', 'Editor (Design & Analysis)')}
                                    </SelectItem>
                                    <SelectItem value={StudyRole.viewer}>
                                        {t('admin.team.roles.viewer', 'Viewer (Read-only)')}
                                    </SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <Button
                            className="w-full"
                            onClick={handleInvite}
                            disabled={!inviteEmail || inviteMutation.isPending}
                        >
                            {inviteMutation.isPending ? (
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            ) : (
                                t('admin.team.generate_link', 'Generate Link')
                            )}
                        </Button>

                        {inviteLink && (
                            <div className="mt-4 p-3 bg-muted rounded-lg border flex flex-col gap-2">
                                <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                                    {t(
                                        'admin.team.share_label',
                                        'Share this link with the invitee:'
                                    )}
                                </Label>
                                <div className="flex gap-2">
                                    <Input
                                        readOnly
                                        value={inviteLink}
                                        className="h-8 text-xs font-mono bg-background"
                                    />
                                    <Button
                                        size="icon"
                                        variant="outline"
                                        className="h-8 w-8 shrink-0"
                                        onClick={copyToClipboard}
                                    >
                                        {copied ? (
                                            <Check className="h-4 w-4" />
                                        ) : (
                                            <Copy className="h-4 w-4" />
                                        )}
                                    </Button>
                                </div>
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Team Stats Card */}
                <Card className="bg-primary/5 border-primary/10">
                    <CardHeader>
                        <CardTitle className="text-sm uppercase tracking-widest text-primary font-bold">
                            {t('admin.team.collab_overview', 'Collaboration Overview')}
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-6 pt-2">
                        <div className="flex items-center justify-between border-b border-primary/10 pb-4">
                            <div className="flex items-center gap-3">
                                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                                    <Users className="h-5 w-5 text-primary" />
                                </div>
                                <div>
                                    <p className="text-2xl font-bold">{members.length}</p>
                                    <p className="text-xs text-muted-foreground uppercase tracking-wider">
                                        {t('admin.team.active_members', 'Active Members')}
                                    </p>
                                </div>
                            </div>
                        </div>
                        <div className="space-y-3">
                            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                                {t('admin.team.permissions_info', 'Permissions Info')}
                            </p>
                            <div className="grid grid-cols-1 gap-2">
                                <div className="flex items-center gap-2 text-xs">
                                    <Badge
                                        variant="outline"
                                        className="h-5 px-1 font-mono text-[9px]"
                                    >
                                        {t('admin.team.roles.owner_badge', 'OWNER')}
                                    </Badge>
                                    <span className="text-muted-foreground">
                                        {t(
                                            'admin.team.permissions.owner',
                                            'Can delete the study and manage team.'
                                        )}
                                    </span>
                                </div>
                                <div className="flex items-center gap-2 text-xs">
                                    <Badge
                                        variant="outline"
                                        className="h-5 px-1 font-mono text-[9px]"
                                    >
                                        {t('admin.team.roles.editor_badge', 'EDITOR')}
                                    </Badge>
                                    <span className="text-muted-foreground">
                                        {t(
                                            'admin.team.permissions.editor',
                                            'Can modify design and view results.'
                                        )}
                                    </span>
                                </div>
                                <div className="flex items-center gap-2 text-xs">
                                    <Badge
                                        variant="outline"
                                        className="h-5 px-1 font-mono text-[9px]"
                                    >
                                        {t('admin.team.roles.viewer_badge', 'VIEWER')}
                                    </Badge>
                                    <span className="text-muted-foreground">
                                        {t(
                                            'admin.team.permissions.viewer',
                                            'Read-only access to all modules.'
                                        )}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Member List Card */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Shield className="h-5 w-5 text-indigo-500" />
                        {t('admin.team.list_title', 'Research Team')}
                    </CardTitle>
                    <CardDescription>
                        {t(
                            'admin.team.list_description',
                            'Manage access for existing collaborators.'
                        )}
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="rounded-md border">
                        <div className="grid grid-cols-12 bg-muted/50 p-3 text-xs font-bold uppercase tracking-wider text-muted-foreground border-b">
                            <div className="col-span-6">
                                {t('admin.team.headers.collaborator', 'Collaborator')}
                            </div>
                            <div className="col-span-4">{t('admin.team.headers.role', 'Role')}</div>
                            <div className="col-span-2 text-right">
                                {t('admin.team.headers.actions', 'Actions')}
                            </div>
                        </div>
                        <div className="divide-y">
                            {members.length === 0 ? (
                                <EmptyState
                                    type="team"
                                    onAction={() => document.getElementById('email')?.focus()}
                                />
                            ) : (
                                // biome-ignore lint/suspicious/noExplicitAny: missing type
                                members.map((m: any) => (
                                    <div
                                        key={m.user_id}
                                        className="grid grid-cols-12 p-3 items-center hover:bg-muted/30 transition-colors"
                                    >
                                        <div className="col-span-6 flex items-center gap-3">
                                            <div className="h-8 w-8 rounded-full bg-slate-100 flex items-center justify-center border text-xs font-bold text-slate-500">
                                                <User className="h-4 w-4" />
                                            </div>
                                            <div className="flex flex-col">
                                                <span className="text-sm font-medium">
                                                    {m.user?.email ||
                                                        t('common.unknown_user', 'Unknown User')}
                                                </span>
                                                <span className="text-[10px] text-muted-foreground">
                                                    {t('admin.team.added_on', 'Added on')}{' '}
                                                    {new Date(m.added_at).toLocaleDateString()}
                                                </span>
                                            </div>
                                        </div>
                                        <div className="col-span-4">
                                            <Badge
                                                variant="secondary"
                                                className={`uppercase text-[9px] font-mono ${
                                                    m.role === StudyRole.owner
                                                        ? 'bg-indigo-50 text-indigo-700'
                                                        : m.role === StudyRole.editor
                                                          ? 'bg-emerald-50 text-emerald-700'
                                                          : 'bg-slate-50 text-slate-700'
                                                }`}
                                            >
                                                {m.role}
                                            </Badge>
                                        </div>
                                        <div className="col-span-2 text-right">
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
};

export default TeamSettings;
