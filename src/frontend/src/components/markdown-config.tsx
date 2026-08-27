import type { Components } from 'react-markdown';

export const inlineMarkdownComponents: Components = {
    p: ({ children }) => <span>{children}</span>,
};
