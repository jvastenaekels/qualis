import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Languages } from 'lucide-react';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuTrigger,
    DropdownMenuLabel,
    DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { SUPPORTED_LANGUAGES } from '@/constants/languages';
import { cn } from '@/lib/utils';
import { SafeMarkdown } from '@/components/SafeMarkdown';

interface MultiLangFieldIconProps {
    /** Map of language code to string value or a list of translation objects */
    translations:
        | Record<string, string>
        | { language_code: string; value?: string; text?: string }[];
    activeLocale: string;
    className?: string;
}

/**
 * A small icon that displays other translations for a field in a dropdown.
 */
export const MultiLangFieldIcon = ({
    translations,
    activeLocale,
    className,
}: MultiLangFieldIconProps) => {
    const { t } = useTranslation();

    const otherTranslations = useMemo(() => {
        const result: { code: string; value: string; label: string; flag: string }[] = [];

        const getLangInfo = (code: string) => {
            const lang = SUPPORTED_LANGUAGES.find((l) => l.code === code);
            return {
                label: lang?.label || code,
                flag: lang?.flag || '🌐',
            };
        };

        if (Array.isArray(translations)) {
            for (const item of translations) {
                if (item.language_code === activeLocale) continue;
                const value = item.text ?? item.value ?? '';
                if (!value.trim()) continue;

                const info = getLangInfo(item.language_code);
                result.push({
                    code: item.language_code,
                    value,
                    ...info,
                });
            }
        } else {
            for (const [code, value] of Object.entries(translations)) {
                if (code === activeLocale) continue;
                if (!value || !value.trim()) continue;

                const info = getLangInfo(code);
                result.push({
                    code,
                    value,
                    ...info,
                });
            }
        }

        return result;
    }, [translations, activeLocale]);

    if (otherTranslations.length === 0) return null;

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button
                    variant="ghost"
                    size="sm"
                    className={cn(
                        'h-6 w-6 p-0 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-md transition-all',
                        className
                    )}
                    title={t('admin.design.multilang.view_others', 'View in other languages')}
                >
                    <Languages className="h-3.5 w-3.5" />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
                align="end"
                className="w-80 max-h-[400px] overflow-y-auto rounded-xl shadow-xl border-slate-100 p-2"
            >
                <DropdownMenuLabel className="text-[10px] font-black uppercase tracking-widest text-slate-400 px-2 py-1.5">
                    {t('admin.design.multilang.other_formulations', 'Other Formulations')}
                </DropdownMenuLabel>
                <DropdownMenuSeparator className="bg-slate-100 my-1" />
                {otherTranslations.map((trans) => (
                    <div
                        key={trans.code}
                        className="px-2 py-3 space-y-1.5 border-b border-slate-50 last:border-0"
                    >
                        <div className="flex items-center gap-2 group">
                            <span className="text-xs">{trans.flag}</span>
                            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider group-hover:text-indigo-600 transition-colors">
                                {trans.label}
                            </span>
                        </div>
                        <div className="text-sm font-medium text-slate-700 bg-slate-50/50 p-2 rounded-lg border border-slate-100/50">
                            {/* We use SafeMarkdown for richer fields like instructions */}
                            <SafeMarkdown>{trans.value}</SafeMarkdown>
                        </div>
                    </div>
                ))}
            </DropdownMenuContent>
        </DropdownMenu>
    );
};
