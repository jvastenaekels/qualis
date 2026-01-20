import { useLoaderData } from 'react-router-dom';
import InteractiveDataView from '@/components/admin/dashboard/InteractiveDataView';

export default function DataExportsPage() {
    // biome-ignore lint/suspicious/noExplicitAny: loader data type
    const { participants, slug } = useLoaderData() as any;
    return (
        <div className="p-4 md:p-8 space-y-8 max-w-7xl mx-auto">
            <InteractiveDataView slug={slug} participants={participants} />
        </div>
    );
}
