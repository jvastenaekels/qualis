import type React from 'react';
import { useMemo } from 'react';
import ReactMarkdown, { type Options } from 'react-markdown';
import DOMPurify from 'dompurify';

interface Props extends Options {
    children: string | null | undefined;
    allowLinks?: boolean;
}

/**
 * A secure wrapper around ReactMarkdown that sanitizes input using DOMPurify.
 * Use this component instead of raw ReactMarkdown to prevent XSS.
 */
export const SafeMarkdown: React.FC<Props> = ({ children, allowLinks = true, ...props }) => {
    const sanitizedContent = useMemo(() => {
        if (!children) return '';
        // Sanitize the raw markdown before passing to ReactMarkdown logic
        // or sanitize HTML outputs? React-Markdown is safe by default against script injection
        // but can allow dangerous links (javascript:) or if we use rehype-raw (which we shouldn't unless necessary).
        //
        // Double protection:
        // 1. DOMPurify hooks into if we were rendering HTML.
        // 2. ReactMarkdown handles basic escaping.
        //
        // Note: react-markdown *does not* parse HTML by default (rehype-raw needed).
        // So we are mostly concerned with dangerous URLs (javascript:).

        // However, if we want to be super safe, we can sanitize the content string if it contains HTML that might be parsed
        // if rehype-raw was on. Since we might not control the config everywhere, explicit sanitization is good.

        // Actually, react-markdown recommends sanitizing if using rehype-raw.
        // If NOT using rehype-raw, it's mostly safe, but `javascript:` links in markdown `[text](javascript:alert(1))` can work.
        // Let's verify if newer react-markdown blocks that.
        // Current versions usually block `javascript:` links by default or via safe-url-schemes.

        // To be safe, let's just render the markdown.
        // But the requirements say "Add DOMPurify".
        // The most robust way is to sanitize the *rendered* HTML, but ReactMarkdown acts as the renderer.

        // Strategy:
        // 1. Use ReactMarkdown `urlTransform` to block dangerous protocols.
        // 2. Wrap basic text content in DOMPurify just in case we ever enable HTML parsing.

        return DOMPurify.sanitize(children, {
            ALLOWED_TAGS: [], // Strip all HTML tags if we only want Markdown to be interpreted
            // Wait, if we strip HTML tags, we lose ability for users to use HTML formatting if they wanted to?
            // Usually Markdown supports some HTML. Security says we should probably strip it unless explicitly whitelisted.
            // Let's strip HTML tags to be safe and strictly support Markdown.
            KEEP_CONTENT: true,
        });
    }, [children]);

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

    return (
        <ReactMarkdown
            {...props}
            urlTransform={urlTransform}
            className={`prose prose-sm max-w-none text-slate-600 ${props.className || ''}`}
        >
            {sanitizedContent}
        </ReactMarkdown>
    );
};
