import type React from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
    Download,
    FileJson,
    FileText,
    Box,
    Code,
    ArrowRight,
    Loader2,
    FlaskConical,
} from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import client from '@/api/client';

interface ExportCenterProps {
    slug: string;
}

const ExportCenter: React.FC<ExportCenterProps> = ({ slug }) => {
    const [exporting, setExporting] = useState<string | null>(null);

    const handleDownload = async (format: 'csv' | 'pqmethod' | 'r-kit' | 'kenq') => {
        setExporting(format);
        try {
            let endpoint = '';
            let filename = '';

            switch (format) {
                case 'csv':
                    endpoint = `/api/admin/studies/${slug}/export/csv`;
                    filename = `${slug}_results.csv`;
                    break;
                case 'pqmethod':
                    endpoint = `/api/admin/studies/${slug}/export/pqmethod`;
                    filename = `${slug}_pqmethod.zip`;
                    break;
                case 'r-kit':
                    endpoint = `/api/admin/studies/${slug}/export/r-kit`;
                    filename = `${slug}_r_kit.zip`;
                    break;
                case 'kenq':
                    endpoint = `/api/admin/studies/${slug}/dump`;
                    filename = `${slug}_kenq.json`;
                    break;
            }

            const response = await client.get(endpoint, { responseType: 'blob' });

            const url = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', filename);
            document.body.appendChild(link);
            link.click();
            link.remove();

            toast.success(`${format.toUpperCase()} export complete`);
        } catch (err) {
            console.error('Export failed:', err);
            toast.error(`Failed to export ${format.toUpperCase()}`);
        } finally {
            setExporting(null);
        }
    };

    const exportOptions = [
        {
            id: 'csv',
            title: 'Universal CSV',
            description: 'Flat table of all metadata, survey answers, and Q-sort scores.',
            icon: <FileText className="h-5 w-5 text-emerald-500" />,
            badge: 'Essential',
        },
        {
            id: 'kenq',
            title: 'KenQ Analysis',
            description: 'JSON format fully compatible with Web-KenQ logic.',
            icon: <FileJson className="h-5 w-5 text-amber-500" />,
            badge: 'Scientific',
        },
        {
            id: 'pqmethod',
            title: 'PQMethod Bundle',
            description: 'Legacy .DAT, .STA, and .ANS files for standalone software.',
            icon: <Box className="h-5 w-5 text-indigo-500" />,
            badge: 'Legacy',
        },
        {
            id: 'r-kit',
            title: 'R-Kit (qmethod)',
            description: 'Data CSV paired with a dynamic R-script for analysis.',
            icon: <Code className="h-5 w-5 text-sky-500" />,
            badge: 'Advanced',
        },
    ];

    return (
        <Card className="col-span-12 md:col-span-4 shadow-md border-none bg-white overflow-hidden h-fit">
            <CardHeader className="border-b border-slate-50 bg-slate-50/30">
                <div className="flex items-center gap-2 mb-1">
                    <FlaskConical className="h-5 w-5 text-indigo-500" />
                    <CardTitle className="text-lg">Laboratory Export Center</CardTitle>
                </div>
                <CardDescription>Scientific formats for advanced factor analysis.</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
                <div className="divide-y divide-slate-50">
                    {exportOptions.map((opt) => (
                        <div
                            key={opt.id}
                            className="p-4 hover:bg-slate-50/50 transition-colors group"
                        >
                            <div className="flex items-start justify-between gap-4">
                                <div className="flex gap-3">
                                    <div className="mt-1 p-2 rounded-lg bg-white border border-slate-100 shadow-sm group-hover:border-indigo-100 group-hover:shadow-indigo-50 transition-all">
                                        {opt.icon}
                                    </div>
                                    <div className="space-y-1">
                                        <div className="flex items-center gap-2">
                                            <h4 className="text-sm font-bold text-slate-800">
                                                {opt.title}
                                            </h4>
                                            <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
                                                {opt.badge}
                                            </span>
                                        </div>
                                        <p className="text-xs text-slate-500 leading-relaxed md:max-w-[200px]">
                                            {opt.description}
                                        </p>
                                    </div>
                                </div>
                                <Button
                                    size="sm"
                                    variant="ghost"
                                    disabled={exporting !== null}
                                    aria-label={`Export ${opt.title}`}
                                    // biome-ignore lint/suspicious/noExplicitAny: Format union type is complex for individual buttons
                                    onClick={() => handleDownload(opt.id as any)}
                                    className="h-8 w-8 rounded-full p-0 group-hover:bg-indigo-50 group-hover:text-indigo-600"
                                >
                                    {exporting === opt.id ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                        <Download className="h-4 w-4" />
                                    )}
                                </Button>
                            </div>
                        </div>
                    ))}
                </div>

                <div className="p-4 bg-indigo-50/30 border-t border-slate-100">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600">
                            <ArrowRight size={14} />
                        </div>
                        <div className="flex-1">
                            <h5 className="text-[10px] font-bold text-indigo-700 uppercase tracking-tight">
                                Pro Tip
                            </h5>
                            <p className="text-[10px] text-indigo-600/80 leading-tight">
                                Discarded sessions are automatically excluded from all exports for
                                data integrity.
                            </p>
                        </div>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
};

export default ExportCenter;
