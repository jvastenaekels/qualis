import { useParams } from 'react-router-dom';
import { Users, Shield } from 'lucide-react';
import TeamSettings from '@/components/admin/team/TeamSettings';
import { Badge } from '@/components/ui/badge';

const TeamManagementPage = () => {
    const { slug } = useParams<{ slug: string }>();

    return (
        <div className="flex flex-1 flex-col gap-6 p-6 pt-2">
            <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 py-4 border-b border-slate-100">
                <div className="space-y-1">
                    <h1 className="text-3xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
                        {slug}
                        <Badge
                            variant="outline"
                            className="ml-2 bg-indigo-50 text-indigo-700 border-indigo-100 font-bold uppercase tracking-widest text-[10px]"
                        >
                            Research Team
                        </Badge>
                    </h1>
                    <p className="text-slate-500 text-sm">
                        Manage collaborators and study-level access control.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <div className="bg-white shadow-sm border rounded-lg px-4 py-2 flex items-center gap-3">
                        <Shield className="h-4 w-4 text-indigo-500" />
                        <span className="text-xs font-bold text-slate-600 uppercase tracking-wider">
                            Protected Study
                        </span>
                    </div>
                </div>
            </header>

            <div className="flex items-center gap-2 mb-2 text-slate-400">
                <Users className="h-6 w-6" />
                <h2 className="text-2xl font-bold tracking-tight text-slate-700">
                    Collaboration Center
                </h2>
            </div>

            <TeamSettings />
        </div>
    );
};

export default TeamManagementPage;
