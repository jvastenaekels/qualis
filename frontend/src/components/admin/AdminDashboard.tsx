import { useState } from 'react';
import { Plus, Layout, Users, Activity, ExternalLink } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';

import { Button } from '@/components/ui/button';
import {
    Card,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';
import { useAuth } from '@/hooks/useAuth';
import { useListStudiesApiAdminStudiesGet } from '@/api/generated';
import { CreateStudyDialog } from '@/components/admin/CreateStudyDialog';
import { useAdminStore } from '@/store/useAdminStore';
import { Skeleton } from '@/components/ui/skeleton';

export function AdminDashboard() {
    const { user } = useAuth();
    const navigate = useNavigate();
    const { setActiveStudy, activeWorkspaceId } = useAdminStore();
    const [showCreateDialog, setShowCreateDialog] = useState(false);
    const { data: allStudies, isLoading } = useListStudiesApiAdminStudiesGet();

    const studies = allStudies?.filter(s => s.workspace_id === activeWorkspaceId);

    const activeStudiesCount = studies?.filter((s) => s.state === 'active').length || 0;
    const totalStudies = studies?.length || 0;

    const handleOpenStudy = (slug: string) => {
        setActiveStudy(slug);
        navigate(`/admin/studies/${slug}`);
    };

    if (isLoading) {
        return <div className="p-8"><Skeleton className="h-[400px] w-full" /></div>;
    }

    return (
        <div className="flex flex-1 flex-col gap-10 p-8 max-w-[1600px] mx-auto animate-in fade-in-50 duration-500">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
                    <p className="text-muted-foreground mt-2">
                        Welcome back, {user?.email}. Here's what's happening in your workspace.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Button onClick={() => setShowCreateDialog(true)}>
                        <Plus className="mr-2 h-4 w-4" /> Create Study
                    </Button>
                </div>
            </div>

            {/* Stats Overview */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Studies</CardTitle>
                        <Layout className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{totalStudies}</div>
                        <p className="text-xs text-muted-foreground">
                            Across all statuses
                        </p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Active Fieldwork</CardTitle>
                        <Activity className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{activeStudiesCount}</div>
                        <p className="text-xs text-muted-foreground">
                            Studies currently collecting data
                        </p>
                    </CardContent>
                </Card>
            </div>

            {/* Recent Studies */}
            <Card className="col-span-4">
                <CardHeader>
                    <CardTitle>Recent Studies</CardTitle>
                    <CardDescription>
                        A list of your most recently updated studies.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {studies && studies.length > 0 ? (
                        <div className="space-y-4">
                            {studies.slice(0, 5).map((study) => (
                                <div
                                    key={study.id}
                                    className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors cursor-pointer group"
                                    onClick={() => handleOpenStudy(study.slug)}
                                >
                                    <div className="flex items-center gap-4">
                                        <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">
                                            {study.slug.substring(0, 2).toUpperCase()}
                                        </div>
                                        <div>
                                            <p className="font-medium group-hover:text-primary transition-colors">
                                                {study.slug}
                                            </p>
                                            <p className="text-sm text-muted-foreground">
                                                Created {formatDistanceToNow(new Date(study.created_at), { addSuffix: true })}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-4">
                                        <div className={`px-2 py-1 rounded-full text-xs font-medium ${
                                            study.state === 'active' 
                                                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400'
                                                : 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-400'
                                        }`}>
                                            {study.state}
                                        </div>
                                        <ExternalLink className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="text-center py-12 text-muted-foreground">
                            No studies found. Create your first study to get started!
                        </div>
                    )}
                </CardContent>
            </Card>

            <CreateStudyDialog open={showCreateDialog} onOpenChange={setShowCreateDialog} />
        </div>
    );
}
