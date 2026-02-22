import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { DEFAULT_STUDY_CONTENT, AVAILABLE_LANGUAGES } from '@/constants/studyDefaults';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import {
    useCreateStudyApiAdminStudiesPost,
    getListStudiesApiAdminStudiesGetQueryKey,
} from '@/api/generated';
import { useAdminStore } from '@/store/useAdminStore';

interface CreateStudyDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    workspaceSlug: string;
}

export function CreateStudyDialog({ open, onOpenChange, workspaceSlug }: CreateStudyDialogProps) {
    const { setActiveStudy } = useAdminStore();
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const createStudyMutation = useCreateStudyApiAdminStudiesPost();
    const { t, i18n } = useTranslation();

    const formSchema = z.object({
        title: z.string().min(1, t('admin.validation.required', 'Required')).max(100),
        slug: z
            .string()
            .min(3, t('admin.validation.slug_min', 'Slug must be at least 3 characters'))
            .max(50)
            .regex(
                /^[a-z0-9-]+$/,
                t(
                    'admin.validation.slug_regex',
                    'Slug must contain only lowercase letters, numbers, and hyphens'
                )
            ),
        languages: z
            .array(z.string())
            .min(1, t('admin.validation.language_required', 'Select at least one language')),
    });

    const form = useForm<z.infer<typeof formSchema>>({
        resolver: zodResolver(formSchema),
        mode: 'onBlur',
        defaultValues: {
            title: '',
            slug: '',
            languages: [i18n.language.split('-')[0]],
        },
    });

    const onSubmit = async (values: z.infer<typeof formSchema>) => {
        try {
            // Construct payload with sensible defaults
            const newStudy = await createStudyMutation.mutateAsync({
                data: {
                    slug: values.slug,
                    translations: values.languages.map((langCode) => {
                        const defaults =
                            DEFAULT_STUDY_CONTENT[langCode] || DEFAULT_STUDY_CONTENT.en;
                        return {
                            language_code: langCode,
                            title: values.title,
                            description: undefined,
                            instructions: defaults.instructions,
                            consent_title: defaults.consent_title,
                            consent_description: defaults.consent_description,
                            process_steps: defaults.process_steps,
                        };
                    }),
                    grid_config: [], // Empty grid for new studies - will be configured later
                    presort_config: { enabled: true },
                    postsort_config: {
                        email: { enabled: false },
                        consent: { enabled: false },
                    },
                    state: 'draft',
                    show_statement_codes: false,
                    statements: [],
                },
            });

            toast.success(t('admin.dialogs.create_study.success', 'Study created successfully'));

            // Invalidate and refetch studies list to show the new study
            await queryClient.invalidateQueries({
                queryKey: getListStudiesApiAdminStudiesGetQueryKey(),
            });

            setActiveStudy(newStudy.slug);
            navigate(`/app/${workspaceSlug}/studies/${newStudy.slug}/design`);
            onOpenChange(false);
            form.reset();
        } catch (error: unknown) {
            console.error('Study creation error:', error);

            // Extract detailed error information
            let errorMessage = t('admin.dialogs.create_study.error', 'Failed to create study');

            if (error && typeof error === 'object') {
                // Check for axios-style error response
                const axiosError = error as {
                    response?: { data?: { detail?: unknown } };
                };
                if (axiosError.response?.data?.detail) {
                    const detail = axiosError.response.data.detail;

                    // Handle Pydantic validation errors (array format)
                    if (Array.isArray(detail)) {
                        const fieldErrors = detail
                            .map(
                                (err: { loc: string[]; msg: string }) =>
                                    `${err.loc.join('.')}: ${err.msg}`
                            )
                            .join('\n');
                        errorMessage = `Validation errors:\n${fieldErrors}`;
                        console.error('Validation errors:', detail);
                    }
                    // Handle string error messages
                    else if (typeof detail === 'string') {
                        errorMessage = detail;
                    }
                    // Handle object error messages
                    else if (typeof detail === 'object') {
                        errorMessage = JSON.stringify(detail, null, 2);
                    }
                }
                // Fallback to error message if available
                else if ('message' in error && typeof error.message === 'string') {
                    errorMessage = error.message;
                }
            }

            toast.error(errorMessage, { duration: 10000 });
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader className="space-y-3 pb-4 border-b border-slate-50">
                    <DialogTitle className="text-xl font-black tracking-tight text-slate-900">
                        {t('admin.dialogs.create_study.title', 'Create New Study')}
                    </DialogTitle>
                    <DialogDescription className="text-sm font-medium text-slate-500">
                        {t(
                            'admin.dialogs.create_study.description',
                            'Start a new Q-Methodology study. You can configure statements and settings later.'
                        )}
                    </DialogDescription>
                </DialogHeader>

                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                        <FormField
                            control={form.control}
                            name="title"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel className="text-2xs font-black text-slate-500">
                                        {t('admin.dialogs.create_study.study_title', 'Study Title')}
                                    </FormLabel>
                                    <FormControl>
                                        <Input
                                            className="h-11 rounded-xl bg-slate-50 border-slate-100 focus-visible:ring-indigo-500 font-medium"
                                            placeholder={t(
                                                'admin.dialogs.create_study.study_title_placeholder',
                                                'e.g. Perspectives on AI'
                                            )}
                                            {...field}
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
                                        {t('admin.dialogs.create_study.url_slug', 'URL Slug')}
                                    </FormLabel>
                                    <FormControl>
                                        <Input
                                            className="h-11 rounded-xl bg-slate-50 border-slate-100 focus-visible:ring-indigo-500 font-mono text-xs"
                                            placeholder={t(
                                                'admin.dialogs.create_study.url_slug_placeholder',
                                                'e.g. ai-perspectives-2025'
                                            )}
                                            {...field}
                                        />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <FormField
                            control={form.control}
                            name="languages"
                            render={() => (
                                <FormItem>
                                    <div className="mb-4">
                                        <FormLabel className="text-2xs font-black text-slate-500">
                                            {t('admin.dialogs.create_study.languages', 'Languages')}
                                        </FormLabel>
                                        <p className="text-xs font-medium text-slate-400 mt-1">
                                            {t(
                                                'admin.dialogs.create_study.languages_desc',
                                                'Select languages to enable for this study. Content will be initialized with localized defaults.'
                                            )}
                                        </p>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        {AVAILABLE_LANGUAGES.map((lang) => (
                                            <FormField
                                                key={lang.code}
                                                control={form.control}
                                                name="languages"
                                                render={({ field }) => {
                                                    return (
                                                        <FormItem
                                                            key={lang.code}
                                                            className="flex flex-row items-center space-x-3 space-y-0"
                                                        >
                                                            <FormControl>
                                                                <Checkbox
                                                                    checked={field.value?.includes(
                                                                        lang.code
                                                                    )}
                                                                    onCheckedChange={(checked) => {
                                                                        return checked
                                                                            ? field.onChange([
                                                                                  ...field.value,
                                                                                  lang.code,
                                                                              ])
                                                                            : field.onChange(
                                                                                  field.value?.filter(
                                                                                      (value) =>
                                                                                          value !==
                                                                                          lang.code
                                                                                  )
                                                                              );
                                                                    }}
                                                                />
                                                            </FormControl>
                                                            <FormLabel className="font-normal cursor-pointer text-sm">
                                                                <span className="text-xl mr-2">
                                                                    {lang.flag}
                                                                </span>
                                                                {lang.label}
                                                            </FormLabel>
                                                        </FormItem>
                                                    );
                                                }}
                                            />
                                        ))}
                                    </div>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <DialogFooter className="pt-6 border-t border-slate-50 gap-3">
                            <Button
                                type="button"
                                variant="ghost"
                                className="h-11 rounded-xl px-6 font-bold text-slate-500 hover:text-slate-900"
                                onClick={() => onOpenChange(false)}
                            >
                                {t('admin.dialogs.create_study.cancel', 'Cancel')}
                            </Button>
                            <Button
                                type="submit"
                                disabled={createStudyMutation.isPending}
                                className="h-11 rounded-xl px-8 font-black bg-indigo-600 hover:bg-indigo-700 shadow-sm"
                            >
                                {createStudyMutation.isPending && (
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                )}
                                {t('admin.dialogs.create_study.create', 'Create Study')}
                            </Button>
                        </DialogFooter>
                    </form>
                </Form>
            </DialogContent>
        </Dialog>
    );
}
