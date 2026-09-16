/*
 * Qualis - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

import type { LucideProps } from 'lucide-react';
import { resolveStepIcon } from '../constants/stepIcons';

interface DynamicIconProps extends LucideProps {
    name: string;
}

/**
 * Renders a study step icon by its stored name, falling back to the help
 * icon for a name the registry does not know. Resolution goes through
 * `STEP_ICONS` (named imports) rather than a namespace import of
 * `lucide-react`, which would put the entire icon set in the participant
 * entry chunk.
 */
export const DynamicIcon = ({ name, ...props }: DynamicIconProps) => {
    const IconComponent = resolveStepIcon(name);
    return <IconComponent {...props} />;
};
