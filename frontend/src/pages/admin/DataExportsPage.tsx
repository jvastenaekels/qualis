import { useLoaderData } from 'react-router-dom';
import InteractiveDataView from '@/components/admin/dashboard/InteractiveDataView';

export default function DataExportsPage() {
    // biome-ignore lint/suspicious/noExplicitAny: loader data type
    const { participants, slug } = useLoaderData() as any;
    return (
        <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6 pt-2">
            <InteractiveDataView slug={slug} participants={participants} />
        </div>
    );
}
