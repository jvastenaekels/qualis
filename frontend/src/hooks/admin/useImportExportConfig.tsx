/*
 * Qualis - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

import { useRef, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useStudyDesigner } from '@/store/useStudyDesigner';
import { AdminService } from '@/api/admin';

/**
 * Import handler for study configuration JSON files.
 *
 * Returns a tuple of:
 * - `triggerImport`: callback that opens the OS file picker
 * - `fileInput`: hidden `<input type="file">` element to render once in the tree
 * - `isImporting`: pending flag for spinner UIs
 *
 * Extracted from ImportConfigButton (Wave B) so the action can be invoked
 * from a DropdownMenuItem rather than a stand-alone Button.
 */
export function useImportConfig() {
    const { t } = useTranslation();
    const [isImporting, setIsImporting] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const importConfig = useStudyDesigner((state) => state.importConfig);

    const triggerImport = useCallback(() => {
        fileInputRef.current?.click();
    }, []);

    const handleFileChange = useCallback(
        async (event: React.ChangeEvent<HTMLInputElement>) => {
            const file = event.target.files?.[0];
            if (!file) return;

            event.target.value = '';

            if (file.type !== 'application/json' && !file.name.endsWith('.json')) {
                toast.error(
                    t('admin.import.invalid_type', 'Invalid file type. Please upload a JSON file.')
                );
                return;
            }

            try {
                setIsImporting(true);
                const content = await file.text();
                const config = JSON.parse(content);

                const studyData = config.study || config;
                if (!studyData.translations && !studyData.statements && !studyData.grid_config) {
                    throw new Error('Invalid study configuration format');
                }

                importConfig(config);
                toast.success(t('admin.import.success', 'Configuration imported successfully'));
            } catch (error: unknown) {
                console.error('Import failed:', error);
                const errorMsg = error instanceof Error ? error.message : 'Unknown error';
                toast.error(
                    t(
                        'admin.import.error',
                        'Could not import configuration. See details below and retry.'
                    ),
                    { description: errorMsg }
                );
            } finally {
                setIsImporting(false);
            }
        },
        [importConfig, t]
    );

    const fileInput = (
        <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept=".json,application/json"
            className="hidden"
        />
    );

    return { triggerImport, fileInput, isImporting };
}

/**
 * Export handler for study configuration JSON dumps.
 *
 * Returns:
 * - `triggerExport`: callback that fetches + triggers a browser download
 * - `isExporting`: pending flag
 *
 * Extracted from ExportConfigButton (Wave B) — same rationale as import.
 */
export function useExportConfig(studySlug: string) {
    const { t } = useTranslation();
    const [isExporting, setIsExporting] = useState(false);

    const triggerExport = useCallback(async () => {
        try {
            setIsExporting(true);
            const response = await AdminService.exportStudyConfig(studySlug);
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
        } catch (error: unknown) {
            console.error('Export failed:', error);
            const errorMsg = error instanceof Error ? error.message : 'Unknown error';
            toast.error(
                t('admin.export.config_error', 'Could not export configuration. Try again.'),
                { description: errorMsg }
            );
        } finally {
            setIsExporting(false);
        }
    }, [studySlug, t]);

    return { triggerExport, isExporting };
}
