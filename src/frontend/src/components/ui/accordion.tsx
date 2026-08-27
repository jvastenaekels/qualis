'use client';

import * as React from 'react';
import * as AccordionPrimitive from '@radix-ui/react-accordion';
import { ChevronDown } from 'lucide-react';

import { cn } from '@/lib/utils';

const Accordion = AccordionPrimitive.Root;

const AccordionItem = React.forwardRef<
    React.ElementRef<typeof AccordionPrimitive.Item>,
    React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Item>
>(({ className, ...props }, ref) => (
    <AccordionPrimitive.Item ref={ref} className={cn('border-b', className)} {...props} />
));
AccordionItem.displayName = 'AccordionItem';

const AccordionTrigger = React.forwardRef<
    React.ElementRef<typeof AccordionPrimitive.Trigger>,
    React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Trigger> & {
        /**
         * Radix's `Accordion.Header` renders a hardcoded `<h3>`. Fine when an
         * `<h2>` precedes it in the document outline, but at least one call site
         * (`ExplorerPanel`'s "Advanced configuration" accordion) nests it directly
         * under a page's `<h1>` with nothing at `<h2>` in between — axe's
         * `heading-order` rule (task 6.7e) flags the resulting skip. Opt in per
         * call site rather than changing the default, since the right level
         * depends on what's around each accordion — a nested accordion one level
         * further in should stay at the default `<h3>`.
         */
        headingLevel?: 2;
    }
>(({ className, children, headingLevel, ...props }, ref) => {
    const trigger = (
        <AccordionPrimitive.Trigger
            ref={ref}
            className={cn(
                'flex flex-1 items-center justify-between py-4 text-sm font-medium transition-all hover:underline text-left [&[data-state=open]>svg]:rotate-180',
                className
            )}
            {...props}
        >
            {children}
            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200" />
        </AccordionPrimitive.Trigger>
    );

    if (headingLevel === 2) {
        return (
            <AccordionPrimitive.Header asChild>
                <h2 className="flex">{trigger}</h2>
            </AccordionPrimitive.Header>
        );
    }

    return <AccordionPrimitive.Header className="flex">{trigger}</AccordionPrimitive.Header>;
});
AccordionTrigger.displayName = AccordionPrimitive.Trigger.displayName;

const AccordionContent = React.forwardRef<
    React.ElementRef<typeof AccordionPrimitive.Content>,
    React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Content>
>(({ className, children, ...props }, ref) => (
    <AccordionPrimitive.Content
        ref={ref}
        className="overflow-hidden text-sm data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down"
        {...props}
    >
        <div className={cn('pb-4 pt-0', className)}>{children}</div>
    </AccordionPrimitive.Content>
));
AccordionContent.displayName = AccordionPrimitive.Content.displayName;

export { Accordion, AccordionItem, AccordionTrigger, AccordionContent };
