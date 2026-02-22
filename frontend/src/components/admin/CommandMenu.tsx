import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Command } from 'cmdk';
import {
    BarChart3,
    Briefcase,
    Copy,
    FileText,
    LayoutDashboard,
    LogOut,
    PencilRuler,
    Search,
    Settings,
    UserPlus,
    Users,
} from 'lucide-react';
import { useAdminStore } from '@/store/useAdminStore';
import { useAuthStore } from '@/store/useAuthStore';
import {
    useListStudiesApiAdminStudiesGet,
    useListWorkspacesApiAdminWorkspacesGet,
} from '@/api/generated';
import { useSessionStore } from '@/store/useSessionStore';
import { useResponseStore } from '@/store/useResponseStore';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';

export const CommandMenu = () => {
    const [open, setOpen] = useState(false);
    const navigate = useNavigate();
    const { activeStudyId, activeWorkspaceId, setActiveWorkspace, setActiveStudy } =
        useAdminStore();
    const { logout, setCurrentWorkspace, currentWorkspace } = useAuthStore();
    // Studies query enabled only when workspace is present
    const { data: studies } = useListStudiesApiAdminStudiesGet({
        query: {
            enabled: !!currentWorkspace?.id,
        },
    });
    const { data: workspaces } = useListWorkspacesApiAdminWorkspacesGet();
    const { t } = useTranslation();

    const filteredStudies = studies?.filter((s) => s.workspace_id === activeWorkspaceId);
    const isValidStudy = activeStudyId && filteredStudies?.some((s) => s.slug === activeStudyId);

    // Toggle on Cmd+K or Ctrl+K
    useEffect(() => {
        const handleOpen = () => setOpen((open) => !open);
        const down = (e: KeyboardEvent) => {
            if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                handleOpen();
            }
        };

        document.addEventListener('keydown', down);
        window.addEventListener('open-command-menu', handleOpen);
        return () => {
            document.removeEventListener('keydown', down);
            window.removeEventListener('open-command-menu', handleOpen);
        };
    }, []);

    const runCommand = (command: () => void) => {
        setOpen(false);
        command();
    };

    const handleCopyLink = () => {
        if (isValidStudy) {
            const link = `${window.location.origin}/study/${activeStudyId}/welcome`;
            navigator.clipboard.writeText(link);
            toast.success(t('admin.command_menu.link_copied', 'Study link copied!'));
        }
    };

    const handleLogout = () => {
        logout();
        useSessionStore.getState().resetSession();
        useResponseStore.getState().resetResponses();
        navigate('/login');
        toast.success(t('admin.command_menu.logged_out', 'Logged out successfully'));
    };

    return (
        <Command.Dialog
            open={open}
            onOpenChange={setOpen}
            label={t('admin.command_menu.title', 'Global Command Menu')}
            className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] px-4 bg-slate-950/20 backdrop-blur-md transition-all duration-300"
        >
            <div className="w-full max-w-[640px] rounded-2xl border border-slate-200 bg-white shadow-2xl overflow-hidden animate-in fade-in-0 zoom-in-95">
                <div className="flex items-center border-b border-border/50 px-4">
                    <Search className="mr-2 h-4 w-4 shrink-0 text-muted-foreground opacity-50" />
                    <Command.Input
                        placeholder={t(
                            'admin.command_menu.placeholder',
                            'Type a command or search...'
                        )}
                        className="flex h-12 w-full bg-transparent py-3 text-sm outline-none placeholder:text-slate-400 disabled:cursor-not-allowed disabled:opacity-50"
                        autoFocus
                    />
                </div>
                <Command.List className="max-h-[400px] overflow-y-auto p-2">
                    <Command.Empty className="py-6 text-center text-slate-500">
                        {t('admin.command_menu.no_results', 'No results found.')}
                    </Command.Empty>

                    {/* Workspaces */}
                    <Command.Group
                        heading={t('admin.command_menu.switch_workspace', 'Switch Workspace')}
                        className="px-2 py-1.5 text-2xs font-bold text-muted-foreground"
                    >
                        {(Array.isArray(workspaces) ? workspaces : []).map((ws) => (
                            <div key={ws.id}>
                                <Command.Item
                                    value={`workspace ${ws.title}`}
                                    onSelect={() =>
                                        runCommand(() => {
                                            setActiveWorkspace(ws.id);
                                            setCurrentWorkspace(ws);
                                            setActiveStudy(null);
                                            toast.success(
                                                t(
                                                    'admin.command_menu.switched_workspace',
                                                    'Switched to {{name}}',
                                                    { name: ws.title }
                                                )
                                            );
                                        })
                                    }
                                    className="flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-colors aria-selected:bg-indigo-50 dark:aria-selected:bg-indigo-900/20 aria-selected:text-indigo-600 dark:aria-selected:text-indigo-400"
                                >
                                    <div className="flex h-6 w-6 items-center justify-center rounded bg-indigo-100 dark:bg-indigo-900/40">
                                        <Briefcase className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />
                                    </div>
                                    <span>{ws.title}</span>
                                    {ws.id === activeWorkspaceId && (
                                        <div className="ml-auto size-1.5 rounded-full bg-indigo-500 shadow-sm shadow-indigo-500/50" />
                                    )}
                                </Command.Item>
                                {ws.id === activeWorkspaceId && ws.slug && (
                                    <Command.Item
                                        value={`workspace settings manage ${ws.title}`}
                                        onSelect={() =>
                                            runCommand(() => navigate(`/app/${ws.slug}/settings`))
                                        }
                                        className="flex items-center gap-3 px-9 py-1.5 rounded-lg cursor-pointer transition-colors aria-selected:bg-slate-50 aria-selected:text-slate-900 text-slate-500"
                                    >
                                        <Settings className="h-3 w-3" />
                                        <span className="text-xs font-bold">
                                            {t('admin.workspace.switcher.settings')}
                                        </span>
                                    </Command.Item>
                                )}
                            </div>
                        ))}
                    </Command.Group>

                    {/* Studies (Filtered) */}
                    <Command.Group
                        heading={t('admin.command_menu.switch_study', 'Switch Study')}
                        className="px-2 py-1.5 text-2xs font-bold text-muted-foreground"
                    >
                        {filteredStudies?.map((study) => (
                            <Command.Item
                                key={study.slug}
                                value={`study ${study.slug}`}
                                onSelect={() =>
                                    runCommand(() => {
                                        setActiveStudy(study.slug);
                                        const ws = workspaces?.find(
                                            (w) => w.id === study.workspace_id
                                        );
                                        if (ws) {
                                            navigate(`/app/${ws.slug}/studies/${study.slug}`);
                                        }
                                    })
                                }
                                className="flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-colors aria-selected:bg-slate-100 dark:aria-selected:bg-slate-800"
                            >
                                <div className="flex h-6 w-6 items-center justify-center rounded bg-slate-100 dark:bg-slate-800">
                                    <FileText className="h-3.5 w-3.5 text-slate-500" />
                                </div>
                                <span className="font-medium">{study.slug}</span>
                                {study.slug === activeStudyId && (
                                    <div className="ml-auto size-1.5 rounded-full bg-emerald-500 shadow-sm shadow-emerald-500/50" />
                                )}
                            </Command.Item>
                        ))}
                        {(!filteredStudies || filteredStudies.length === 0) && (
                            <div className="px-4 py-3 text-sm text-slate-400 italic">
                                {t(
                                    'admin.command_menu.no_studies',
                                    'No studies in this workspace.'
                                )}
                            </div>
                        )}
                    </Command.Group>

                    {/* Contextual Actions (only when study is active and valid) */}
                    {isValidStudy && (
                        <Command.Group
                            heading={t('admin.command_menu.study_actions', 'Study Actions')}
                            className="px-2 py-1.5 text-2xs font-bold text-muted-foreground"
                        >
                            <Command.Item
                                value="overview dashboard"
                                onSelect={() =>
                                    runCommand(() =>
                                        navigate(
                                            `/app/${currentWorkspace?.slug}/studies/${activeStudyId}`
                                        )
                                    )
                                }
                                className="flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer aria-selected:bg-slate-100 dark:aria-selected:bg-slate-800"
                            >
                                <div className="flex h-6 w-6 items-center justify-center rounded bg-indigo-100 dark:bg-indigo-900/40">
                                    <LayoutDashboard className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />
                                </div>
                                <span>{t('admin.sidebar.dashboard')}</span>
                            </Command.Item>
                            <Command.Item
                                value="design study"
                                onSelect={() =>
                                    runCommand(() =>
                                        navigate(
                                            `/app/${currentWorkspace?.slug}/studies/${activeStudyId}/design`
                                        )
                                    )
                                }
                                className="flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer aria-selected:bg-slate-100 dark:aria-selected:bg-slate-800"
                            >
                                <div className="flex h-6 w-6 items-center justify-center rounded bg-emerald-100 dark:bg-emerald-900/40">
                                    <PencilRuler className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                                </div>
                                <span>{t('admin.sidebar.design')}</span>
                            </Command.Item>
                            <Command.Item
                                value="access recruit recruitment"
                                onSelect={() =>
                                    runCommand(() =>
                                        navigate(
                                            `/app/${currentWorkspace?.slug}/studies/${activeStudyId}/recruitment`
                                        )
                                    )
                                }
                                className="flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer aria-selected:bg-slate-100 dark:aria-selected:bg-slate-800"
                            >
                                <div className="flex h-6 w-6 items-center justify-center rounded bg-pink-100 dark:bg-pink-900/40">
                                    <UserPlus className="h-3.5 w-3.5 text-pink-600 dark:text-pink-400" />
                                </div>
                                <span>{t('admin.sidebar.recruit')}</span>
                            </Command.Item>
                            <Command.Item
                                value="data exports stats analytics"
                                onSelect={() =>
                                    runCommand(() =>
                                        navigate(
                                            `/app/${currentWorkspace?.slug}/studies/${activeStudyId}/exports`
                                        )
                                    )
                                }
                                className="flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer aria-selected:bg-slate-100 dark:aria-selected:bg-slate-800"
                            >
                                <div className="flex h-6 w-6 items-center justify-center rounded bg-amber-100 dark:bg-amber-900/40">
                                    <BarChart3 className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                                </div>
                                <span>{t('admin.sidebar.data')}</span>
                            </Command.Item>
                            <Command.Item
                                value="team management collaborators"
                                onSelect={() =>
                                    runCommand(() =>
                                        navigate(
                                            `/app/${currentWorkspace?.slug}/studies/${activeStudyId}/team`
                                        )
                                    )
                                }
                                className="flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer aria-selected:bg-slate-100 dark:aria-selected:bg-slate-800"
                            >
                                <div className="flex h-6 w-6 items-center justify-center rounded bg-blue-100 dark:bg-blue-900/40">
                                    <Users className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                                </div>
                                <span>{t('admin.sidebar.team')}</span>
                            </Command.Item>
                            <Command.Item
                                value="settings configuration"
                                onSelect={() =>
                                    runCommand(() =>
                                        navigate(
                                            `/app/${currentWorkspace?.slug}/studies/${activeStudyId}/settings`
                                        )
                                    )
                                }
                                className="flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer aria-selected:bg-slate-100 dark:aria-selected:bg-slate-800"
                            >
                                <div className="flex h-6 w-6 items-center justify-center rounded bg-slate-100 dark:bg-slate-800 border">
                                    <Settings className="h-3.5 w-3.5 text-slate-500" />
                                </div>
                                <span>{t('admin.sidebar.settings')}</span>
                            </Command.Item>
                            <Command.Item
                                value="copy share link"
                                onSelect={() => runCommand(handleCopyLink)}
                                className="flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer aria-selected:bg-slate-100 dark:aria-selected:bg-slate-800"
                            >
                                <div className="flex h-6 w-6 items-center justify-center rounded bg-sky-100 dark:bg-sky-900/40">
                                    <Copy className="h-3.5 w-3.5 text-sky-600 dark:text-sky-400" />
                                </div>
                                <span>{t('admin.command_menu.copy_link', 'Copy Public Link')}</span>
                            </Command.Item>
                        </Command.Group>
                    )}

                    {/* System Actions */}
                    <Command.Group
                        heading={t('admin.command_menu.system', 'System')}
                        className="px-2 py-1.5 text-2xs font-bold text-muted-foreground"
                    >
                        <Command.Item
                            value="logout sign out"
                            onSelect={() => runCommand(handleLogout)}
                            className="flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer aria-selected:bg-red-50 dark:aria-selected:bg-red-900/20 aria-selected:text-red-600 dark:aria-selected:text-red-400"
                        >
                            <div className="flex h-6 w-6 items-center justify-center rounded bg-red-100 dark:bg-red-900/40">
                                <LogOut className="h-3.5 w-3.5 text-red-600" />
                            </div>
                            <span>{t('admin.command_menu.logout', 'Logout')}</span>
                        </Command.Item>
                    </Command.Group>
                </Command.List>

                <div className="border-t px-4 py-2 flex items-center justify-between text-xs text-slate-400">
                    <div className="flex items-center gap-2">
                        <Search className="h-3 w-3" />
                        <span>
                            {t('admin.command_menu.search_label', 'Search or run commands')}
                        </span>
                    </div>
                    <div className="flex items-center gap-1">
                        <kbd className="px-1.5 py-0.5 bg-slate-100 dark:bg-slate-800 rounded text-2xs font-mono">
                            ⌘K
                        </kbd>
                        <span>{t('admin.command_menu.to_open', 'to open')}</span>
                    </div>
                </div>
            </div>
        </Command.Dialog>
    );
};
