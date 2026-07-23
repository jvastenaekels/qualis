import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useState } from 'react';
import { parseApiErrorSync, resolveApiErrorKey } from '@/lib/error-utils';
import { Briefcase, Plus, Save, ArrowLeft, Globe } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { getListProjectsApiAdminProjectsGetQueryKey } from '@/api/generated';

import { Button } from '@/components/ui/button';
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
    FormDescription,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StudyPageHeader } from '@/components/admin/layout/StudyPageHeader';
import { createProjectApiAdminProjectsPost } from '@/api/generated';
import { useAuthStore } from '@/store/useAuthStore';
import type { ProjectWithRole } from '@/api/model/projectWithRole';

const schema = z.object({
    title: z.string().min(3, 'Title must be at least 3 characters'),
    slug: z
        .string()
        .min(3, 'Slug must be at least 3 characters')
        .regex(/^[a-z0-9-]+$/, 'Slug must only contain lowercase letters, numbers, and hyphens'),
});

export default function CreateProjectPage() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { setCurrentProject, setProjects, projects } = useAuthStore();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const queryClient = useQueryClient();

    const form = useForm<z.infer<typeof schema>>({
        resolver: zodResolver(schema),
        defaultValues: {
            title: '',
            slug: '',
        },
    });

    // Auto-generate slug from title
    const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const title = e.target.value;
        form.setValue('title', title);

        if (!form.formState.dirtyFields.slug) {
            const slug = title
                .toLowerCase()
                .trim()
                .replace(/[^a-z0-9]+/g, '-')
                .replace(/^-+|-+$/g, '');
            form.setValue('slug', slug);
        }
    };

    const onSubmit = async (data: z.infer<typeof schema>) => {
        setIsSubmitting(true);
        try {
            const newProject = (await createProjectApiAdminProjectsPost(data)) as ProjectWithRole;

            // Allow immediate access by adding to store
            // Note: backend response might not include user_role because we just created it.
            // But our updated backend Create returns ProjectRead.
            // We know current user is owner.
            if (!newProject.user_role) {
                newProject.user_role = 'owner';
            }

            setProjects([...projects, newProject]);
            setCurrentProject(newProject);

            // Invalidate React Query list to ensure Sidebar/Switcher are updated
            await queryClient.invalidateQueries({
                queryKey: getListProjectsApiAdminProjectsGetQueryKey(),
            });

            toast.success(t('admin.project.create.success'));
            // Land on the dashboard, where the "First steps" onboarding
            // checklist lives — not on Settings, which stranded the new
            // researcher away from the next actions.
            navigate(`/app/${newProject.slug}/dashboard`);
        } catch (error: unknown) {
            const { key, fallback } = resolveApiErrorKey(
                error as { code?: string; message?: string }
            );
            if (key) {
                toast.error(t(key, fallback));
            } else {
                const message = parseApiErrorSync(
                    error,
                    t('admin.project.create.error', 'Could not create project. Try again.')
                );
                toast.error(
                    t('admin.project.create.error', 'Could not create project. Try again.'),
                    {
                        description: message,
                    }
                );
            }
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="flex flex-1 flex-col gap-6 p-4 sm:p-8 max-w-4xl mx-auto w-full">
            <StudyPageHeader title={t('admin.project.create.title')} icon={Plus} />

            <Card className="border-none shadow-sm bg-white rounded-2xl overflow-hidden">
                <CardHeader className="border-b border-slate-50 pb-6">
                    <CardTitle className="text-lg font-black text-slate-900 flex items-center gap-2">
                        <Briefcase className="size-5 text-indigo-500" />
                        {t('admin.project.create.card_title')}
                    </CardTitle>
                </CardHeader>
                <CardContent className="pt-8">
                    <Form {...form}>
                        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                            <FormField
                                control={form.control}
                                name="title"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel className="text-2xs font-black text-slate-500">
                                            {t('admin.project.create.name_label')}
                                        </FormLabel>
                                        <FormControl>
                                            <Input
                                                placeholder={t(
                                                    'admin.project.create.name_placeholder'
                                                )}
                                                className="h-12 rounded-xl bg-white/50 border-slate-200 focus:bg-white transition-all shadow-sm"
                                                {...field}
                                                onChange={handleTitleChange}
                                            />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={form.control}
                                name="slug"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel className="text-2xs font-black text-slate-500">
                                            {t('admin.project.create.url_label')}
                                        </FormLabel>
                                        <FormControl>
                                            <div className="relative">
                                                <Input
                                                    placeholder={t(
                                                        'admin.project.create.url_placeholder'
                                                    )}
                                                    className="h-12 rounded-xl pl-32 bg-white/50 border-slate-200 focus:bg-white transition-all shadow-sm"
                                                    {...field}
                                                />
                                                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400 select-none border-r pr-3 mr-3 h-4 flex items-center">
                                                    /app/
                                                </div>
                                            </div>
                                        </FormControl>
                                        <FormDescription className="text-2xs italic font-medium px-1">
                                            {t('admin.project.create.url_description')}
                                        </FormDescription>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <div className="flex flex-col gap-3 pt-4">
                                <div className="flex justify-end gap-3">
                                    <Button
                                        variant="outline"
                                        type="button"
                                        className="h-11 rounded-xl px-6 border-slate-200 font-bold text-slate-600 hover:bg-slate-50"
                                        onClick={() => navigate(-1)}
                                    >
                                        <ArrowLeft className="size-4 mr-2" />
                                        {t('admin.project.create.cancel')}
                                    </Button>
                                    <Button
                                        type="submit"
                                        className="h-11 rounded-xl px-8 font-black bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm border-none"
                                        disabled={isSubmitting}
                                    >
                                        {isSubmitting ? (
                                            <>
                                                <Globe className="size-4 mr-2 animate-spin" />
                                                {t('admin.project.create.creating')}
                                            </>
                                        ) : (
                                            <>
                                                <Save className="size-4 mr-2" />
                                                {t('admin.project.create.create_button')}
                                            </>
                                        )}
                                    </Button>
                                </div>
                            </div>
                        </form>
                    </Form>
                </CardContent>
            </Card>
        </div>
    );
}
