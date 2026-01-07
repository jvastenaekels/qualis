import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useState } from 'react';

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

            toast.success(t('admin.workspace.create.success'));
            navigate(`/admin/workspaces/${newWorkspace.slug}/settings`);
        } catch (error: any) {
            toast.error(error.message || t('admin.workspace.create.error'));
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="flex flex-col gap-6 max-w-2xl mx-auto py-8">
            <div className="flex flex-col gap-2">
                <h1 className="text-3xl font-bold tracking-tight">
                    {t('admin.workspace.create.title')}
                </h1>
                <p className="text-muted-foreground">{t('admin.workspace.create.description')}</p>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>{t('admin.workspace.create.card_title')}</CardTitle>
                    <CardDescription>
                        {t('admin.workspace.create.card_description')}
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <Form {...form}>
                        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                            <FormField
                                control={form.control}
                                name="title"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>
                                            {t('admin.workspace.create.name_label')}
                                        </FormLabel>
                                        <FormControl>
                                            <Input
                                                placeholder={t(
                                                    'admin.workspace.create.name_placeholder'
                                                )}
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
                                        <FormLabel>
                                            {t('admin.workspace.create.url_label')}
                                        </FormLabel>
                                        <FormControl>
                                            <Input
                                                placeholder={t(
                                                    'admin.workspace.create.url_placeholder'
                                                )}
                                                {...field}
                                            />
                                        </FormControl>
                                        <FormDescription>
                                            {t('admin.workspace.create.url_description')}
                                        </FormDescription>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <div className="flex justify-end gap-2">
                                <Button
                                    variant="outline"
                                    type="button"
                                    onClick={() => navigate(-1)}
                                >
                                    {t('admin.workspace.create.cancel')}
                                </Button>
                                <Button type="submit" disabled={isSubmitting}>
                                    {isSubmitting
                                        ? t('admin.workspace.create.creating')
                                        : t('admin.workspace.create.create_button')}
                                </Button>
                            </div>
                        </form>
                    </Form>
                </CardContent>
            </Card>
        </div>
    );
}
