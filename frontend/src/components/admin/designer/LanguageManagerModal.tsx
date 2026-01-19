import { useState } from 'react';
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
import { Check, Plus, Languages, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';

interface Language {
    code: string;
    label: string;
    flag: string;
}

const UI_LANGUAGES: Language[] = [
    { code: 'en', label: 'English', flag: 'EN' },
    { code: 'fr', label: 'Français', flag: 'FR' },
    { code: 'fi', label: 'Suomi', flag: 'FI' },
];

interface LanguageManagerModalProps {
    isOpen: boolean;
    onClose: () => void;
}

const LanguageManagerModal = ({ isOpen, onClose }: LanguageManagerModalProps) => {
    const { t } = useTranslation();
    const { draft, updateDraft } = useStudyDesigner();
    const [isActivating, setIsActivating] = useState<string | null>(null);
    const [sourceLang, setSourceLang] = useState<string>('en');

    if (!draft) return null;

    const activeLanguageCodes = (draft.translations || []).map((t) => t.language_code);

    const handleActivate = (langCode: string) => {
        setIsActivating(langCode);
        // Default source language to English or the first active language
        setSourceLang(activeLanguageCodes.includes('en') ? 'en' : activeLanguageCodes[0] || 'en');
    };

    const confirmActivation = () => {
        if (!isActivating) return;

        updateDraft((d) => {
            // 1. Find source translation
            const sourceTrans = d.translations?.find((t) => t.language_code === sourceLang);

            // 2. Create new translation
            const newTrans = {
                ...(sourceTrans || {}),
                language_code: isActivating,
                // Add a marker that it's a copy
                _is_copy: true,
                title: sourceTrans?.title ? `${sourceTrans.title} [COPY]` : '',
            };
            // biome-ignore lint/suspicious/noExplicitAny: translation type mismatch
            d.translations?.push(newTrans as any);

            // 3. Update statements
            if (d.statements) {
                for (const s of d.statements) {
                    const sSourceTrans = s.translations?.find(
                        (st) => st.language_code === sourceLang
                    );
                    if (sSourceTrans) {
                        s.translations?.push({
                            language_code: isActivating,
                            text: sSourceTrans.text,
                        });
                    } else {
                        s.translations?.push({
                            language_code: isActivating,
                            text: '',
                        });
                    }
                }
            }
        });

        setIsActivating(null);
    };

    const handleDeactivate = (langCode: string) => {
        if (langCode === 'en' && activeLanguageCodes.length === 1) return; // Prevent last language removal

        updateDraft((d) => {
            // Remove the translation object entirely to disable the language
            d.translations = (d.translations || []).filter((t) => t.language_code !== langCode);
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
                        {UI_LANGUAGES.map((lang) => {
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
                                            <div className="text-xs text-slate-500 uppercase font-mono">
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

            {/* Activation Sub-Modal (Langue Source) */}
            <Dialog open={!!isActivating} onOpenChange={() => setIsActivating(null)}>
                <DialogContent className="sm:max-w-[400px]">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 font-black">
                            <Plus className="h-5 w-5 text-indigo-600" />
                            {t('admin.design.languages.activate_title', 'Activate Language')}
                        </DialogTitle>
                        <DialogDescription>
                            {t(
                                'admin.design.languages.activate_desc',
                                'Choose a source language to copy translations from. This prevents empty fields for participants.'
                            )}
                        </DialogDescription>
                    </DialogHeader>

                    <div className="py-4 space-y-4">
                        <div className="space-y-2">
                            <label
                                htmlFor="source-lang-select"
                                className="text-xs font-bold uppercase text-slate-500 tracking-wider"
                            >
                                {t('admin.design.languages.source_label', 'Source Language')}
                            </label>
                            <Select value={sourceLang} onValueChange={setSourceLang}>
                                <SelectTrigger
                                    id="source-lang-select"
                                    className="w-full bg-slate-50 border-slate-200 font-medium"
                                >
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {activeLanguageCodes.map((code) => (
                                        <SelectItem key={code} value={code}>
                                            <span className="flex items-center gap-2">
                                                {UI_LANGUAGES.find((l) => l.code === code)?.flag}{' '}
                                                {UI_LANGUAGES.find((l) => l.code === code)?.label ||
                                                    code}
                                            </span>
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="p-3 bg-amber-50 border border-amber-100 rounded-lg flex items-start gap-2">
                            <AlertCircle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                            <p className="text-[11px] text-amber-800 leading-relaxed">
                                {t(
                                    'admin.design.languages.copy_notice',
                                    'All fields will be copied. You will see a visual indicator on fields that still need your translation.'
                                )}
                            </p>
                        </div>
                    </div>

                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setIsActivating(null)}>
                            {t('common.cancel')}
                        </Button>
                        <Button
                            className="bg-indigo-600 hover:bg-indigo-700 font-bold"
                            onClick={confirmActivation}
                        >
                            {t('admin.design.languages.confirm_activate', 'Activate & Copy')}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </Dialog>
    );
};

export default LanguageManagerModal;
