import { Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { usePlatformConfigStore } from '@/store/usePlatformConfigStore';

/**
 * The published credentials of the throwaway `docker-compose.yml` demo stack.
 *
 * They live here, in the client bundle, and deliberately NOT in the API
 * response. `GET /api/config` returns a boolean and nothing else, so an
 * instance that reports `demo_mode` by mistake still discloses nothing — the
 * worst case is this card offering an account that does not exist, which is a
 * cosmetic bug rather than a credential leak. The values match
 * `docker-compose.yml` and the README's quick-start table; an operator who
 * changes `ADMIN_PASSWORD` there will see the fill fail, and the card says
 * where the values come from so that is diagnosable.
 */
const DEMO_EMAIL = 'admin@example.com';
const DEMO_PASSWORD = 'admin123';

interface DemoAccountCardProps {
    onFill: (email: string, password: string) => void;
}

/**
 * Shown only on the demo stack. Someone evaluating Qualis has just been told
 * these credentials by `make demo-smoke`, in a terminal they have very likely
 * scrolled past or closed — this is the one moment in the whole quick start
 * where they would have to go and look something up again.
 */
export function DemoAccountCard({ onFill }: DemoAccountCardProps) {
    const { t } = useTranslation();
    const isDemo = usePlatformConfigStore((s) => s.isDemo);

    if (!isDemo) {
        return null;
    }

    return (
        <div className="px-6 pb-4">
            <div className="rounded-lg border border-indigo-200 bg-indigo-50/70 px-4 py-3">
                <p className="flex items-center gap-2 text-sm font-semibold text-indigo-900">
                    <Sparkles className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
                    {t('auth.login.demo.title', 'Welcome — this is the Qualis demo')}
                </p>
                <p className="mt-1 text-sm text-indigo-900/80">
                    {t(
                        'auth.login.demo.body',
                        'Everything here is sample data, so explore freely — nothing you do can break anything.'
                    )}
                </p>
                <button
                    type="button"
                    onClick={() => onFill(DEMO_EMAIL, DEMO_PASSWORD)}
                    className="mt-2 rounded-md text-sm font-semibold text-indigo-700 underline underline-offset-2 hover:text-indigo-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
                >
                    {t('auth.login.demo.fill', 'Fill in the demo account for me')}
                </button>
                {/* The credentials stay visible rather than only being filled:
                    a reader should be able to see what is about to be typed on
                    their behalf, and be able to type it themselves. */}
                <p className="mt-1 text-xs text-indigo-900/70">
                    {t('auth.login.demo.credentials', '{{email}} · password {{password}}', {
                        email: DEMO_EMAIL,
                        password: DEMO_PASSWORD,
                    })}
                </p>
            </div>
        </div>
    );
}
