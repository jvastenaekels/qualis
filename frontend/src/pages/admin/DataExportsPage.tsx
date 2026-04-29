import { useLoaderData, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Database, Inbox } from 'lucide-react';
import InteractiveDataView from '@/components/admin/dashboard/InteractiveDataView';
import { EmptyStateContract } from '@/components/admin/EmptyStateContract';
import { StudyPageHeader } from '@/components/admin/layout/StudyPageHeader';

export default function DataExportsPage() {
    const { t } = useTranslation();
    const { projectSlug, studySlug } = useParams<{ projectSlug: string; studySlug: string }>();
    // biome-ignore lint/suspicious/noExplicitAny: loader data type
    const { participants, slug } = useLoaderData() as any;

    // ── Empty-state contract: no submissions yet ──────────────────────────
    // Wave A — UX progressive-disclosure audit. The data view (4 metric cards,
    // sortable table, CSV/JSON exports) only carries meaning once participants
    // have submitted. Until then, render an honest contract pointing the user
    // to the share-link surface.
    if (!participants || participants.length === 0) {
        return (
            <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6 pt-2">
                <StudyPageHeader
                    title={t('admin.data.title', 'Data')}
                    description={t(
                        'admin.data.description',
                        'Browse responses, export raw data, and inspect submission metadata'
                    )}
                    icon={Database}
                />
                <EmptyStateContract
                    icon={Inbox}
                    title={t('admin.data.empty.contract_title', 'No submissions yet')}
                    body={t(
                        'admin.data.empty.contract_body',
                        'Submissions and exports will appear here. Share the study link to start collecting.'
                    )}
                    ctaLabel={t('admin.data.empty.contract_cta', 'Open study overview')}
                    ctaTo={`/app/${projectSlug ?? ''}/studies/${studySlug ?? ''}`}
                />
            </div>
        );
    }

    return (
        <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6 pt-2">
            <InteractiveDataView slug={slug} participants={participants} />
        </div>
    );
}
