import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Library, Plus, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';
import { StudyPageHeader } from '@/components/admin/layout/StudyPageHeader';
import { useAdminContext } from '@/hooks/useAdminContext';
import {
    useListConcoursesApiAdminConcoursesGet,
    useCreateConcourseApiAdminConcoursesPost,
    getListConcoursesApiAdminConcoursesGetQueryKey,
} from '@/api/generated';
import { useQueryClient } from '@tanstack/react-query';
import { parseApiErrorSync } from '@/lib/error-utils';
import { usePermission } from '@/hooks/usePermission';

export default function ConcourseListPage() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { workspace } = useAdminContext();
    const { can } = usePermission();
    const queryClient = useQueryClient();

    const { data, isLoading } = useListConcoursesApiAdminConcoursesGet();
    const concourses = data?.items ?? [];

    const [dialogOpen, setDialogOpen] = useState(false);
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');

    const createMutation = useCreateConcourseApiAdminConcoursesPost();

    const handleCreate = async () => {
        if (!title.trim()) return;
        try {
            const result = await createMutation.mutateAsync({
                data: { title: title.trim(), description: description.trim() || null },
            });
            await queryClient.invalidateQueries({
                queryKey: getListConcoursesApiAdminConcoursesGetQueryKey(),
            });
            toast.success(t('admin.concourse.create_success', 'Concourse created'));
            setDialogOpen(false);
            setTitle('');
            setDescription('');
            navigate(`/app/${workspace?.slug}/concourses/${result.id}`);
        } catch (err) {
            toast.error(
                parseApiErrorSync(
                    err,
                    t('admin.concourse.create_error', 'Failed to create concourse')
                )
            );
        }
    };

    return (
        <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6 pt-2">
            <StudyPageHeader
                title={t('admin.concourse.title', 'Concourses')}
                description={t(
                    'admin.concourse.description',
                    'Manage collections of candidate statements for your Q-methodology studies'
                )}
                icon={Library}
                actions={
                    can('study:edit_design') ? (
                        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                            <DialogTrigger asChild>
                                <Button className="h-10 rounded-xl px-5 font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm">
                                    <Plus className="size-4 mr-2" />
                                    {t('admin.concourse.create', 'New Concourse')}
                                </Button>
                            </DialogTrigger>
                            <DialogContent className="border-slate-200 bg-white shadow-lg max-w-md">
                                <DialogHeader>
                                    <DialogTitle className="text-xl font-black text-slate-900">
                                        {t(
                                            'admin.concourse.create_dialog_title',
                                            'Create Concourse'
                                        )}
                                    </DialogTitle>
                                    <DialogDescription className="text-sm font-medium text-slate-500">
                                        {t(
                                            'admin.concourse.create_dialog_desc',
                                            'A concourse is a collection of candidate statements from which you will select your Q-set.'
                                        )}
                                    </DialogDescription>
                                </DialogHeader>
                                <div className="space-y-4 py-2">
                                    <div className="space-y-2">
                                        <Label className="text-2xs font-black text-slate-500">
                                            {t('admin.concourse.field_title', 'Title')}
                                        </Label>
                                        <Input
                                            value={title}
                                            onChange={(e) => setTitle(e.target.value)}
                                            placeholder={t(
                                                'admin.concourse.field_title_placeholder',
                                                'e.g. Climate Change Attitudes'
                                            )}
                                            className="h-11 rounded-xl bg-white/50"
                                            autoFocus
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label className="text-2xs font-black text-slate-500">
                                            {t('admin.concourse.field_description', 'Description')}
                                            <span className="text-slate-400 font-normal ml-1">
                                                ({t('common.optional', 'optional')})
                                            </span>
                                        </Label>
                                        <Textarea
                                            value={description}
                                            onChange={(e) => setDescription(e.target.value)}
                                            placeholder={t(
                                                'admin.concourse.field_description_placeholder',
                                                'Brief description of this concourse...'
                                            )}
                                            className="rounded-xl bg-white/50 min-h-[80px]"
                                        />
                                    </div>
                                </div>
                                <DialogFooter>
                                    <Button
                                        onClick={handleCreate}
                                        disabled={!title.trim() || createMutation.isPending}
                                        className="h-11 rounded-xl px-6 font-bold bg-indigo-600 hover:bg-indigo-700 text-white"
                                    >
                                        {createMutation.isPending ? (
                                            <Loader2 className="size-4 animate-spin mr-2" />
                                        ) : (
                                            <Plus className="size-4 mr-2" />
                                        )}
                                        {t('admin.concourse.create', 'New Concourse')}
                                    </Button>
                                </DialogFooter>
                            </DialogContent>
                        </Dialog>
                    ) : undefined
                }
            />

            {isLoading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {Array.from({ length: 3 }).map((_, i) => (
                        <Skeleton key={i} className="h-36 rounded-2xl" />
                    ))}
                </div>
            ) : concourses.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-center">
                    <div className="p-4 bg-indigo-50 rounded-2xl mb-4">
                        <Library className="size-8 text-indigo-400" />
                    </div>
                    <h3 className="text-lg font-black text-slate-900 mb-1">
                        {t('admin.concourse.empty_title', 'No concourses yet')}
                    </h3>
                    <p className="text-sm text-slate-500 max-w-md mb-6">
                        {t(
                            'admin.concourse.empty_desc',
                            'Create a concourse to start collecting and organizing candidate statements for your Q-methodology research.'
                        )}
                    </p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {concourses.map((c) => (
                        <Card
                            key={c.id}
                            className="border-none shadow-sm bg-white rounded-2xl overflow-hidden cursor-pointer hover:shadow-md transition-shadow group"
                            onClick={() => navigate(`/app/${workspace?.slug}/concourses/${c.id}`)}
                        >
                            <CardContent className="p-5">
                                <div className="flex items-start justify-between mb-3">
                                    <div className="p-2 bg-indigo-50 rounded-xl border border-indigo-100">
                                        <Library className="size-4 text-indigo-600" />
                                    </div>
                                    <span className="text-xs font-bold text-slate-400">
                                        {c.item_count} {t('admin.concourse.items_label', 'items')}
                                    </span>
                                </div>
                                <h3 className="text-base font-black text-slate-900 mb-1 group-hover:text-indigo-700 transition-colors">
                                    {c.title}
                                </h3>
                                {c.description && (
                                    <p className="text-xs text-slate-500 line-clamp-2">
                                        {c.description}
                                    </p>
                                )}
                                <p className="text-2xs text-slate-400 mt-3">
                                    {t('admin.concourse.updated', 'Updated')}{' '}
                                    {new Date(c.updated_at).toLocaleDateString()}
                                </p>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}
        </div>
    );
}
