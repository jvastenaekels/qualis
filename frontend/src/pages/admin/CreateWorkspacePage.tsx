import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useState } from 'react';
import { parseApiErrorSync } from '@/lib/error-utils';
import { Briefcase, Plus, Save, ArrowLeft, Globe } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { getListWorkspacesApiAdminWorkspacesGetQueryKey } from '@/api/generated';

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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import ApiClient from '@/api/client';
import { useAuthStore } from '@/store/useAuthStore';
import type { WorkspaceWithRole } from '@/types/backend';

const schema = z.object({
    title: z.string().min(3, 'Title must be at least 3 characters'),
    slug: z
        .string()
        .min(3, 'Slug must be at least 3 characters')
        .regex(/^[a-z0-9-]+$/, 'Slug must only contain lowercase letters, numbers, and hyphens'),
});

export default function CreateWorkspacePage() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { setCurrentWorkspace, setWorkspaces, workspaces } = useAuthStore();
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
            // Manual API call with updated shim
            const response = await ApiClient.post('/admin/workspaces', data);
            const newWorkspace = response.data as WorkspaceWithRole;

            // Allow immediate access by adding to store
            // Note: backend response might not include user_role because we just created it.
            // But our updated backend Create returns WorkspaceRead.
            // We know current user is owner.
            if (!newWorkspace.user_role) {
                newWorkspace.user_role = 'owner';
            }

            setWorkspaces([...workspaces, newWorkspace]);
            setCurrentWorkspace(newWorkspace);

            // Invalidate React Query list to ensure Sidebar/Switcher are updated
            await queryClient.invalidateQueries({
                queryKey: getListWorkspacesApiAdminWorkspacesGetQueryKey(),
            });

            toast.success(t('admin.workspace.create.success'));
            navigate(`/admin/workspaces/${newWorkspace.slug}/settings`);
        } catch (error: unknown) {
            const message = parseApiErrorSync(error, t('admin.workspace.create.error'));
            toast.error(t('admin.workspace.create.error'), {
                description: message,
            });
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="flex flex-1 flex-col gap-6 p-4 sm:p-8 max-w-4xl mx-auto w-full">
            <div className="flex flex-col gap-2 mb-2">
                <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-indigo-50 border border-indigo-100 rounded-xl text-indigo-600 shadow-sm">
                        <Plus className="size-6" />
                    </div>
                    <h1 className="text-3xl font-black tracking-tight text-slate-900">
                        {t('admin.workspace.create.title')}
                    </h1>
                </div>
                <p className="text-slate-500 font-medium pl-1">
                    {t('admin.workspace.create.description')}
                </p>
            </div>

            <Card className="border-none shadow-sm bg-white rounded-2xl overflow-hidden">
                <CardHeader className="border-b border-slate-50 pb-6">
                    <CardTitle className="text-lg font-black text-slate-900 flex items-center gap-2">
                        <Briefcase className="size-5 text-indigo-500" />
                        {t('admin.workspace.create.card_title')}
                    </CardTitle>
                    <CardDescription className="text-sm font-medium text-slate-500">
                        {t('admin.workspace.create.card_description')}
                    </CardDescription>
                </CardHeader>
                <CardContent className="pt-8">
                    <Form {...form}>
                        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                            <FormField
                                control={form.control}
                                name="title"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel className="text-[10px] font-black uppercase tracking-wider text-slate-500">
                                            {t('admin.workspace.create.name_label')}
                                        </FormLabel>
                                        <FormControl>
                                            <Input
                                                placeholder={t(
                                                    'admin.workspace.create.name_placeholder'
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
                                        <FormLabel className="text-[10px] font-black uppercase tracking-wider text-slate-500">
                                            {t('admin.workspace.create.url_label')}
                                        </FormLabel>
                                        <FormControl>
                                            <div className="relative">
                                                <Input
                                                    placeholder={t(
                                                        'admin.workspace.create.url_placeholder'
                                                    )}
                                                    className="h-12 rounded-xl pl-32 bg-white/50 border-slate-200 focus:bg-white transition-all shadow-sm"
                                                    {...field}
                                                />
                                                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400 select-none border-r pr-3 mr-3 h-4 flex items-center">
                                                    /admin/w/
                                                </div>
                                            </div>
                                        </FormControl>
                                        <FormDescription className="text-[10px] italic font-medium px-1">
                                            {t('admin.workspace.create.url_description')}
                                        </FormDescription>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <div className="flex justify-end gap-3 pt-4">
                                <Button
                                    variant="outline"
                                    type="button"
                                    className="h-11 rounded-xl px-6 border-slate-200 font-bold text-slate-600 hover:bg-slate-50"
                                    onClick={() => navigate(-1)}
                                >
                                    <ArrowLeft className="size-4 mr-2" />
                                    {t('admin.workspace.create.cancel')}
                                </Button>
                                <Button
                                    type="submit"
                                    className="h-11 rounded-xl px-8 font-black bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm border-none"
                                    disabled={isSubmitting}
                                >
                                    {isSubmitting ? (
                                        <>
                                            <Globe className="size-4 mr-2 animate-spin" />
                                            {t('admin.workspace.create.creating')}
                                        </>
                                    ) : (
                                        <>
                                            <Save className="size-4 mr-2" />
                                            {t('admin.workspace.create.create_button')}
                                        </>
                                    )}
                                </Button>
                            </div>
                        </form>
                    </Form>
                </CardContent>
            </Card>
        </div>
    );
}
