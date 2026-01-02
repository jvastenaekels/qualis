import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
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
import { useCreateStudyApiAdminStudiesPost } from '@/api/generated';
import { useAdminStore } from '@/store/useAdminStore';

const formSchema = z.object({
    title: z.string().min(1, 'Title is required').max(100),
    slug: z
        .string()
        .min(3, 'Slug must be at least 3 characters')
        .max(50)
        .regex(/^[a-z0-9-]+$/, 'Slug must contain only lowercase letters, numbers, and hyphens'),
});

interface CreateStudyDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export function CreateStudyDialog({ open, onOpenChange }: CreateStudyDialogProps) {
    const { setActiveStudy } = useAdminStore();
    const navigate = useNavigate();
    const createStudyMutation = useCreateStudyApiAdminStudiesPost();

    const form = useForm<z.infer<typeof formSchema>>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            title: '',
            slug: '',
        },
    });

    const onSubmit = async (values: z.infer<typeof formSchema>) => {
        try {
            // Construct payload with sensible defaults
            const newStudy = await createStudyMutation.mutateAsync({
                data: {
                    slug: values.slug,
                    translations: [
                        {
                            language_code: 'en',
                            title: values.title,
                            description: '',
                            instructions:
                                'Please sort the statements according to your perspective.',
                            consent_title: 'Informed Consent',
                            consent_accept: 'I Agree',
                            consent_decline: 'I Decline',
                        },
                    ],
                    grid_config: [
                        { score: -2, capacity: 2 },
                        { score: -1, capacity: 3 },
                        { score: 0, capacity: 4 },
                        { score: 1, capacity: 3 },
                        { score: 2, capacity: 2 },
                    ], // Default small normal distribution
                    presort_config: {},
                    postsort_config: {},
                    state: 'draft',
                    show_statement_codes: false,
                    statements: [],
                },
            });

            toast.success('Study created successfully');
            setActiveStudy(newStudy.slug);
            navigate(`/admin/studies/${newStudy.slug}`);
            onOpenChange(false);
            form.reset();
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : 'Failed to create study';
            toast.error(message);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>Create New Study</DialogTitle>
                    <DialogDescription>
                        Start a new Q-Methodology study. You can configure statements and settings
                        later.
                    </DialogDescription>
                </DialogHeader>

                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                        <FormField
                            control={form.control}
                            name="title"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Study Title</FormLabel>
                                    <FormControl>
                                        <Input placeholder="e.g. Perspectives on AI" {...field} />
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
                                    <FormLabel>URL Slug</FormLabel>
                                    <FormControl>
                                        <Input placeholder="e.g. ai-perspectives-2025" {...field} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <DialogFooter>
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => onOpenChange(false)}
                            >
                                Cancel
                            </Button>
                            <Button type="submit" disabled={createStudyMutation.isPending}>
                                {createStudyMutation.isPending && (
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                )}
                                Create Study
                            </Button>
                        </DialogFooter>
                    </form>
                </Form>
            </DialogContent>
        </Dialog>
    );
}
