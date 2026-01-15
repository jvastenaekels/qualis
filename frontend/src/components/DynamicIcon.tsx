import * as LucideIcons from 'lucide-react';
import type { LucideProps } from 'lucide-react';

interface DynamicIconProps extends LucideProps {
    name: string;
}

export const DynamicIcon = ({ name, ...props }: DynamicIconProps) => {
    // biome-ignore lint/suspicious/noExplicitAny: dynamic icon lookup
    const IconComponent = (LucideIcons as any)[name] || LucideIcons.HelpCircle;

    // The previous explicit check `if (!IconComponent)` is now implicitly handled by `|| LucideIcons.HelpCircle`
    // So, the following block can be removed or adjusted based on desired behavior.
    // If `name` is not found, `IconComponent` will be `LucideIcons.HelpCircle`.
    // The original code had an explicit check and returned early.
    // The new line makes `IconComponent` always a valid component.

    return <IconComponent {...props} />;
};
