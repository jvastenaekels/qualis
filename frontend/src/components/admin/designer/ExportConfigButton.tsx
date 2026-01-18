import { useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { AdminService } from '@/api/admin';

interface ExportConfigButtonProps {
    studySlug: string;
    variant?: 'default' | 'outline' | 'ghost' | 'secondary' | 'destructive' | 'link';
    className?: string;
}

/**
 * Button component to export study configuration as JSON file
 */
export function ExportConfigButton({
    studySlug,
    variant = 'outline',
    className,
}: ExportConfigButtonProps) {
    const { t } = useTranslation();
    const [isExporting, setIsExporting] = useState(false);

    const handleExport = async () => {
        try {
            setIsExporting(true);

            // Call export API
            const response = await AdminService.exportStudyConfig(studySlug);

            // Create blob and download
            const blob = new Blob([JSON.stringify(response, null, 2)], {
                type: 'application/json',
            });
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `${studySlug}_config_${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.URL.revokeObjectURL(url);

            toast.success(t('admin.export.config_success', 'Configuration exported successfully'));
        } catch (error: any) {
            console.error('Export failed:', error);
            toast.error(t('admin.export.config_error', 'Failed to export configuration'), {
                description: error.message,
            });
        } finally {
            setIsExporting(false);
        }
    };

    return (
        <Button
            variant={variant}
            className={className}
            onClick={handleExport}
            disabled={isExporting}
        >
            {isExporting ? (
                <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    {t('admin.export.exporting', 'Exporting...')}
                </>
            ) : (
                <>
                    <Download className="h-4 w-4 mr-2" />
                    {t('admin.export.config', 'Export Configuration')}
                </>
            )}
        </Button>
    );
}
