import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useTranslation } from 'react-i18next';
import type { Blocker } from 'react-router-dom';

interface UnsavedChangesDialogProps {
    blocker: Blocker;
}

export function UnsavedChangesDialog({ blocker }: UnsavedChangesDialogProps) {
    const { t } = useTranslation();

    // Only show if the blocker is in 'blocked' state
    const isOpen = blocker.state === 'blocked';

    if (!isOpen) return null;

    return (
        <AlertDialog open={isOpen}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>
                        {t('admin.design.unsaved_changes.title', 'Unsaved Changes')}
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                        {t(
                            'admin.design.unsaved_changes.description',
                            'You have unsaved changes in your study design. If you leave now, these changes will be lost.'
                        )}
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel onClick={() => blocker.reset()}>
                        {t('admin.design.unsaved_changes.cancel', 'Keep editing')}
                    </AlertDialogCancel>
                    <AlertDialogAction
                        onClick={() => blocker.proceed()}
                        className="bg-red-600 hover:bg-red-700 font-bold"
                    >
                        {t('admin.design.unsaved_changes.confirm', 'Leave without saving')}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}
