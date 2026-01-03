import { useParams } from 'react-router-dom';
import { Send, Copy, Mail, QrCode } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

const RecruitmentPage = () => {
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
                            Recruitment
                        </Badge>
                    </h1>
                    <p className="text-slate-500 text-sm">
                        Manage participant invitations and public access settings.
                    </p>
                </div>
            </header>

            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                <div className="col-span-1 rounded-xl border bg-slate-50/50 p-6 flex flex-col items-center justify-center text-center gap-4 text-slate-400 dashed border-slate-200">
                    <Mail className="h-10 w-10 text-slate-300" />
                    <div>
                        <h3 className="font-semibold text-slate-900">Email Invitations</h3>
                        <p className="text-sm">Not implemented yet.</p>
                    </div>
                </div>
                <div className="col-span-1 rounded-xl border bg-slate-50/50 p-6 flex flex-col items-center justify-center text-center gap-4 text-slate-400 dashed border-slate-200">
                    <QrCode className="h-10 w-10 text-slate-300" />
                    <div>
                        <h3 className="font-semibold text-slate-900">QR Codes</h3>
                        <p className="text-sm">Not implemented yet.</p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default RecruitmentPage;
