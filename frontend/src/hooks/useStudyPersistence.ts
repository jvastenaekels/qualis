import { useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useStudyDesigner, projectStudyToUpdate, areStudiesEqual } from '@/store/useStudyDesigner';
import { useUpdateStudyApiAdminStudiesSlugPatch } from '@/api/generated';
import type { StudyUpdate, StudyRead } from '@/api/model';
import { useBlocker, useParams } from 'react-router-dom';
import type { ApiError } from '@/api/client';
import { mergeStudyUpdates } from '@/utils/mergeStudy';
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
    const abortControllerRef = useRef<AbortController | null>(null);

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

    // 4. Change Detection Logic
    useEffect(() => {
        if (!draft || !effectiveSlug) return;

        // Detect if something actually changed relative to what's on server or last saved
        const originalDraft = original ? projectStudyToUpdate(original) : null;

        // If draft content matches original content or last saved content
        const isSyncedWithOriginal = areStudiesEqual(draft, originalDraft);
        const isSyncedWithLastSave =
            lastSavedDraftRef.current &&
            areStudiesEqual(draft, JSON.parse(lastSavedDraftRef.current));

        if (isSyncedWithOriginal || isSyncedWithLastSave) {
            if (syncStatus !== 'synced' && syncStatus !== 'saving') {
                setSyncStatus('synced');
            }
            return;
        }

        // Mark as modified if not already saving
        if (syncStatus !== 'modified' && syncStatus !== 'saving' && syncStatus !== 'error') {
            setSyncStatus('modified');
        }

        // 5. Local Backup Logic
        // We keep a local backup in localStorage keyed by slug
        // This is a safety measure against crashes/refreshes.
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
                // Also update the test draft key so open test tabs can react via 'storage' event
                localStorage.setItem(`qualis-test-draft-${effectiveSlug}`, JSON.stringify(draft));
            }
        }, 1000); // Debounce backup

        return () => clearTimeout(backupTimer);
    }, [draft, effectiveSlug, original, setSyncStatus, syncStatus]);

    // 5. Manual Save Function
    const save = useCallback(async () => {
        if (!draft || !effectiveSlug || syncStatus === 'saving') return;

        const draftJson = JSON.stringify(draft);

        // Cancel any in-flight requests
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }
        abortControllerRef.current = new AbortController();

        setSyncStatus('saving');

        try {
            const result = await updateMutation.mutateAsync({
                slug: effectiveSlug as string,
                data: draft as StudyUpdate,
            });

            // Success
            lastSavedDraftRef.current = draftJson;
            setSyncStatus('synced');
            setLastSavedAt(new Date());

            // Sync original and draft immediately to reflect server state
            // This also ensures last_updated_at matches the server's new timestamp
            setStudy(result);

            // Ensure test draft is synced on successful save
            localStorage.setItem(`qualis-test-draft-${effectiveSlug}`, JSON.stringify(draft));

            toast.success(t('admin.study.save.success'));
        } catch (error) {
            if (error instanceof Error && error.name === 'AbortError') {
                return;
            }

            const apiError = error as ApiError & {
                details: { server_state: StudyRead };
            };

            // Optimistic Locking: 409 Conflict
            if (apiError?.status === 409 && apiError.details?.server_state) {
                try {
                    const serverRead = apiError.details.server_state;
                    const serverUpdate = projectStudyToUpdate(serverRead);
                    const originalUpdate = original ? projectStudyToUpdate(original) : null;

                    const mergeResult = mergeStudyUpdates(
                        draft,
                        serverUpdate,
                        originalUpdate,
                        'local-wins'
                    );

                    if (mergeResult.success && mergeResult.merged) {
                        if (mergeResult.warnings && mergeResult.warnings.length > 0) {
                            toast.info(
                                t('admin.study.save.synced_warnings', {
                                    fields: mergeResult.warnings.join(', '),
                                })
                            );
                        } else {
                            toast.info(t('admin.study.save.synced_concurrent'));
                        }

                        // 1. Update Baseline (server state becomes new original)
                        updateOriginal(serverRead);

                        // 2. Update Draft with Merged Content
                        updateDraft((d) => {
                            // Clear existing keys to ensure removal works
                            Object.keys(d).forEach((k) => {
                                // @ts-expect-error
                                if (mergeResult.merged[k] === undefined) delete d[k];
                            });
                            Object.assign(d, mergeResult.merged);
                        });

                        // 3. Mark as modified because the user still hasn't "saved" this merged result
                        // to the backend, or they might want to review it.
                        // Actually, in manual mode, maybe we should still be in 'modified' state?
                        // If we just merged and haven't pushed it back to server, we are definitely NOT synced.
                        lastSavedDraftRef.current = null; // Forces re-evaluation
                        setSyncStatus('modified');
                        return;
                    } else {
                        // Hard Conflict
                        toast.error(
                            t(
                                'admin.study.save.conflict',
                                'Conflict detected. Some changes could not be merged.'
                            )
                        );
                        setSyncStatus('error');
                        return;
                    }
                } catch (mergeError) {
                    console.error('Merge failed', mergeError);
                    setSyncStatus('error');
                }
            } else {
                console.error('Save failed:', error);
                setSyncStatus('error');
                toast.error(t('admin.study.save.error', 'Failed to save changes'));
            }
        }
    }, [
        draft,
        effectiveSlug,
        syncStatus,
        setSyncStatus,
        updateMutation,
        setLastSavedAt,
        setStudy,
        original,
        updateDraft,
        updateOriginal,
        t,
    ]);

    return {
        save,
        syncStatus,
        lastSavedAt,
        blocker,
    };
}
