/*
 * Libre-Q - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

import { Briefcase, Plus, TrendingUp } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/store/useAuthStore';
import { useAdminStore } from '@/store/useAdminStore';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';
import { useListStudiesApiAdminStudiesGet } from '@/api/generated';

/**
 * ResearcherHub
 *
 * Multi-project landing page for researchers with access to multiple projects.
 * Shows all projects and recent studies across them.
 */
export default function ResearcherHub() {
    const { projects, user } = useAuthStore();
    const { setActiveStudy, setActiveProject } = useAdminStore();
    const navigate = useNavigate();
    const { t } = useTranslation();

    const { data: allStudiesData } = useListStudiesApiAdminStudiesGet();
    const allStudies = allStudiesData?.items;

    const handleProjectClick = (projectSlug: string, projectId: number) => {
        setActiveProject(projectId);
        navigate(`/app/${projectSlug}/dashboard`);
    };

    const handleStudyClick = (projectSlug: string, studySlug: string) => {
        setActiveStudy(studySlug);
        navigate(`/app/${projectSlug}/studies/${studySlug}`);
    };

    const recentStudies = allStudies?.slice(0, 5) || [];

    return (
        <div className="min-h-screen bg-gray-50">
            {/* Header */}
            <div className="bg-white border-b">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
                    <div className="flex items-center justify-between">
                        <div>
                            <h1 className="text-3xl font-black text-slate-900">
                                {t('admin.hub.title', 'Researcher Hub')}
                            </h1>
                            <p className="text-sm text-slate-500 mt-1">
                                {t('admin.hub.welcome', 'Welcome back, ')}
                                <span className="font-semibold">{user?.email}</span>
                            </p>
                        </div>
                        <Button onClick={() => navigate('/app/projects/new')}>
                            <Plus className="h-4 w-4 mr-2" />
                            {t('admin.hub.new_project', 'New Project')}
                        </Button>
                    </div>
                </div>
            </div>

            {/* Content */}
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                {/* Projects Section */}
                <section className="mb-12">
                    <h2 className="text-xl font-bold text-slate-900 mb-4">
                        {t('admin.hub.your_projects', 'Your Projects')}
                    </h2>
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                        {projects?.map((project) => (
                            <Card
                                key={project.id}
                                className="cursor-pointer hover:shadow-lg transition-shadow duration-200"
                                onClick={() => handleProjectClick(project.slug, project.id)}
                            >
                                <CardHeader>
                                    <div className="flex items-start justify-between">
                                        <div className="flex items-center gap-3">
                                            <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-indigo-500 to-indigo-700 flex items-center justify-center text-white font-bold">
                                                <Briefcase className="h-5 w-5" />
                                            </div>
                                            <div>
                                                <CardTitle className="text-lg font-black">
                                                    {project.title}
                                                </CardTitle>
                                                <CardDescription className="text-xs">
                                                    <span
                                                        className={cn(
                                                            'px-1.5 py-0.5 rounded text-2xs font-semibold',
                                                            project.user_role === 'owner'
                                                                ? 'bg-amber-100 text-amber-700'
                                                                : 'bg-blue-100 text-blue-700'
                                                        )}
                                                    >
                                                        {t(
                                                            `admin.roles.${project.user_role}`,
                                                            project.user_role as string
                                                        )}
                                                    </span>
                                                </CardDescription>
                                            </div>
                                        </div>
                                    </div>
                                </CardHeader>
                                <CardContent>
                                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                        <TrendingUp className="h-4 w-4" />
                                        <span>
                                            {allStudies?.filter((s) => s.project_id === project.id)
                                                .length || 0}{' '}
                                            {t('admin.hub.studies_count', 'studies')}
                                        </span>
                                    </div>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                </section>

                {/* Recent Studies */}
                {recentStudies.length > 0 && (
                    <section>
                        <h2 className="text-xl font-bold text-slate-900 mb-4">
                            {t('admin.hub.recent_studies', 'Recent Studies')}
                        </h2>
                        <div className="bg-white rounded-lg shadow">
                            {recentStudies.map((study, index) => {
                                const project = projects?.find((w) => w.id === study.project_id);
                                return (
                                    <div
                                        key={study.id}
                                        role="button"
                                        tabIndex={0}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter' || e.key === ' ') {
                                                project &&
                                                    handleStudyClick(project.slug, study.slug);
                                            }
                                        }}
                                        className={cn(
                                            'flex items-center justify-between p-4 cursor-pointer hover:bg-gray-50 transition-colors',
                                            index !== recentStudies.length - 1 && 'border-b'
                                        )}
                                        onClick={() =>
                                            project && handleStudyClick(project.slug, study.slug)
                                        }
                                    >
                                        <div>
                                            <p className="font-semibold text-slate-900">
                                                {study.translations?.[0]?.title || study.slug}
                                            </p>
                                            <p className="text-sm text-slate-500">
                                                {project?.title}
                                            </p>
                                        </div>
                                        <div
                                            className={cn(
                                                'px-2 py-1 rounded text-xs font-semibold',
                                                study.state === 'active'
                                                    ? 'bg-emerald-100 text-emerald-700'
                                                    : 'bg-slate-100 text-slate-600'
                                            )}
                                        >
                                            {t(
                                                `admin.project.study_states.${study.state}`,
                                                study.state as string
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </section>
                )}
            </div>
        </div>
    );
}
