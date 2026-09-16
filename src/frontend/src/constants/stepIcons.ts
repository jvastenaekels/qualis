/*
 * Qualis - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

/**
 * The finite set of icons a study's `process_steps[].icon` may name.
 *
 * Named imports only: a namespace import of `lucide-react` ships the whole
 * icon set (hundreds of components) in whichever chunk uses it, and the
 * component that resolves step icons renders on the participant welcome
 * page, i.e. in the entry chunk of every participant.
 *
 * Two lists because two writers:
 * - `PICKER_ICONS` is what a researcher can choose in the designer; each
 *   entry has an i18n label under `admin.components.icon_picker.icons`.
 * - `STEP_ICONS` adds the names the application writes on its own — the
 *   backend seeds `MessageSquare` for the post-sort step and the designer
 *   gives a new step `Circle` — so a stored study always resolves.
 *
 * `DynamicIcon.test.tsx` checks the second list against both defaults.
 */

import {
    Brain,
    CheckCircle,
    Circle,
    ClipboardList,
    FileText,
    Flag,
    HelpCircle,
    Info,
    LayoutGrid,
    Lightbulb,
    ListChecks,
    type LucideIcon,
    MessageSquare,
    MessageSquareText,
    Rocket,
    Scale,
    Target,
    User,
    Zap,
} from 'lucide-react';

export const PICKER_ICONS = {
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
} satisfies Record<string, LucideIcon>;

export type PickerIconName = keyof typeof PICKER_ICONS;

export const STEP_ICONS = {
    ...PICKER_ICONS,
    MessageSquare,
    Circle,
} satisfies Record<string, LucideIcon>;

export const FALLBACK_STEP_ICON: LucideIcon = HelpCircle;

export function resolveStepIcon(name: string): LucideIcon {
    return (STEP_ICONS as Record<string, LucideIcon>)[name] ?? FALLBACK_STEP_ICON;
}
