import { useRef, useState } from 'react';
import { Textarea } from '@/components/ui/textarea';

interface ProjectMemberLite {
    user_id: number;
    display_name: string;
}

interface Props {
    value: string;
    onChange: (value: string, mentions: number[]) => void;
    members: ProjectMemberLite[];
    placeholder?: string;
}

function parseMentions(text: string, members: ProjectMemberLite[]): number[] {
    const ids = Array.from(text.matchAll(/@([\w-]+)/g))
        .map((m) => members.find((u) => u.display_name === m[1])?.user_id ?? null)
        .filter((x): x is number => x !== null);
    return [...new Set(ids)];
}

export function MentionAutocomplete({ value, onChange, members, placeholder }: Props) {
    const [query, setQuery] = useState<string | null>(null);
    const ref = useRef<HTMLTextAreaElement>(null);

    const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const text = e.target.value;
        const cursor = e.target.selectionStart;
        const head = text.slice(0, cursor);
        const m = /@([\w-]*)$/.exec(head);
        setQuery(m ? (m[1] ?? '') : null);
        onChange(text, parseMentions(text, members));
    };

    const filtered =
        query !== null
            ? members.filter((m) => m.display_name.toLowerCase().includes(query.toLowerCase()))
            : [];

    const insert = (m: ProjectMemberLite) => {
        const node = ref.current;
        if (!node) return;
        const cursor = node.selectionStart;
        const head = value.slice(0, cursor).replace(/@[\w-]*$/, `@${m.display_name} `);
        const tail = value.slice(cursor);
        const next = head + tail;
        onChange(next, parseMentions(next, members));
        setQuery(null);
        node.focus();
    };

    const open = query !== null && filtered.length > 0;

    return (
        <div className="relative">
            <Textarea
                ref={ref}
                value={value}
                onChange={handleChange}
                placeholder={placeholder}
                rows={3}
                className="rounded-xl"
            />
            {open && (
                <div className="absolute left-0 top-full z-50 mt-1 w-56 rounded-md border bg-white p-1 shadow-md">
                    {filtered.map((m) => (
                        <button
                            key={m.user_id}
                            type="button"
                            onMouseDown={(e) => {
                                // prevent textarea blur before insert
                                e.preventDefault();
                                insert(m);
                            }}
                            className="block w-full text-left px-2 py-1 hover:bg-slate-50 rounded-md text-sm"
                        >
                            @{m.display_name}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
