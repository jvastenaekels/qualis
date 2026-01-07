import { useState } from 'react';
import { Plus, Layout, Activity, ExternalLink } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { enUS, fr, fi } from 'date-fns/locale';
import { cn } from '@/lib/utils';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/hooks/useAuth';
import { useListStudiesApiAdminStudiesGet } from '@/api/generated';
import { CreateStudyDialog } from '@/components/admin/CreateStudyDialog';
import { useAdminStore } from '@/store/useAdminStore';
import { Skeleton } from '@/components/ui/skeleton';
import { useTranslation } from 'react-i18next';

export function AdminDashboard() {
    const { user } = useAuth();
    const navigate = useNavigate();
    const { setActiveStudy, activeWorkspaceId } = useAdminStore();
    const [showCreateDialog, setShowCreateDialog] = useState(false);
    const { data: allStudies, isLoading } = useListStudiesApiAdminStudiesGet();
    const { t, i18n } = useTranslation();
    // biome-ignore lint/suspicious/noExplicitAny: date locales from date-fns
    const dateLocales: Record<string, any> = {
        en: enUS,
        fr: fr,
        fi: fi,
    };
    const currentLocale = dateLocales[i18n.language] || enUS;

    const studies = allStudies?.filter((s) => s.workspace_id === activeWorkspaceId);

    const activeStudiesCount = studies?.filter((s) => s.state === 'active').length || 0;
    const _totalStudies = studies?.length || 0;

    const handleOpenStudy = (slug: string) => {
        setActiveStudy(slug);
        navigate(`/admin/studies/${slug}`);
    };

    if (isLoading) {
        return (
            <div className="p-8">
                <Skeleton className="h-[400px] w-full" />
            </div>
        );
    }

    return (
        <div className="flex flex-1 flex-col gap-6 md:gap-10 p-4 md:p-8 max-w-[1600px] mx-auto animate-in fade-in-50 duration-500">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div className="space-y-1">
                    <h1 className="text-3xl md:text-5xl font-black tracking-tighter bg-gradient-to-br from-slate-950 via-slate-800 to-indigo-900 bg-clip-text text-transparent">
                        {t('admin.dashboard.title')}
                    </h1>
                    <p className="text-sm md:text-lg text-muted-foreground/80 font-medium">
                        {t('admin.dashboard.welcome')}{' '}
                        <span className="text-indigo-600 font-bold">
                            {user?.email.split('@')[0]}
                        </span>
                        . {t('admin.dashboard.snapshot')}
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Button
                        onClick={() => setShowCreateDialog(true)}
                        size="lg"
                        className="w-full md:w-auto shadow-xl shadow-indigo-500/10 hover:shadow-indigo-500/20 transition-all duration-300 hover:-translate-y-0.5"
                    >
                        <Plus className="mr-2 h-5 w-5" /> {t('admin.dashboard.create_study')}
                    </Button>
                </div>
            </div>

            {/* Stats Overview */}
            <div className="grid gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                <Card className="hover:shadow-xl transition-all duration-300 border border-emerald-500/10 shadow-lg bg-white/40 backdrop-blur-xl group overflow-hidden">
                    <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 rounded-full -mr-8 -mt-8 transition-transform group-hover:scale-150 duration-500" />
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 relative">
                        <CardTitle className="text-[10px] font-bold uppercase text-slate-500 tracking-[0.2em]">
                            {t('admin.dashboard.active_data_collection')}
                        </CardTitle>
                        <Activity className="h-4 w-4 text-emerald-500" />
                    </CardHeader>
                    <CardContent className="relative pt-4">
                        <div className="text-3xl font-black text-emerald-600">
                            {activeStudiesCount}
                        </div>
                        <p className="text-[10px] font-semibold text-slate-500 mt-1 uppercase tracking-wider">
                            {t('admin.dashboard.receiving_responses')}
                        </p>
                    </CardContent>
                </Card>
                {/* Other specialized metrics could go here */}
            </div>

            {/* Recent Studies */}
            <Card className="col-span-4 border border-white/20 shadow-xl bg-white/40 backdrop-blur-xl">
                <CardHeader className="pb-4">
                    <CardTitle className="text-xl font-bold">
                        {t('admin.dashboard.recent_studies')}
                    </CardTitle>
                    <CardDescription className="text-sm font-medium">
                        {t('admin.dashboard.recent_description')}
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {studies && studies.length > 0 ? (
                        <div className="space-y-3">
                            {studies.slice(0, 5).map((study) => (
                                <div
                                    key={study.id}
                                    role="button"
                                    tabIndex={0}
                                    className="flex items-center justify-between p-4 rounded-xl border border-transparent hover:border-indigo-500/20 hover:bg-white/60 hover:shadow-md transition-all duration-200 cursor-pointer group"
                                    onClick={() => handleOpenStudy(study.slug)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' || e.key === ' ') {
                                            handleOpenStudy(study.slug);
                                        }
                                    }}
                                >
                                    <div className="flex items-center gap-5">
                                        <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-indigo-500/10 to-purple-500/10 border border-indigo-500/10 flex items-center justify-center text-indigo-600 font-black tracking-tighter text-lg shadow-inner group-hover:scale-110 transition-transform duration-300">
                                            {study.slug.substring(0, 1).toUpperCase()}
                                        </div>
                                        <div>
                                            <p className="font-bold text-slate-900 group-hover:text-indigo-600 transition-colors">
                                                {study.slug}
                                            </p>
                                            <p className="text-xs font-semibold text-slate-500 uppercase tracking-tighter mt-0.5">
                                                {t('admin.dashboard.created')}{' '}
                                                {formatDistanceToNow(new Date(study.created_at), {
                                                    addSuffix: true,
                                                    locale: currentLocale,
                                                })}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-6">
                                        <div
                                            className={cn(
                                                'px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider shadow-sm',
                                                study.state === 'active'
                                                    ? 'bg-emerald-50 text-emerald-600 border border-emerald-100 ring-2 ring-emerald-500/20 animate-pulse-slow'
                                                    : 'bg-slate-50 text-slate-500 border border-slate-100'
                                            )}
                                        >
                                            {study.state}
                                        </div>
                                        <div className="bg-slate-50 p-2 rounded-lg group-hover:bg-indigo-50 transition-colors">
                                            <ExternalLink className="h-4 w-4 text-slate-400 group-hover:text-indigo-500 transition-colors" />
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="text-center py-20 bg-slate-50/50 rounded-2xl border border-dashed border-slate-200">
                            <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 mb-4">
                                <Layout className="h-6 w-6 text-slate-400" />
                            </div>
                            <p className="text-sm font-semibold text-slate-500">
                                {t('admin.dashboard.no_studies')}
                            </p>
                        </div>
                    )}
                </CardContent>
            </Card>

            <CreateStudyDialog open={showCreateDialog} onOpenChange={setShowCreateDialog} />
        </div>
    );
}
