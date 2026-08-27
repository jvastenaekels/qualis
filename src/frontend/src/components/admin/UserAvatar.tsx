interface UserAvatarProps {
    name?: string | null;
    email?: string | null;
    className?: string;
}

function computeInitials(name?: string | null, email?: string | null): string {
    if (name) {
        return name
            .split(/\s+/)
            .map((w) => w[0] ?? '')
            .join('')
            .substring(0, 2)
            .toUpperCase();
    }
    if (email) return email.substring(0, 2).toUpperCase();
    return '?';
}

export function UserAvatar({ name, email, className }: UserAvatarProps) {
    return (
        <div
            className={`flex aspect-square size-8 items-center justify-center rounded-lg bg-indigo-600 text-white font-bold ${className ?? ''}`}
        >
            {computeInitials(name, email)}
        </div>
    );
}

export { computeInitials };
