import type React from 'react';
import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { Bold, Italic, List, Link, Eye, Edit3, Info } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface MarkdownEditorProps {
    value: string;
    onChange: (value: string) => void;
    label?: string;
    id?: string;
    placeholder?: string;
    className?: string;
}

const MarkdownEditor: React.FC<MarkdownEditorProps> = ({
    value,
    onChange,
    label,
    id,
    placeholder,
    className,
}) => {
    const { t } = useTranslation();
    const [view, setView] = useState<'edit' | 'preview'>('edit');

    const insertText = (before: string, after = '') => {
        const textarea = document.getElementById(id || 'md-editor') as HTMLTextAreaElement;
        if (!textarea) return;

        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const text = textarea.value;
        const beforeSelection = text.substring(0, start);
        const selection = text.substring(start, end);
        const afterSelection = text.substring(end);

        const newText = `${beforeSelection}${before}${selection}${after}${afterSelection}`;
        onChange(newText);

        // Reset focus and selection
        setTimeout(() => {
            textarea.focus();
            textarea.setSelectionRange(start + before.length, end + before.length);
        }, 0);
    };

    return (
        <div className={cn('space-y-2', className)}>
            {label && (
                <div className="flex items-center justify-between">
                    <label htmlFor={id} className="text-sm font-semibold text-slate-700">
                        {label}
                    </label>
                    <div
                        className="flex items-center gap-1 text-[10px] text-muted-foreground bg-muted/50 px-2 py-0.5 rounded cursor-help"
                        title={t('admin.components.markdown.tooltip')}
                    >
                        <Info className="h-3 w-3" />
                        {t('admin.components.markdown.label')}
                    </div>
                </div>
            )}

            <div className="border rounded-lg overflow-hidden bg-white shadow-sm ring-offset-background focus-within:ring-2 focus-within:ring-primary/20 focus-within:border-primary/30 transition-all">
                {/* Toolbar */}
                <div className="bg-muted/30 border-b px-2 py-1 flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-1">
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => insertText('**', '**')}
                            title={t('admin.components.markdown.bold')}
                            disabled={view === 'preview'}
                        >
                            <Bold className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => insertText('_', '_')}
                            title={t('admin.components.markdown.italic')}
                            disabled={view === 'preview'}
                        >
                            <Italic className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => insertText('\n- ')}
                            title={t('admin.components.markdown.list')}
                            disabled={view === 'preview'}
                        >
                            <List className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => insertText('[', '](url)')}
                            title={t('admin.components.markdown.link')}
                            disabled={view === 'preview'}
                        >
                            <Link className="h-3.5 w-3.5" />
                        </Button>
                    </div>

                    <div className="flex bg-background border rounded-md p-0.5">
                        <Button
                            variant={view === 'edit' ? 'secondary' : 'ghost'}
                            size="sm"
                            className="h-6 px-2 text-[10px] gap-1.5"
                            onClick={() => setView('edit')}
                        >
                            <Edit3 className="h-3 w-3" />
                            {t('admin.components.markdown.edit')}
                        </Button>
                        <Button
                            variant={view === 'preview' ? 'secondary' : 'ghost'}
                            size="sm"
                            className="h-6 px-2 text-[10px] gap-1.5"
                            onClick={() => setView('preview')}
                        >
                            <Eye className="h-3 w-3" />
                            {t('admin.components.markdown.preview')}
                        </Button>
                    </div>
                </div>

                {/* Content */}
                <div className="relative min-h-[120px]">
                    {view === 'edit' ? (
                        <textarea
                            id={id || 'md-editor'}
                            value={value}
                            onChange={(e) => onChange(e.target.value)}
                            placeholder={placeholder}
                            className="w-full h-full min-h-[120px] p-3 text-sm focus:outline-none resize-none border-none bg-transparent"
                        />
                    ) : (
                        <div className="p-4 prose prose-sm max-w-none prose-slate min-h-[120px] bg-slate-50/30">
                            {value ? (
                                <ReactMarkdown>{value}</ReactMarkdown>
                            ) : (
                                <span className="text-muted-foreground italic text-xs">
                                    {t('admin.components.markdown.empty')}
                                </span>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default MarkdownEditor;
