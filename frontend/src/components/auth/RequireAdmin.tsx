import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ShieldAlert } from 'lucide-react';

const RequireAdmin = () => {
    const { isLoading, isAuthenticated, isAdmin } = useAuth();
    const location = useLocation();

    if (isLoading) {
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

    if (!isAuthenticated) {
        return <Navigate to={`/login?redirect=${location.pathname}`} replace />;
    }

    if (!isAdmin) {
        return (
            <div className="flex h-screen w-full items-center justify-center p-4">
                <Alert variant="destructive" className="max-w-md">
                    <ShieldAlert className="h-4 w-4" />
                    <AlertTitle>Access Denied</AlertTitle>
                    <AlertDescription>
                        You do not have permission to access the admin area. Please contact your
                        administrator.
                    </AlertDescription>
                </Alert>
            </div>
        );
    }

    return <Outlet />;
};

export default RequireAdmin;
