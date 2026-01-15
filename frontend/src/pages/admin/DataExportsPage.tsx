import { useLoaderData } from 'react-router-dom';
import type { ParticipantRead } from '@/api/model';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import ExportCenter from '@/components/admin/dashboard/ExportCenter';
import { Database, Download, Table as TableIcon, ChartBar } from 'lucide-react';
import { StudyPageHeader } from '@/components/admin/layout/StudyPageHeader';
import { useTranslation } from 'react-i18next';
import InteractiveDataView from '@/components/admin/dashboard/InteractiveDataView';

interface LoaderData {
    participants: ParticipantRead[];
    slug: string;
}

const DataExportsPage = () => {
    const { participants, slug } = useLoaderData() as LoaderData;
    const { t } = useTranslation();

    return (
        <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6 pt-2">
            <StudyPageHeader
                title={t('admin.data.title', 'Analytics & Data')}
                description={t(
                    'admin.data.description',
                    'Inspect participant performance, qualitative feedback, and export datasets.'
                )}
                icon={ChartBar}
            />

            <Tabs defaultValue="browse" className="flex-1 flex flex-col min-h-0 overflow-hidden">
                <div className="flex-none pb-4">
                    <TabsList className="bg-slate-100/50 border-none p-1.5 rounded-2xl w-full sm:w-auto grid grid-cols-2 sm:flex sm:inline-flex">
                        <TabsTrigger
                            value="browse"
                            className="rounded-xl data-[state=active]:bg-white data-[state=active]:text-indigo-600 data-[state=active]:shadow-sm px-6 py-2.5 gap-2 transition-all font-bold text-xs"
                        >
                            <TableIcon className="w-4 h-4" />
                            {t('admin.data.tabs.browse', 'Interactive view')}
                        </TabsTrigger>
                        <TabsTrigger
                            value="export"
                            className="rounded-xl data-[state=active]:bg-white data-[state=active]:text-indigo-600 data-[state=active]:shadow-sm px-6 py-2.5 gap-2 transition-all font-bold text-xs"
                        >
                            <Download className="w-4 h-4" />
                            {t('admin.data.tabs.export', 'Export data')}
                        </TabsTrigger>
                    </TabsList>
                </div>

                <TabsContent
                    value="browse"
                    className="flex-1 min-h-0 overflow-hidden flex flex-col data-[state=inactive]:hidden"
                >
                    <div className="flex-1 relative">
                        <div className="absolute inset-0 overflow-y-auto pr-2 pb-10">
                            <InteractiveDataView slug={slug} participants={participants} />
                        </div>
                    </div>
                </TabsContent>

                <TabsContent
                    value="export"
                    className="flex-1 overflow-y-auto data-[state=inactive]:hidden"
                >
                    <div className="grid gap-6 md:grid-cols-12 max-w-6xl">
                        <div className="col-span-12 md:col-span-8">
                            <ExportCenter slug={slug || ''} />
                        </div>

                        <div className="col-span-12 md:col-span-4 space-y-6">
                            <div className="p-6 rounded-2xl bg-indigo-50/50 border border-indigo-100/50 shadow-sm">
                                <h3 className="text-[10px] font-black text-indigo-900 uppercase tracking-wider mb-4 flex items-center gap-2">
                                    <Database className="w-4 h-4" />{' '}
                                    {t('admin.data.guide.title', 'Format guide')}
                                </h3>
                                <div className="space-y-4 text-xs text-slate-600 leading-relaxed">
                                    <div className="space-y-1">
                                        <div className="font-semibold text-indigo-700">
                                            {t('admin.data.guide.csv.title', 'Universal CSV')}
                                        </div>
                                        <p>
                                            {t(
                                                'admin.data.guide.csv.desc',
                                                'Raw rectangular data. Best for R, Python, SPSS, or Excel analysis. Includes all metadata.'
                                            )}
                                        </p>
                                    </div>
                                    <div className="space-y-1">
                                        <div className="font-semibold text-indigo-700">
                                            {t('admin.data.guide.json.title', 'KenQ JSON')}
                                        </div>
                                        <p>
                                            {t(
                                                'admin.data.guide.json.desc',
                                                'Optimized for the Web-KenQ analysis tool. Contains study definition and sorts.'
                                            )}
                                        </p>
                                    </div>
                                    <div className="space-y-1">
                                        <div className="font-semibold text-indigo-700">
                                            {t(
                                                'admin.data.guide.zip.title',
                                                'PQMethod Bundle (ZIP)'
                                            )}
                                        </div>
                                        <p>
                                            {t(
                                                'admin.data.guide.zip.desc',
                                                'Contains legacy .DAT and .STA files for DOS PQMethod analysis.'
                                            )}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </TabsContent>
            </Tabs>
        </div>
    );
};

export default DataExportsPage;
