import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import type { StudyRead } from '@/api/model';

interface FocusModeHeaderProps {
    projectSlug: string | undefined;
    projectTitle: string | undefined;
    study: StudyRead | undefined;
    studySlug: string;
}

function resolveStudyTitle(study: StudyRead | undefined, fallbackSlug: string): string {
    return study?.translations?.[0]?.title || fallbackSlug;
}

export function FocusModeHeader({
    projectSlug,
    projectTitle,
    study,
    studySlug,
}: FocusModeHeaderProps) {
    const navigate = useNavigate();
    const { t } = useTranslation();
    const title = resolveStudyTitle(study, studySlug);

    return (
        <div className="flex flex-col gap-2">
            <button
                type="button"
                onClick={() => navigate(`/app/${projectSlug}/dashboard`)}
                className="flex items-center gap-2 px-2 py-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
                <ArrowLeft className="h-4 w-4" />
                <span>{projectTitle || t('admin.sidebar.project', 'Project')}</span>
            </button>
            <div className="px-2">
                <Badge variant="outline" className="font-semibold" title={title}>
                    {title}
                </Badge>
            </div>
        </div>
    );
}
