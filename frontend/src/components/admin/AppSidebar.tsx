import {
    BadgeCheck,
    ChevronsUpDown,
    Database,
    LayoutDashboard,
    LogOut,
    PencilRuler,
    Send,
    SquareTerminal,
    Users,
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
    SidebarGroupLabel,
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

// biome-ignore lint/suspicious/noExplicitAny: mock user
function NavUser({ user }: { user: any }) {
    const logout = useAuthStore((state) => state.logout);
    const navigate = useNavigate();

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
                                Profile
                            </DropdownMenuItem>
                        </DropdownMenuGroup>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onSelect={handleLogout}>
                            <LogOut className="mr-2 h-4 w-4" />
                            Log out
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </SidebarMenuItem>
        </SidebarMenu>
    );
}

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
    const { activeStudyId } = useAdminStore();
    const { user } = useAuth();
    const location = useLocation();

    const navMain = activeStudyId
        ? [
              {
                  title: 'Navigation',
                  url: '#',
                  icon: SquareTerminal,
                  isActive: true,
                  items: [
                      {
                          title: 'Study dashboard',
                          url: `/admin/studies/${activeStudyId}`,
                          icon: LayoutDashboard,
                      },
                      {
                          title: 'Collaborators',
                          url: `/admin/studies/${activeStudyId}/team`,
                          icon: Users,
                      },
                      {
                          title: 'Study design',
                          url: `/admin/studies/${activeStudyId}/design`,
                          icon: PencilRuler,
                      },
                      {
                          title: 'Recruitment',
                          url: `/admin/studies/${activeStudyId}/recruitment`,
                          icon: Send, // Placeholder
                          badge: 'Coming Soon',
                      },
                      {
                          title: 'Data & analytics',
                          url: `/admin/studies/${activeStudyId}/exports`,
                          icon: Database,
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
                {activeStudyId ? (
                    <SidebarGroup>
                        <SidebarGroupLabel>Study Management</SidebarGroupLabel>
                        <SidebarMenu>
                            {navMain[0].items.map((item) => (
                                <SidebarMenuItem key={item.title}>
                                    <SidebarMenuButton
                                        asChild
                                        isActive={location.pathname === item.url}
                                    >
                                        <Link to={item.url}>
                                            <item.icon />
                                            <span>{item.title}</span>
                                            {item.badge && (
                                                <span className="ml-auto text-[9px] font-bold uppercase py-0.5 px-1.5 rounded-full bg-slate-100 text-slate-500 ring-1 ring-slate-200">
                                                    {item.badge}
                                                </span>
                                            )}
                                        </Link>
                                    </SidebarMenuButton>
                                </SidebarMenuItem>
                            ))}
                        </SidebarMenu>
                    </SidebarGroup>
                ) : (
                    <div className="p-4 text-sm text-muted-foreground text-center">
                        Please select or create a study to begin.
                    </div>
                )}
            </SidebarContent>
            <SidebarFooter>
                <NavUser user={user} />
            </SidebarFooter>
        </Sidebar>
    );
}
