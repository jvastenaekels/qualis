import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Command } from 'cmdk';
import { Briefcase, LayoutDashboard, PencilRuler, Users, Moon, Sun, LogOut, Copy, FileText, Search } from 'lucide-react';
import { useAdminStore } from '@/store/useAdminStore';
import { useAuthStore } from '@/store/useAuthStore';
import { useListStudiesApiAdminStudiesGet, useListWorkspacesApiAdminWorkspacesGet } from '@/api/generated';
import { useSessionStore } from '@/store/useSessionStore';
import { toast } from 'sonner';

export const CommandMenu = () => {
    const [open, setOpen] = useState(false);
    const navigate = useNavigate();
    const { activeStudyId, activeWorkspaceId, setActiveWorkspace, setActiveStudy } = useAdminStore();
    const logout = useAuthStore((state) => state.logout);
    const { data: studies } = useListStudiesApiAdminStudiesGet();
    const { data: workspaces } = useListWorkspacesApiAdminWorkspacesGet();

    const filteredStudies = studies?.filter(s => s.workspace_id === activeWorkspaceId);

    // Toggle on Cmd+K or Ctrl+K
    useEffect(() => {
        const down = (e: KeyboardEvent) => {
            if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                setOpen((open) => !open);
            }
        };
        document.addEventListener('keydown', down);
        return () => document.removeEventListener('keydown', down);
    }, []);

    const runCommand = (command: () => void) => {
        setOpen(false);
        command();
    };

    const handleCopyLink = () => {
        if (activeStudyId) {
            const link = `${window.location.origin}/study/${activeStudyId}/welcome`;
            navigator.clipboard.writeText(link);
            toast.success('Study link copied!');
        }
    };

    const handleThemeToggle = () => {
        const root = document.documentElement;
        root.classList.toggle('dark');
        toast.success(root.classList.contains('dark') ? 'Dark mode enabled' : 'Light mode enabled');
    };

    const handleLogout = () => {
        logout();
        useSessionStore.getState().resetSession();
        navigate('/login');
        toast.success('Logged out successfully');
    };

    return (
        <Command.Dialog
            open={open}
            onOpenChange={setOpen}
            label="Global Command Menu"
            className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh] bg-black/50 backdrop-blur-sm"
        >
            <div className="w-full max-w-[640px] rounded-xl border bg-white dark:bg-slate-900 shadow-2xl overflow-hidden animate-in fade-in-0 zoom-in-95">
                <Command.Input
                    placeholder="Type a command or search..."
                    className="w-full px-4 py-3 text-base border-b outline-none bg-transparent placeholder:text-slate-400"
                    autoFocus
                />
                <Command.List className="max-h-[400px] overflow-y-auto p-2">
                    <Command.Empty className="py-6 text-center text-sm text-slate-500">
                        No results found.
                    </Command.Empty>

                    {/* Workspaces */}
                    <Command.Group heading="Switch Workspace" className="px-2 py-1.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                        {workspaces?.map((ws) => (
                            <Command.Item
                                key={ws.id}
                                value={`workspace ${ws.title}`}
                                onSelect={() =>
                                    runCommand(() => {
                                        setActiveWorkspace(ws.id);
                                        toast.success(`Switched to ${ws.title}`);
                                    })
                                }
                                className="flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 data-[selected=true]:bg-slate-100 dark:data-[selected=true]:bg-slate-800"
                            >
                                <Briefcase className="h-4 w-4 text-slate-400" />
                                <span>{ws.title}</span>
                                {ws.id === activeWorkspaceId && (
                                    <span className="ml-auto text-xs text-slate-400">Active</span>
                                )}
                            </Command.Item>
                        ))}
                    </Command.Group>

                    {/* Studies (Filtered) */}
                    <Command.Group heading="Switch Study" className="px-2 py-1.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                        {filteredStudies?.map((study) => (
                            <Command.Item
                                key={study.slug}
                                value={`study ${study.slug}`}
                                onSelect={() =>
                                    runCommand(() => {
                                        setActiveStudy(study.slug);
                                        navigate(`/admin/studies/${study.slug}`);
                                    })
                                }
                                className="flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 data-[selected=true]:bg-slate-100 dark:data-[selected=true]:bg-slate-800"
                            >
                                <FileText className="h-4 w-4 text-slate-400" />
                                <span>{study.slug}</span>
                                {study.slug === activeStudyId && (
                                    <span className="ml-auto text-xs text-slate-400">Active</span>
                                )}
                            </Command.Item>
                        ))}
                        {(!filteredStudies || filteredStudies.length === 0) && (
                            <div className="px-4 py-2 text-sm text-slate-500">No studies in this workspace.</div>
                        )}
                    </Command.Group>

                    {/* Contextual Actions (only when study is active) */}
                    {activeStudyId && (
                        <Command.Group
                            heading="Study Actions"
                            className="px-2 py-1.5 text-xs font-semibold text-slate-500 uppercase tracking-wider"
                        >
                            <Command.Item
                                value="overview dashboard"
                                onSelect={() =>
                                    runCommand(() => navigate(`/admin/studies/${activeStudyId}`))
                                }
                                className="flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 data-[selected=true]:bg-slate-100 dark:data-[selected=true]:bg-slate-800"
                            >
                                <LayoutDashboard className="h-4 w-4 text-indigo-500" />
                                <span>Open Overview</span>
                            </Command.Item>
                            <Command.Item
                                value="design study"
                                onSelect={() =>
                                    runCommand(() =>
                                        navigate(`/admin/studies/${activeStudyId}/design`)
                                    )
                                }
                                className="flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 data-[selected=true]:bg-slate-100 dark:data-[selected=true]:bg-slate-800"
                            >
                                <PencilRuler className="h-4 w-4 text-emerald-500" />
                                <span>Open Designer</span>
                            </Command.Item>
                            <Command.Item
                                value="team management invite"
                                onSelect={() =>
                                    runCommand(() =>
                                        navigate(`/admin/studies/${activeStudyId}/team`)
                                    )
                                }
                                className="flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 data-[selected=true]:bg-slate-100 dark:data-[selected=true]:bg-slate-800"
                            >
                                <Users className="h-4 w-4 text-amber-500" />
                                <span>Team Management</span>
                            </Command.Item>
                            <Command.Item
                                value="copy share link"
                                onSelect={() => runCommand(handleCopyLink)}
                                className="flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 data-[selected=true]:bg-slate-100 dark:data-[selected=true]:bg-slate-800"
                            >
                                <Copy className="h-4 w-4 text-sky-500" />
                                <span>Copy Public Link</span>
                            </Command.Item>
                        </Command.Group>
                    )}

                    {/* System Actions */}
                    <Command.Group
                        heading="System"
                        className="px-2 py-1.5 text-xs font-semibold text-slate-500 uppercase tracking-wider"
                    >
                        <Command.Item
                            value="theme toggle dark light"
                            onSelect={() => runCommand(handleThemeToggle)}
                            className="flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 data-[selected=true]:bg-slate-100 dark:data-[selected=true]:bg-slate-800"
                        >
                            <Sun className="h-4 w-4 text-amber-500 dark:hidden" />
                            <Moon className="h-4 w-4 text-indigo-400 hidden dark:block" />
                            <span>Toggle Theme</span>
                        </Command.Item>
                        <Command.Item
                            value="logout sign out"
                            onSelect={() => runCommand(handleLogout)}
                            className="flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 data-[selected=true]:bg-slate-100 dark:data-[selected=true]:bg-slate-800"
                        >
                            <LogOut className="h-4 w-4 text-red-500" />
                            <span>Logout</span>
                        </Command.Item>
                    </Command.Group>
                </Command.List>

                <div className="border-t px-4 py-2 flex items-center justify-between text-xs text-slate-400">
                    <div className="flex items-center gap-2">
                        <Search className="h-3 w-3" />
                        <span>Search or run commands</span>
                    </div>
                    <div className="flex items-center gap-1">
                        <kbd className="px-1.5 py-0.5 bg-slate-100 dark:bg-slate-800 rounded text-[10px] font-mono">
                            ⌘K
                        </kbd>
                        <span>to open</span>
                    </div>
                </div>
            </div>
        </Command.Dialog>
    );
};
