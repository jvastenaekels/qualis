import type React from 'react';
import { useMemo } from 'react';
import ReactMarkdown, { type Options } from 'react-markdown';
import DOMPurify from 'dompurify';
import { useHyphenation } from '@/hooks/useHyphenation';

interface Props extends Options {
    children: string | null | undefined;
    allowLinks?: boolean;
    className?: string;
}

/**
 * A secure wrapper around ReactMarkdown that sanitizes input using DOMPurify.
 * Use this component instead of raw ReactMarkdown to prevent XSS.
 */
export const SafeMarkdown: React.FC<Props> = ({
    children,
    allowLinks = true,
    className,
    ...props
}) => {
    const hyphenateText = useHyphenation();

    const sanitizedContent = useMemo(() => {
        if (!children) return '';
        // Defense-in-depth: DOMPurify strips HTML tags (keeping text content),
        // then ReactMarkdown renders only Markdown syntax. urlTransform below
        // blocks dangerous link protocols as a second layer.
        const sanitized = DOMPurify.sanitize(children, {
            ALLOWED_TAGS: [],
            KEEP_CONTENT: true,
        });
        return hyphenateText(sanitized);
    }, [children, hyphenateText]);

    const urlTransform = (url: string) => {
        if (!allowLinks) return '#';
        if (
            url.startsWith('javascript:') ||
            url.startsWith('vbscript:') ||
            url.startsWith('file:')
        ) {
            return '#blocked';
        }
        return url;
    };

    // react-markdown v10 dropped the `className` prop. Wrap the output in a
    // div so callers can keep passing className for prose styling.
    return (
        <div
            className={`prose prose-sm max-w-none text-slate-600 [hyphens:manual] ${className || ''}`}
        >
            <ReactMarkdown {...props} urlTransform={urlTransform}>
                {sanitizedContent}
            </ReactMarkdown>
        </div>
    );
};
