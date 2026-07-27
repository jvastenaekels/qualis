import {
    User,
    Zap,
    Scale,
    MessageSquareText,
    ClipboardList,
    CheckCircle,
    Flag,
    Info,
    HelpCircle,
    FileText,
    LayoutGrid,
    Rocket,
    Target,
    Brain,
    Lightbulb,
    ListChecks,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

const ICONS = {
    User,
    Zap,
    Scale,
    MessageSquareText,
    ClipboardList,
    CheckCircle,
    Flag,
    Info,
    HelpCircle,
    FileText,
    LayoutGrid,
    Rocket,
    Target,
    Brain,
    Lightbulb,
    ListChecks,
};

type IconName = keyof typeof ICONS;

/**
 * Fallback text for each icon's translated name — `name` from `ICONS` is a
 * raw lucide component identifier (`MessageSquareText`, `ListChecks`) and is
 * not fit to announce to a screen-reader user, so every button is named via
 * `t()` instead of `title={name}`.
 */
const ICON_NAME_FALLBACKS: Record<IconName, string> = {
    User: 'Person',
    Zap: 'Lightning bolt',
    Scale: 'Balance',
    MessageSquareText: 'Message',
    ClipboardList: 'Clipboard',
    CheckCircle: 'Checkmark',
    Flag: 'Flag',
    Info: 'Information',
    HelpCircle: 'Help',
    FileText: 'Document',
    LayoutGrid: 'Grid',
    Rocket: 'Rocket',
    Target: 'Target',
    Brain: 'Brain',
    Lightbulb: 'Idea',
    ListChecks: 'Checklist',
};

interface IconPickerProps {
    selectedIcon: string;
    onChange: (icon: IconName) => void;
    disabled?: boolean;
    /**
     * Id of the visible heading that names this picker as a group — the
     * caller supplies its own heading text (e.g. "Icon") and points it here
     * via `aria-labelledby`, same pattern as the other 6.7b group fixes.
     */
    ariaLabelledBy?: string;
}

export function IconPicker({ selectedIcon, onChange, disabled, ariaLabelledBy }: IconPickerProps) {
    const { t } = useTranslation();

    return (
        <div
            role="group"
            aria-labelledby={ariaLabelledBy}
            className={cn('grid grid-cols-4 gap-2', disabled && 'opacity-50 pointer-events-none')}
        >
            {Object.entries(ICONS).map(([name, Icon]) => {
                const iconName = name as IconName;
                const label = t(
                    `admin.components.icon_picker.icons.${iconName}`,
                    ICON_NAME_FALLBACKS[iconName]
                );
                return (
                    <button
                        key={name}
                        type="button"
                        disabled={disabled}
                        onClick={() => onChange(iconName)}
                        className={cn(
                            'flex aspect-square items-center justify-center rounded-lg border p-2 transition-all hover:bg-accent hover:text-accent-foreground',
                            selectedIcon === name
                                ? 'border-primary bg-primary/10 text-primary'
                                : 'border-muted bg-background text-muted-foreground'
                        )}
                        title={label}
                        aria-label={label}
                    >
                        <Icon size={20} strokeWidth={selectedIcon === name ? 2.5 : 2} />
                    </button>
                );
            })}
        </div>
    );
}
