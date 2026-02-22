import { useTranslation } from 'react-i18next';
import { useStudyDesigner } from '@/store/useStudyDesigner';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Check, Plus, Languages } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SUPPORTED_LANGUAGES, type Language } from '@/constants/languages';

interface LanguageManagerModalProps {
    isOpen: boolean;
    onClose: () => void;
}

const LanguageManagerModal = ({ isOpen, onClose }: LanguageManagerModalProps) => {
    const { t } = useTranslation();
    const { draft, original, updateDraft } = useStudyDesigner();

    if (!draft) return null;

    const activeLanguageCodes = (draft.translations || []).map((t) => t.language_code);

    const handleActivate = (langCode: string) => {
        // Check if this language exists in the original (saved) study
        // If so, restore it instead of copying from source
        const existingTranslation = original?.translations?.find(
            (t) => t.language_code === langCode
        );

        if (existingTranslation) {
            updateDraft((d) => {
                // 1. Restore translation object
                // 1. Restore translation object
                d.translations?.push({
                    ...existingTranslation,
                    // Ensure we reset any copy flag if it existed
                    _is_copy: false,
                    // biome-ignore lint/suspicious/noExplicitAny: explicit bypass for draft update
                } as any);

                // 2. Restore statement translations
                if (d.statements) {
                    for (const s of d.statements) {
                        // Find the original statement to get its translation
                        // We match by code, assuming code is stable.
                        // If statement was added in draft (no original), it won't have an original translation.
                        const originalStmt = original?.statements?.find((os) => os.code === s.code);

                        const originalStmtTrans = originalStmt?.translations?.find(
                            (st) => st.language_code === langCode
                        );

                        if (originalStmtTrans) {
                            s.translations?.push({
                                language_code: langCode,
                                text: originalStmtTrans.text,
                            });
                        } else {
                            // If no original translation (e.g. statement is new),
                            // we might want to copy from source?
                            // But here we are "restoring" the language.
                            // If the statement is new, it has no translation in this restored language.
                            // Default to empty string.
                            s.translations?.push({
                                language_code: langCode,
                                text: '',
                            });
                        }
                    }
                }
            });
            return;
        }

        updateDraft((d) => {
            // 1. Create a minimal translation object if it doesn't exist
            // (Note: updateDraft already runs normalizeStudyData which ensures translations exist)
            // But we want to explicitly add it here if it's missing from the array
            const exists = d.translations?.some((t) => t.language_code === langCode);
            if (!exists) {
                d.translations?.push({
                    language_code: langCode,
                    title: '',
                    subtitle: '',
                    description: '',
                    instructions: '',
                    condition_of_instruction: '',
                    // biome-ignore lint/suspicious/noExplicitAny: explicit bypass for draft update
                } as any);
            }

            // 2. Initialize statement translations if missing
            if (d.statements) {
                for (const s of d.statements) {
                    const hasTrans = s.translations?.some((st) => st.language_code === langCode);
                    if (!hasTrans) {
                        s.translations?.push({
                            language_code: langCode,
                            text: '',
                        });
                    }
                }
            }
        });
    };

    const handleDeactivate = (langCode: string) => {
        if (langCode === 'en' && activeLanguageCodes.length === 1) return; // Prevent last language removal

        updateDraft((d) => {
            // Remove the translation object entirely to disable the language
            d.translations = (d.translations || []).filter((t) => t.language_code !== langCode);

            // If we removed the default language, pick a new one
            if (d.default_language === langCode) {
                d.default_language = d.translations[0]?.language_code || null;
            }
        });
    };

    const toggleLanguage = (langCode: string) => {
        const isActive = activeLanguageCodes.includes(langCode);
        if (!isActive) {
            handleActivate(langCode);
        } else {
            handleDeactivate(langCode);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                    <div className="flex items-center gap-2 mb-2">
                        <div className="p-2 bg-indigo-50 rounded-lg text-indigo-600">
                            <Languages className="h-5 w-5" />
                        </div>
                        <DialogTitle>
                            {t('admin.design.languages.manage_title', 'Manage Languages')}
                        </DialogTitle>
                    </div>
                    <DialogDescription>
                        {t(
                            'admin.design.languages.manage_desc',
                            'Enable or disable languages available for participants to see in this study.'
                        )}
                    </DialogDescription>
                </DialogHeader>

                <div className="py-6 space-y-4">
                    <div className="grid gap-3">
                        {SUPPORTED_LANGUAGES.map((lang: Language) => {
                            const isActive = activeLanguageCodes.includes(lang.code);

                            return (
                                <button
                                    type="button"
                                    key={lang.code}
                                    className={cn(
                                        'flex items-center justify-between p-4 rounded-xl border transition-all cursor-pointer group w-full text-left',
                                        isActive
                                            ? 'bg-indigo-50/50 border-indigo-200 shadow-sm'
                                            : 'bg-white border-slate-200 hover:border-slate-300'
                                    )}
                                    onClick={() => toggleLanguage(lang.code)}
                                >
                                    <div className="flex items-center gap-4">
                                        <div className="text-2xl">{lang.flag}</div>
                                        <div>
                                            <div className="font-bold text-slate-900">
                                                {lang.label}
                                            </div>
                                            <div className="text-xs text-slate-500 font-mono">
                                                {lang.code}
                                            </div>
                                        </div>
                                    </div>

                                    {isActive ? (
                                        <div className="flex items-center gap-2">
                                            <Badge
                                                variant="secondary"
                                                className="bg-indigo-100 text-indigo-700 border-none"
                                            >
                                                <Check className="h-3 w-3 mr-1" />{' '}
                                                {t('common.active', 'Active')}
                                            </Badge>
                                        </div>
                                    ) : (
                                        <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                                            <Plus className="h-5 w-5 text-slate-400" />
                                        </div>
                                    )}
                                </button>
                            );
                        })}
                    </div>
                </div>

                <DialogFooter className="sm:justify-between border-t pt-4">
                    <Button variant="ghost" onClick={onClose}>
                        {t('common.close')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};

export default LanguageManagerModal;
