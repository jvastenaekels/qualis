import { useParams } from 'react-router-dom';
import { Database, Download, Table, FileSpreadsheet } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

const DataExportsPage = () => {
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
                            Data & Exports
                        </Badge>
                    </h1>
                    <p className="text-slate-500 text-sm">
                        Download raw participant data and analysis-ready files.
                    </p>
                </div>
            </header>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                <Card>
                    <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
                         <div className="space-y-1">
                            <CardTitle className="text-base font-semibold">Raw JSON Exporter</CardTitle>
                            <CardDescription>Full participant response dump</CardDescription>
                        </div>
                        <Database className="h-4 w-4 text-slate-400" />
                    </CardHeader>
                    <CardContent className="pt-4">
                        <Button variant="outline" className="w-full" disabled>
                            <Download className="mr-2 h-4 w-4" /> Export JSON
                        </Button>
                    </CardContent>
                </Card>

                 <Card>
                    <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
                         <div className="space-y-1">
                            <CardTitle className="text-base font-semibold">CSV Analysis Format</CardTitle>
                            <CardDescription>Ready for PQMethod/R</CardDescription>
                        </div>
                        <FileSpreadsheet className="h-4 w-4 text-slate-400" />
                    </CardHeader>
                    <CardContent className="pt-4">
                        <Button variant="outline" className="w-full" disabled>
                            <Download className="mr-2 h-4 w-4" /> Export CSV
                        </Button>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
};

export default DataExportsPage;
