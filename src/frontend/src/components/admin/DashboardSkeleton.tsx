import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader } from '@/components/ui/card';

export const DashboardSkeleton = () => {
    return (
        <div className="flex flex-1 flex-col gap-6 p-6 pt-2">
            {/* Header Skeleton */}
            <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 py-4 border-b border-slate-100">
                <div className="space-y-2">
                    <div className="flex items-center gap-2">
                        <Skeleton className="h-9 w-48" />
                        <Skeleton className="h-6 w-24 rounded-full" />
                    </div>
                    <Skeleton className="h-4 w-64" />
                </div>
                <Skeleton className="h-10 w-32 rounded-lg" />
            </header>

            {/* KPI Cards Skeleton */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                {[1, 2, 3, 4].map((i) => (
                    <Card key={i} className="overflow-hidden border-none shadow-sm">
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 bg-slate-50/50">
                            <Skeleton className="h-3 w-20" />
                            <Skeleton className="h-4 w-4 rounded-full" />
                        </CardHeader>
                        <CardContent className="pt-4 space-y-2">
                            <Skeleton className="h-8 w-16" />
                            <Skeleton className="h-3 w-32" />
                        </CardContent>
                    </Card>
                ))}
            </div>

            {/* Main Content Skeleton */}
            <div className="grid gap-6 md:grid-cols-12 pb-12">
                <Card className="col-span-12 md:col-span-8 shadow-md border-none bg-slate-50/30">
                    <CardHeader className="border-b border-slate-100 bg-white/50 space-y-2">
                        <Skeleton className="h-6 w-48" />
                        <Skeleton className="h-3 w-64" />
                    </CardHeader>
                    <CardContent className="p-6">
                        <TableSkeleton rows={5} />
                    </CardContent>
                </Card>

                <div className="col-span-12 md:col-span-4 space-y-6">
                    <Card className="shadow-sm border-none">
                        <CardHeader className="bg-slate-50/50">
                            <Skeleton className="h-5 w-32" />
                        </CardHeader>
                        <CardContent className="p-6 space-y-4">
                            <Skeleton className="h-10 w-full" />
                            <Skeleton className="h-24 w-full rounded-lg" />
                        </CardContent>
                    </Card>
                    <Card className="shadow-sm border-none">
                        <CardHeader className="bg-slate-50/50">
                            <Skeleton className="h-5 w-32" />
                        </CardHeader>
                        <CardContent className="p-6 space-y-2">
                            <Skeleton className="h-10 w-full" />
                            <Skeleton className="h-10 w-full" />
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
};

export const DesignerSkeleton = () => {
    return (
        <div className="flex flex-col h-[calc(100vh-theme(spacing.16))]">
            {/* Toolbar Skeleton */}
            <div className="border-b bg-background px-6 py-2 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-4">
                    <Skeleton className="h-8 w-32" />
                    <Skeleton className="h-4 w-px bg-border" />
                    <Skeleton className="h-4 w-24" />
                </div>
                <div className="flex items-center gap-3">
                    <Skeleton className="h-8 w-24 rounded-lg" />
                    <Skeleton className="h-8 w-32" />
                    <Skeleton className="h-8 w-8" />
                    <Skeleton className="h-8 w-28" />
                </div>
            </div>

            {/* Content Split Skeleton */}
            <div className="flex flex-1 overflow-hidden">
                {/* Editor Area */}
                <div className="flex-1 overflow-y-auto bg-muted/30 p-6">
                    <div className="max-w-2xl mx-auto mb-8">
                        <Skeleton className="h-10 w-full rounded-md" />
                    </div>
                    <div className="max-w-3xl mx-auto space-y-6">
                        <Card className="shadow-sm border-none">
                            <CardHeader>
                                <Skeleton className="h-6 w-48" />
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <Skeleton className="h-20 w-full" />
                                <Skeleton className="h-40 w-full" />
                            </CardContent>
                        </Card>
                        <div className="grid grid-cols-2 gap-4">
                            <Skeleton className="h-32 w-full" />
                            <Skeleton className="h-32 w-full" />
                        </div>
                    </div>
                </div>

                {/* Preview Area */}
                <div className="w-[450px] border-l bg-muted/10 p-4 flex flex-col gap-4">
                    <div className="flex justify-between items-center px-2">
                        <Skeleton className="h-3 w-32" />
                        <Skeleton className="h-4 w-8" />
                    </div>
                    <div className="flex-1 bg-background rounded-2xl border shadow-xl flex flex-col overflow-hidden">
                        <div className="h-10 bg-muted/30 border-b flex items-center px-4">
                            <Skeleton className="h-4 w-full rounded-full" />
                        </div>
                        <div className="flex-1 p-8 space-y-8">
                            <Skeleton className="h-12 w-3/4 mx-auto" />
                            <div className="space-y-3">
                                <Skeleton className="h-4 w-full" />
                                <Skeleton className="h-4 w-full" />
                                <Skeleton className="h-4 w-2/3" />
                            </div>
                            <Skeleton className="h-[200px] w-full rounded-xl" />
                            <Skeleton className="h-12 w-full rounded-lg" />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export const TableSkeleton = ({ rows = 5 }: { rows?: number }) => {
    return (
        <div className="space-y-4">
            <div className="flex items-center gap-4 py-2 border-b">
                <Skeleton className="h-4 w-1/4" />
                <Skeleton className="h-4 w-1/4" />
                <Skeleton className="h-4 w-1/4" />
                <Skeleton className="h-4 w-1/4" />
            </div>
            {[...Array(rows)].map((_, i) => (
                <div key={i} className="flex items-center gap-4 py-3 border-b border-slate-50">
                    <Skeleton className="h-4 w-[150px]" />
                    <Skeleton className="h-4 w-[100px]" />
                    <Skeleton className="h-4 w-[120px]" />
                    <Skeleton className="h-4 w-[80px]" />
                </div>
            ))}
        </div>
    );
};
