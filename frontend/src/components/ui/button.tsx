import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const buttonVariants = cva(
    'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
    {
        variants: {
            variant: {
                // The single primary fill for the whole product (task 4.1).
                // Written as literal indigo rather than `bg-primary` so the
                // invariant is greppable and testable: `--primary` is the
                // near-black slate token, which is what produced the two-colour
                // split (an indigo hand-rolled button next to a black
                // `<Button>` default) this variant exists to end.
                // white on indigo-600 = 6.29:1, on indigo-700 = 7.90:1 (AA).
                default: 'bg-indigo-600 text-white shadow hover:bg-indigo-700',
                // The *participant flow's* primary fill, which is not the
                // product's: `--brand-accent` is set on StudyLayout's root from
                // `branding.accent_color` (default `#2563eb`, white-on-fill
                // 5.17:1 — a study owner picking a pale accent is on their own,
                // and that is true of the four screens that already use it).
                // Only valid inside StudyLayout; anywhere else the var is
                // undefined and the button renders transparent.
                brand: 'bg-[var(--brand-accent)] text-white shadow-lg hover:brightness-110 hover:shadow-xl',
                // Warning / destructive-adjacent: design-lock and retention
                // actions only. Measured against a white page:
                //   rest  amber-600 fill 3.19:1 vs white (1.4.11 ≥3), label
                //         slate-900 on amber-600 5.60:1 (1.4.3 ≥4.5)
                //   hover amber-700 fill 5.02:1, label white on amber-700 5.02:1
                // The amber-500 + white it replaces measured 2.15:1 on both
                // counts and failed AA outright.
                warning:
                    'bg-amber-600 text-slate-900 shadow-sm hover:bg-amber-700 hover:text-white',
                destructive:
                    'bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90',
                outline:
                    'border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground',
                secondary: 'bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80',
                ghost: 'hover:bg-accent hover:text-accent-foreground',
                link: 'text-primary underline-offset-4 hover:underline',
            },
            size: {
                default: 'h-9 px-4 py-2',
                sm: 'h-8 rounded-md px-3 text-xs',
                lg: 'h-10 rounded-md px-8',
                icon: 'h-9 w-9',
                // The participant flow's button geometry — a full-height pill,
                // not the 36px product default. `whitespace-normal` because
                // `ui_labels` are study-supplied and can be arbitrarily long.
                pill: 'h-auto min-h-12 rounded-full px-8 py-3 text-base font-bold whitespace-normal',
            },
        },
        defaultVariants: {
            variant: 'default',
            size: 'default',
        },
    }
);

export interface ButtonProps
    extends React.ButtonHTMLAttributes<HTMLButtonElement>,
        VariantProps<typeof buttonVariants> {
    asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
    ({ className, variant, size, asChild = false, ...props }, ref) => {
        const Comp = asChild ? Slot : 'button';
        return (
            <Comp
                className={cn(buttonVariants({ variant, size, className }))}
                ref={ref}
                {...props}
            />
        );
    }
);
Button.displayName = 'Button';

export { Button, buttonVariants };
