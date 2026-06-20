import { useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useStudyDesigner, projectStudyToUpdate } from '@/store/useStudyDesigner';
import { isDraftInSync, resolveServerConflict } from './useStudyPersistence.helpers';
import { useUpdateStudyApiAdminStudiesSlugPatch } from '@/api/generated';
import type { StudyUpdate, StudyRead } from '@/api/model';
import { useBlocker, useParams } from 'react-router-dom';
import type { ApiError } from '@/api/client';
import { toast } from 'sonner';

/**
 * Custom hook that monitors the study designer draft and provides
 * manual persistence to the backend.
 */
export function useStudyPersistence() {
    const { t } = useTranslation();
    const { projectSlug, studySlug } = useParams<{ projectSlug: string; studySlug: string }>();
    const effectiveSlug = studySlug || projectSlug;
    const {
        draft,
        original,
        syncStatus,
        setSyncStatus,
        setLastSavedAt,
        updateDraft,
        lastSavedAt,
        setStudy,
        updateOriginal,
    } = useStudyDesigner();

    const updateMutation = useUpdateStudyApiAdminStudiesSlugPatch();

    // Track the last draft we successfully sent to avoid redundant saves
    const lastSavedDraftRef = useRef<string | null>(null);

    // 2. BeforeUnload Guard
    useEffect(() => {
        const handleBeforeUnload = (e: BeforeUnloadEvent) => {
            if (syncStatus === 'modified' || syncStatus === 'saving') {
                e.preventDefault();
                e.returnValue = 'You have unsaved changes. Are you sure you want to leave?';
            }
        };
        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, [syncStatus]);

    // 3. React Router Navigation Guard (Internal Link Blocking)
    const blocker = useBlocker(
        ({ currentLocation, nextLocation }) =>
            (syncStatus === 'modified' || syncStatus === 'saving') &&
            currentLocation.pathname !== nextLocation.pathname
    );

    // Exposed blocker for UI handling
    // We intentionally removed the window.confirm logic here to let the UI handle it via the blocker object

    useEffect(() => {
        if (!draft || !effectiveSlug) return;

        const synced = isDraftInSync(
            draft,
            original ? projectStudyToUpdate(original) : null,
            lastSavedDraftRef.current
        );

        if (synced) {
            if (syncStatus !== 'synced' && syncStatus !== 'saving') {
                setSyncStatus('synced');
            }
            return;
        }

        if (syncStatus !== 'modified' && syncStatus !== 'saving' && syncStatus !== 'error') {
            setSyncStatus('modified');
        }

        // 5. Local Backup Logic — keeps a localStorage snapshot keyed by slug
        // as a safety net against crashes/refreshes. Debounced 1s so we don't
        // hammer storage on every keystroke.
        const backupTimer = setTimeout(() => {
            if (syncStatus === 'modified' || syncStatus === 'saving') {
                const backupData = {
                    ...draft,
                    _study_id: original?.id,
                    _backup_at: new Date().toISOString(),
                };
                localStorage.setItem(
                    `qualis-draft-backup-${effectiveSlug}`,
                    JSON.stringify(backupData)
                );
                // Also update the test-draft key so open test tabs react via 'storage' event.
                localStorage.setItem(`qualis-test-draft-${effectiveSlug}`, JSON.stringify(draft));
            }
        }, 1000);

        return () => clearTimeout(backupTimer);
    }, [draft, effectiveSlug, original, setSyncStatus, syncStatus]);

    // Applies a resolved 409 conflict to local state.
    const applyConflict = useCallback(
        (apiError: ApiError & { details: { server_state: StudyRead } }) => {
            const serverRead = apiError.details.server_state;
            const serverUpdate = projectStudyToUpdate(serverRead);
            const originalUpdate = original ? projectStudyToUpdate(original) : null;
            const resolution = resolveServerConflict(
                draft as StudyUpdate,
                serverUpdate,
                originalUpdate
            );

            if (resolution.kind === 'merged') {
                if (resolution.warnings.length > 0) {
                    toast.info(
                        t('admin.study.save.synced_warnings', {
                            fields: resolution.warnings.join(', '),
                        })
                    );
                } else {
                    toast.info(t('admin.study.save.synced_concurrent'));
                }
                updateOriginal(serverRead);
                updateDraft((d) => {
                    Object.keys(d).forEach((k) => {
                        // @ts-expect-error
                        if (resolution.merged[k] === undefined) delete d[k];
                    });
                    Object.assign(d, resolution.merged);
                });
                lastSavedDraftRef.current = null;
                setSyncStatus('modified');
                return true;
            }

            toast.error(
                t(
                    'admin.study.save.conflict',
                    'Conflict detected. Some changes could not be merged.'
                )
            );
            setSyncStatus('error');
            return false;
        },
        [draft, original, updateOriginal, updateDraft, setSyncStatus, t]
    );

    // Handles errors from the save mutation.
    const handleSaveError = useCallback(
        (error: unknown) => {
            const apiError = error as ApiError & { details: { server_state: StudyRead } };

            if (apiError?.status === 409 && apiError.details?.server_state) {
                try {
                    applyConflict(apiError);
                } catch (mergeError) {
                    console.error('Merge failed', mergeError);
                    setSyncStatus('error');
                }
            } else {
                console.error('Save failed:', error);
                setSyncStatus('error');
                toast.error(t('admin.study.save.error', 'Failed to save changes'));
            }
        },
        [applyConflict, setSyncStatus, t]
    );

    // 5. Manual Save Function
    const save = useCallback(async () => {
        if (!draft || !effectiveSlug || syncStatus === 'saving') return;

        const draftJson = JSON.stringify(draft);

        setSyncStatus('saving');

        try {
            const result = await updateMutation.mutateAsync({
                slug: effectiveSlug as string,
                data: draft as StudyUpdate,
            });

            lastSavedDraftRef.current = draftJson;
            setSyncStatus('synced');
            setLastSavedAt(new Date());
            setStudy(result);
            localStorage.setItem(`qualis-test-draft-${effectiveSlug}`, JSON.stringify(draft));
            toast.success(t('admin.study.save.success'));
        } catch (error) {
            handleSaveError(error);
        }
    }, [
        draft,
        effectiveSlug,
        syncStatus,
        setSyncStatus,
        updateMutation,
        setLastSavedAt,
        setStudy,
        handleSaveError,
        t,
    ]);

    return {
        save,
        syncStatus,
        lastSavedAt,
        blocker,
    };
}
