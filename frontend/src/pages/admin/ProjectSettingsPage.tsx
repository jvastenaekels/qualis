import { Briefcase, Settings, Save, Globe } from 'lucide-react';
import { useLoaderData, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
    Form,
    FormControl,
    FormDescription,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import * as z from 'zod';
import { StudyPageHeader } from '@/components/admin/layout/StudyPageHeader';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuthStore } from '@/store/useAuthStore';
import {
    useGetProjectApiAdminProjectsSlugGet,
    useListProjectMembersApiAdminProjectsSlugMembersGet,
    useUpdateProjectApiAdminProjectsSlugPatch,
} from '@/api/generated';
import { parseApiErrorSync } from '@/lib/error-utils';
import { getListProjectsApiAdminProjectsGetQueryKey } from '@/api/generated';
import { useQueryClient } from '@tanstack/react-query';

const projectSchema = z.object({
    title: z.string().min(1, 'Title is required').max(50),
    slug: z
        .string()
        .min(3)
        .max(50)
        .regex(/^[a-z0-9-]+$/, 'Slug must be lowercase alphanumeric with hyphens'),
});

type ProjectFormValues = z.infer<typeof projectSchema>;

export default function ProjectSettingsPage() {
    const { slug } = useLoaderData() as { slug: string };
    const navigate = useNavigate();
    const { t } = useTranslation();
    const { user: currentUser } = useAuthStore();
    const queryClient = useQueryClient();

    const { data: project, isLoading: isProjectLoading } =
        useGetProjectApiAdminProjectsSlugGet(slug);

    const { data: membersData } = useListProjectMembersApiAdminProjectsSlugMembersGet(slug);
    const members = membersData?.items;

    const updateProjectMutation = useUpdateProjectApiAdminProjectsSlugPatch();

    const form = useForm<ProjectFormValues>({
        resolver: zodResolver(projectSchema),
        defaultValues: {
            title: '',
            slug: '',
        },
    });

    useEffect(() => {
        if (project) {
            form.reset({
                title: project.title,
                slug: project.slug,
            });
        }
    }, [form, project]);

    async function onUpdateProject(data: ProjectFormValues) {
        try {
            await updateProjectMutation.mutateAsync({
                slug,
                data: {
                    title: data.title,
                    slug: data.slug,
                },
            });
            toast.success(t('admin.projects.settings.general.save_success'));

            await queryClient.invalidateQueries({
                queryKey: getListProjectsApiAdminProjectsGetQueryKey(),
            });

            if (data.slug !== slug) {
                navigate(`/app/${data.slug}/settings`);
            }
        } catch (err) {
            toast.error(parseApiErrorSync(err, t('admin.projects.settings.general.save_error')));
        }
    }

    if (isProjectLoading) {
        return (
            <div className="p-8">
                <Skeleton className="h-12 w-1/3 mb-6" />
                <Skeleton className="h-64 w-full" />
            </div>
        );
    }

    if (!project)
        return <div className="p-8 text-center text-slate-500">{t('common.errors.not_found')}</div>;

    // biome-ignore lint/suspicious/noExplicitAny: API type inference issue
    const userInProject = members?.find((m: any) => m.user_id === currentUser?.id);
    const isAdmin = userInProject?.role === 'owner';

    return (
        <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6 pt-2">
            <StudyPageHeader
                title={t('admin.projects.settings.title', 'Project settings')}
                description={t('admin.projects.settings.identity_desc')}
                icon={Briefcase}
            />

            <div className="max-w-2xl">
                <Card className="border-none shadow-sm bg-white rounded-2xl overflow-hidden">
                    <CardHeader className="border-b border-slate-50 pb-4">
                        <CardTitle className="text-lg font-black text-slate-900 flex items-center gap-2">
                            <Settings className="size-5 text-indigo-500" />
                            {t('admin.projects.settings.general.title')}
                        </CardTitle>
                        <CardDescription className="text-sm font-medium text-slate-500">
                            {t('admin.projects.settings.general.desc')}
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="pt-6">
                        <Form {...form}>
                            <form
                                onSubmit={form.handleSubmit(onUpdateProject)}
                                className="space-y-4"
                            >
                                <FormField
                                    control={form.control}
                                    name="title"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel className="text-2xs font-black text-slate-500">
                                                {t('admin.projects.settings.general.label_title')}
                                            </FormLabel>
                                            <FormControl>
                                                <Input
                                                    {...field}
                                                    placeholder={t(
                                                        'admin.projects.settings.general.placeholder_title'
                                                    )}
                                                    className="h-11 rounded-xl bg-white/50"
                                                    disabled={!isAdmin}
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
                                                {t('admin.projects.settings.general.label_slug')}
                                            </FormLabel>
                                            <FormControl>
                                                <div className="relative">
                                                    <Input
                                                        {...field}
                                                        placeholder={t(
                                                            'admin.projects.settings.general.placeholder_slug'
                                                        )}
                                                        className="h-11 rounded-xl pl-32 bg-white/50"
                                                        disabled={!isAdmin}
                                                    />
                                                    <div className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400 select-none border-r pr-3 mr-3 h-4 flex items-center">
                                                        /app/
                                                    </div>
                                                </div>
                                            </FormControl>
                                            <FormDescription className="text-2xs italic">
                                                {t('admin.projects.settings.general.slug_hint')}
                                            </FormDescription>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                {isAdmin && (
                                    <div className="flex justify-end pt-2">
                                        <Button
                                            type="submit"
                                            className="h-11 rounded-xl px-6 font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm"
                                            disabled={updateProjectMutation.isPending}
                                        >
                                            {updateProjectMutation.isPending ? (
                                                <span className="flex items-center">
                                                    <Globe className="size-4 mr-2 animate-spin" />
                                                    {t('common.processing')}
                                                </span>
                                            ) : (
                                                <>
                                                    <Save className="size-4 mr-2" />
                                                    {t('admin.projects.settings.general.save')}
                                                </>
                                            )}
                                        </Button>
                                    </div>
                                )}
                            </form>
                        </Form>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
