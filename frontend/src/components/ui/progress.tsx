import * as React from 'react';
import * as ProgressPrimitive from '@radix-ui/react-progress';

import { cn } from '@/lib/utils';

interface ProgressProps extends React.ComponentPropsWithoutRef<typeof ProgressPrimitive.Root> {
    /** Tailwind classes applied to the indicator (foreground) — useful for
     * brand-colored progress bars without changing the default. */
    indicatorClassName?: string;
    /** Indicator inline style (e.g., `{{ backgroundColor: 'var(--brand-accent)' }}`). */
    indicatorStyle?: React.CSSProperties;
}

const Progress = React.forwardRef<React.ElementRef<typeof ProgressPrimitive.Root>, ProgressProps>(
    ({ className, value, indicatorClassName, indicatorStyle, ...props }, ref) => (
        <ProgressPrimitive.Root
            ref={ref}
            className={cn(
                'relative h-4 w-full overflow-hidden rounded-full bg-secondary',
                className
            )}
            {...props}
        >
            <ProgressPrimitive.Indicator
                className={cn('h-full w-full flex-1 bg-primary transition-all', indicatorClassName)}
                style={{
                    transform: `translateX(-${100 - (value || 0)}%)`,
                    ...indicatorStyle,
                }}
            />
        </ProgressPrimitive.Root>
    )
);
Progress.displayName = ProgressPrimitive.Root.displayName;

export { Progress };
