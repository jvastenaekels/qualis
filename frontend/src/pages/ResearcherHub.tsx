/*
 * Qualis - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

import { ArrowRight, Briefcase, Plus, Users } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/store/useAuthStore';
import { useAdminStore } from '@/store/useAdminStore';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';
import { useListStudiesApiAdminStudiesGet } from '@/api/generated';

export default function ResearcherHub() {
    const { projects, user } = useAuthStore();
    const { setActiveStudy, setActiveProject } = useAdminStore();
    const navigate = useNavigate();
    const { t, i18n } = useTranslation();

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

    function getStudyTitle(study: NonNullable<typeof allStudies>[number]): string {
        const translation = study.translations?.find((tr) => tr.language_code === i18n.language);
        if (translation?.title) return translation.title;
        const fallback = study.translations?.find((tr) => tr.language_code === 'en');
        if (fallback?.title) return fallback.title;
        const anyTranslation = study.translations?.find((tr) => tr.title);
        if (anyTranslation?.title) return anyTranslation.title;
        return study.slug;
    }

    return (
        <div className="min-h-screen bg-gray-50/50">
            {/* Header */}
            <div className="bg-white border-b">
                <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6">
                    <div className="flex items-center justify-between">
                        <div>
                            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
                                {t('admin.hub.title', 'Researcher Hub')}
                            </h1>
                            <p className="text-sm text-muted-foreground mt-0.5">
                                {user?.full_name || user?.email}
                            </p>
                        </div>
                        <Button size="sm" onClick={() => navigate('/app/projects/new')}>
                            <Plus className="h-3.5 w-3.5 mr-2" />
                            {t('admin.hub.new_project', 'New Project')}
                        </Button>
                    </div>
                </div>
            </div>

            {/* Content */}
            <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 space-y-4">
                {projects?.map((project) => {
                    const projectStudies =
                        allStudies?.filter((s) => s.project_id === project.id) ?? [];
                    const activeStudies = projectStudies.filter((s) => s.state === 'active');
                    const totalParticipants = projectStudies.reduce(
                        (sum, s) => sum + (s.participant_count ?? 0),
                        0
                    );

                    return (
                        <Card
                            key={project.id}
                            className="group hover:border-foreground/20 transition-colors cursor-pointer overflow-hidden"
                            onClick={() => handleProjectClick(project.slug, project.id)}
                        >
                            <CardContent className="p-0">
                                {/* Project header */}
                                <div className="flex items-center gap-3 px-5 pt-4 pb-3">
                                    <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-indigo-500 to-indigo-700 flex items-center justify-center text-white shrink-0">
                                        <Briefcase className="h-4 w-4" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <h2 className="text-base font-bold truncate group-hover:text-indigo-600 transition-colors">
                                                {project.title}
                                            </h2>
                                            <Badge
                                                variant="outline"
                                                className={cn(
                                                    'text-2xs shrink-0',
                                                    project.user_role === 'owner'
                                                        ? 'bg-amber-50 text-amber-700 border-amber-200'
                                                        : 'bg-blue-50 text-blue-700 border-blue-200'
                                                )}
                                            >
                                                {t(
                                                    `admin.project.roles.${project.user_role}`,
                                                    project.user_role as string
                                                )}
                                            </Badge>
                                        </div>
                                        <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
                                            <span>
                                                {t('admin.hub.n_studies', {
                                                    count: projectStudies.length,
                                                    defaultValue: '{{count}} studies',
                                                })}
                                            </span>
                                            <span className="text-border">|</span>
                                            <span>
                                                {t('admin.hub.n_active', {
                                                    count: activeStudies.length,
                                                    defaultValue: '{{count}} active',
                                                })}
                                            </span>
                                            <span className="text-border">|</span>
                                            <span className="inline-flex items-center gap-1">
                                                <Users className="h-3 w-3" />
                                                {totalParticipants}
                                            </span>
                                        </div>
                                    </div>
                                    <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                                </div>

                                {/* Active studies */}
                                {activeStudies.length > 0 && (
                                    <div className="border-t mx-5 pt-3 pb-4 space-y-2">
                                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                                            {t('admin.hub.collecting', 'Collecting data')}
                                        </p>
                                        {activeStudies.map((study) => {
                                            const title = getStudyTitle(study);
                                            const participants = study.participant_count ?? 0;
                                            const langs = study.translations
                                                ?.map((tr) => tr.language_code.toUpperCase())
                                                .join(', ');

                                            return (
                                                <button
                                                    type="button"
                                                    key={study.id}
                                                    className="flex items-center gap-3 w-full text-left rounded-md px-2 py-1.5 -mx-2 hover:bg-slate-50 transition-colors"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleStudyClick(project.slug, study.slug);
                                                    }}
                                                >
                                                    <span className="relative flex h-2 w-2 shrink-0">
                                                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                                                        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                                                    </span>
                                                    <span className="flex-1 min-w-0 text-sm font-medium truncate">
                                                        {title}
                                                    </span>
                                                    {langs && (
                                                        <span className="text-xs text-muted-foreground shrink-0">
                                                            {langs}
                                                        </span>
                                                    )}
                                                    <span className="text-xs text-muted-foreground shrink-0 inline-flex items-center gap-1">
                                                        <Users className="h-3 w-3" />
                                                        {participants}
                                                    </span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                )}

                                {/* Empty state */}
                                {projectStudies.length === 0 && (
                                    <div className="border-t mx-5 pt-3 pb-4">
                                        <p className="text-xs text-muted-foreground">
                                            {t('admin.hub.no_studies', 'No studies yet')}
                                        </p>
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    );
                })}

                {/* Empty state: no projects */}
                {(!projects || projects.length === 0) && (
                    <div className="text-center py-16">
                        <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-muted mb-4">
                            <Briefcase className="h-6 w-6 text-muted-foreground" />
                        </div>
                        <p className="text-sm font-medium text-muted-foreground mb-4">
                            {t(
                                'admin.hub.no_projects',
                                'No projects yet. Create your first project to get started.'
                            )}
                        </p>
                        <Button onClick={() => navigate('/app/projects/new')}>
                            <Plus className="h-4 w-4 mr-2" />
                            {t('admin.hub.new_project', 'New Project')}
                        </Button>
                    </div>
                )}
            </div>
        </div>
    );
}
