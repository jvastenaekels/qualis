import { useTranslation } from 'react-i18next';
import { Users, ArrowRight, Shield } from 'lucide-react';
import { useLoaderData, Link } from 'react-router-dom';
import type { StudyRead } from '@/api/model';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

interface LoaderData {
    study: StudyRead;
    slug: string;
}

const TeamManagementPage = () => {
    const { study } = useLoaderData() as LoaderData;
    const { t } = useTranslation();

    // Determine workspace slug, fallback to study slug's workspace logic if not present (should be present now)
    // biome-ignore lint/suspicious/noExplicitAny: workspace slug fallback
    const workspaceSlug = (study as any).workspace?.slug || 'default';

    return (
        <div className="flex flex-1 flex-col gap-6 p-4 sm:p-8 max-w-4xl mx-auto w-full items-center justify-center min-h-[60vh]">
            <div className="text-center space-y-4 max-w-lg">
                <div className="mx-auto w-16 h-16 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center mb-6 shadow-sm">
                    <Shield className="size-8" />
                </div>

                <h1 className="text-3xl font-black tracking-tight text-slate-900">
                    {t('admin.team.moved_title', 'Team Management has moved')}
                </h1>

                <p className="text-slate-500 font-medium leading-relaxed">
                    {t(
                        'admin.team.moved_description',
                        'To make collaboration easier, team members and permissions are now managed at the Workspace level. This ensures consistent access across all your studies.'
                    )}
                </p>

                <div className="pt-6">
                    <Button
                        asChild
                        className="h-12 rounded-xl px-8 font-bold bg-indigo-600 hover:bg-indigo-700 shadow-sm text-base"
                    >
                        <Link to={`/admin/workspaces/${workspaceSlug}/settings`}>
                            {t('admin.team.go_to_workspace', 'Manage Workspace Team')}
                            <ArrowRight className="ml-2 size-4" />
                        </Link>
                    </Button>
                </div>
            </div>

            <Card className="w-full max-w-lg mt-8 bg-indigo-50/50 border-indigo-100 rounded-2xl shadow-sm">
                <CardContent className="pt-6">
                    <div className="flex gap-4">
                        <div className="shrink-0">
                            <Users className="size-5 text-indigo-500" />
                        </div>
                        <div className="space-y-1">
                            <h3 className="text-sm font-black uppercase tracking-wider text-indigo-900">
                                {t('admin.team.what_changed', 'What changed?')}
                            </h3>
                            <p className="text-xs text-indigo-800/70 leading-relaxed">
                                Instead of adding collaborators to individual studies, you now add
                                members to the Workspace. Their role (Admin, Researcher, or Viewer)
                                determines what they can do in all studies within that workspace.
                            </p>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
};

export default TeamManagementPage;
