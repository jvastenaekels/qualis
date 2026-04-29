import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';

interface ExportPackageDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    isExportLoading: boolean;
    onDownload: (includeDiscussion: boolean) => void;
}

export function ExportPackageDialog({
    open,
    onOpenChange,
    isExportLoading,
    onDownload,
}: ExportPackageDialogProps) {
    const { t } = useTranslation();
    const [includeDiscussion, setIncludeDiscussion] = useState(false);

    function handleDownload() {
        onOpenChange(false);
        onDownload(includeDiscussion);
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>
                        {t('admin.export.package_dialog.title', 'Download research package')}
                    </DialogTitle>
                    <DialogDescription>
                        {t(
                            'admin.export.package_dialog.description',
                            'Bundles all study data into a single ZIP for OSF / pre-registration.'
                        )}
                    </DialogDescription>
                </DialogHeader>
                <div className="flex items-start gap-2 py-2">
                    <Checkbox
                        id="include-discussion"
                        checked={includeDiscussion}
                        onCheckedChange={(c) => setIncludeDiscussion(c === true)}
                    />
                    <div className="flex flex-col gap-1">
                        <Label htmlFor="include-discussion" className="font-medium">
                            {t(
                                'admin.memo.include_discussion_in_export',
                                'Include memo discussion threads'
                            )}
                        </Label>
                        <p className="text-xs text-slate-500">
                            {t(
                                'admin.export.package_dialog.discussion_hint',
                                'Adds memo/memo-discussion.md with all comment threads (signed and dated). Off by default — keep your export clean unless you want the deliberation trail.'
                            )}
                        </p>
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="ghost" onClick={() => onOpenChange(false)}>
                        {t('admin.memo.cancel', 'Cancel')}
                    </Button>
                    <Button onClick={handleDownload} disabled={isExportLoading}>
                        {t('admin.export.download', 'Download')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
