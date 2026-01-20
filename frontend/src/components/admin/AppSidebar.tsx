import {
    BadgeCheck,
    ChevronsUpDown,
    Globe,
    LayoutDashboard,
    LogOut,
    PencilRuler,
    Search,
    Settings,
    UserPlus,
    Download,
} from 'lucide-react';
import { StudySwitcher } from './StudySwitcher';
import { WorkspaceSwitcher } from './WorkspaceSwitcher';
import {
    Sidebar,
    SidebarContent,
    SidebarFooter,
    SidebarHeader,
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
    SidebarGroup,
} from '@/components/ui/sidebar';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuGroup,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAdminStore } from '@/store/useAdminStore';
import { useAuthStore } from '@/store/useAuthStore';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

function NavLanguage() {
    const { i18n, t } = useTranslation();
    const currentLang = i18n.language;

    const languages = [
        { code: 'en', label: 'EN', flag: '🇬🇧' },
        { code: 'fr', label: 'FR', flag: '🇫🇷' },
        { code: 'fi', label: 'FI', flag: '🇫🇮' },
    ];

    return (
        <SidebarMenu>
            <SidebarMenuItem>
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <SidebarMenuButton size="sm" className="text-muted-foreground">
                            <Globe className="size-4" />
                            <span>
                                {languages.find((l) => l.code === currentLang)?.label || 'Language'}
                            </span>
                            <ChevronsUpDown className="ml-auto size-3" />
                        </SidebarMenuButton>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-40 rounded-lg">
                        <DropdownMenuLabel className="text-xs font-semibold text-muted-foreground/70">
                            {t('layout.change_lang_title')}
                        </DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        {languages.map((lang) => (
                            <DropdownMenuItem
                                key={lang.code}
                                onSelect={() => i18n.changeLanguage(lang.code)}
                                className={cn(
                                    'flex items-center gap-2 cursor-pointer',
                                    currentLang === lang.code && 'bg-accent text-accent-foreground'
                                )}
                            >
                                <span className="text-sm">{lang.flag}</span>
                                <span className="text-sm">{lang.label}</span>
                            </DropdownMenuItem>
                        ))}
                    </DropdownMenuContent>
                </DropdownMenu>
            </SidebarMenuItem>
        </SidebarMenu>
    );
}

// biome-ignore lint/suspicious/noExplicitAny: mock user
function NavUser({ user }: { user: any }) {
    const logout = useAuthStore((state) => state.logout);
    const navigate = useNavigate();
    const { t } = useTranslation();

    const handleLogout = () => {
        logout();
        navigate('/login');
    };

    return (
        <SidebarMenu>
            <SidebarMenuItem>
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <SidebarMenuButton
                            size="lg"
                            className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                        >
                            <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-indigo-600 text-white font-bold">
                                {user?.full_name
                                    ? user.full_name.substring(0, 2).toUpperCase()
                                    : user?.email?.substring(0, 2).toUpperCase()}
                            </div>
                            <div className="grid flex-1 text-left text-sm leading-tight">
                                <span className="truncate font-semibold">
                                    {user?.full_name || 'Admin User'}
                                </span>
                                <span className="truncate text-xs">{user?.email}</span>
                            </div>
                            <ChevronsUpDown className="ml-auto size-4" />
                        </SidebarMenuButton>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                        className="w-[--radix-dropdown-menu-trigger-width] min-w-56 rounded-lg"
                        side="bottom"
                        align="end"
                        sideOffset={4}
                    >
                        <DropdownMenuLabel className="p-0 font-normal">
                            <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                                <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-indigo-600 text-white font-bold">
                                    {user?.full_name
                                        ? user.full_name.substring(0, 2).toUpperCase()
                                        : user?.email?.substring(0, 2).toUpperCase()}
                                </div>
                                <div className="grid flex-1 text-left text-sm leading-tight">
                                    <span className="truncate font-semibold">
                                        {user?.full_name || 'Admin User'}
                                    </span>
                                    <span className="truncate text-xs">{user?.email}</span>
                                </div>
                            </div>
                        </DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        <DropdownMenuGroup>
                            <DropdownMenuItem onSelect={() => navigate('/admin/profile')}>
                                <BadgeCheck className="mr-2 h-4 w-4" />
                                {t('admin.layout.profile', 'Profile')}
                            </DropdownMenuItem>
                        </DropdownMenuGroup>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onSelect={handleLogout}>
                            <LogOut className="mr-2 h-4 w-4" />
                            {t('admin.layout.logout')}
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </SidebarMenuItem>
        </SidebarMenu>
    );
}

import { useListStudiesApiAdminStudiesGet } from '@/api/generated';

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
    const { activeStudyId, activeWorkspaceId } = useAdminStore();
    const { user } = useAuth();
    const location = useLocation();
    const { t } = useTranslation();

    const { data: studies } = useListStudiesApiAdminStudiesGet({
        query: {
            enabled: !!activeWorkspaceId,
        },
    });
    const isValidStudy =
        activeStudyId &&
        studies?.some((s) => s.slug === activeStudyId && s.workspace_id === activeWorkspaceId);

    const navMain = isValidStudy
        ? [
              {
                  title: 'Navigation',
                  url: '#',
                  isActive: true, // We don't use the icon/active state of the group itself anymore
                  items: [
                      {
                          title: t('admin.sidebar.dashboard'),
                          url: `/admin/studies/${activeStudyId}`,
                          icon: LayoutDashboard,
                      },
                      {
                          title: t('admin.sidebar.design'),
                          url: `/admin/studies/${activeStudyId}/design`,
                          icon: PencilRuler,
                      },
                      {
                          title: t('admin.sidebar.recruit'),
                          url: `/admin/studies/${activeStudyId}/recruitment`,
                          icon: UserPlus,
                      },
                      {
                          title: t('admin.sidebar.data'),
                          url: `/admin/studies/${activeStudyId}/exports`,
                          icon: Download,
                      },
                      {
                          title: t('admin.sidebar.settings'),
                          url: `/admin/studies/${activeStudyId}/settings`,
                          icon: Settings,
                      },
                  ],
              },
          ]
        : [];

    return (
        <Sidebar variant="inset" {...props}>
            <SidebarHeader>
                <WorkspaceSwitcher />
                <StudySwitcher />
            </SidebarHeader>
            <SidebarContent>
                {isValidStudy ? (
                    <SidebarGroup>
                        <SidebarMenu>
                            <SidebarMenuItem className="px-2 mb-4">
                                <SidebarMenuButton
                                    size="sm"
                                    className="bg-muted/50 hover:bg-muted border border-border/50 text-muted-foreground transition-all duration-200"
                                    onClick={() => {
                                        window.dispatchEvent(new CustomEvent('open-command-menu'));
                                    }}
                                >
                                    <Search className="size-3.5 mr-2" />
                                    <span className="text-xs">{t('admin.sidebar.search')}</span>
                                    <kbd className="ml-auto pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-background px-1.5 font-mono text-[10px] font-medium text-muted-foreground opacity-100">
                                        <span className="text-xs">⌘</span>K
                                    </kbd>
                                </SidebarMenuButton>
                            </SidebarMenuItem>
                        </SidebarMenu>

                        {/* Remove redundant 'Gestion' label as per plan 5.1 */}
                        {/* <SidebarGroupLabel className="px-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70 mb-2">
                            {t('admin.sidebar.study_management')}
                        </SidebarGroupLabel> */}
                        <SidebarMenu>
                            {navMain.map((group) =>
                                group.items.map((item) => (
                                    <SidebarMenuItem key={item.title}>
                                        <SidebarMenuButton
                                            asChild
                                            isActive={location.pathname === item.url}
                                        >
                                            <Link to={item.url}>
                                                <item.icon />
                                                <span>{item.title}</span>
                                            </Link>
                                        </SidebarMenuButton>
                                    </SidebarMenuItem>
                                ))
                            )}
                        </SidebarMenu>
                    </SidebarGroup>
                ) : (
                    <div className="p-4 text-sm text-muted-foreground text-center">
                        {t(
                            'admin.sidebar.select_study_msg',
                            'Please select or create a study to begin.'
                        )}
                    </div>
                )}
            </SidebarContent>
            <SidebarFooter className="gap-2">
                <NavLanguage />
                <NavUser user={user} />
            </SidebarFooter>
        </Sidebar>
    );
}
