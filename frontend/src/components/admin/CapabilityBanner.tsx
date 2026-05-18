import { AlertTriangle } from 'lucide-react';

interface CapabilityBannerProps {
    message: string;
    guideHref: string;
    guideLabel: string;
}

/** One degraded-capability warning row. Presentational only. */
export function CapabilityBanner({ message, guideHref, guideLabel }: CapabilityBannerProps) {
    return (
        <div
            role="status"
            className="flex items-center gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs font-medium text-amber-800"
        >
            <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="min-w-0 flex-1">{message}</span>
            <a
                href={guideHref}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 underline underline-offset-2 hover:text-amber-900"
            >
                {guideLabel}
            </a>
        </div>
    );
}
