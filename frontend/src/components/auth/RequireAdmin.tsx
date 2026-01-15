import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ShieldAlert } from 'lucide-react';
import { useListWorkspacesApiAdminWorkspacesGet } from '@/api/generated';
import { useTranslation } from 'react-i18next';

const RequireAdmin = () => {
    const { t } = useTranslation();
    const { isLoading, isAuthenticated, isAdmin } = useAuth();
    const { data: workspaces, isLoading: workspacesLoading } =
        useListWorkspacesApiAdminWorkspacesGet({
            query: {
                enabled: isAuthenticated, // Only fetch if authenticated
            },
        });
    const location = useLocation();

    // Show loading state while checking auth or workspaces
    if (isLoading || (isAuthenticated && workspacesLoading)) {
        return (
            <div className="flex flex-col space-y-3 p-8">
                <Skeleton className="h-[125px] w-full rounded-xl" />
                <div className="space-y-2">
                    <Skeleton className="h-4 w-[250px]" />
                    <Skeleton className="h-4 w-[200px]" />
                </div>
            </div>
        );
    }

    // Redirect to login if not authenticated
    if (!isAuthenticated) {
        return <Navigate to={`/login?redirect=${location.pathname}`} replace />;
    }

    // Check if user has workspace access
    const hasWorkspaceAccess = workspaces && workspaces.length > 0;

    // Allow access if user is superuser OR has at least one workspace
    if (!isAdmin && !hasWorkspaceAccess) {
        return (
            <div className="flex h-screen w-full items-center justify-center p-4">
                <Alert variant="destructive" className="max-w-md">
                    <ShieldAlert className="h-4 w-4" />
                    <AlertTitle>{t('common.errors.access_denied.title')}</AlertTitle>
                    <AlertDescription>{t('common.errors.access_denied.message')}</AlertDescription>
                </Alert>
            </div>
        );
    }

    return <Outlet />;
};

export default RequireAdmin;
