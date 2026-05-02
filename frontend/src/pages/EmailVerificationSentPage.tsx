/*
 * Qualis - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { resendVerificationApiEmailVerifyResendPost } from '@/api/generated';

export default function EmailVerificationSentPage() {
    const { t } = useTranslation();
    const location = useLocation();
    const email = (location.state as { email?: string } | null)?.email ?? '';
    const [cooldown, setCooldown] = useState(0);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (cooldown > 0) {
            const id = setTimeout(() => setCooldown((c) => c - 1), 1000);
            return () => clearTimeout(id);
        }
    }, [cooldown]);

    const onResend = async () => {
        if (cooldown > 0 || !email) return;
        setError(null);
        try {
            await resendVerificationApiEmailVerifyResendPost({ email });
            setCooldown(30);
        } catch {
            setError(t('auth.email.verification_sent.error', 'Could not resend. Try again later.'));
        }
    };

    return (
        <main className="mx-auto max-w-md p-8 text-center">
            <h1 className="text-xl font-semibold mb-3">
                {t('auth.email.verification_sent.title', 'Verify your email')}
            </h1>
            <p className="mb-6">
                {t(
                    'auth.email.verification_sent.body',
                    'We sent a verification link to {{email}}. Click the link to activate your account.',
                    { email }
                )}
            </p>
            <button
                type="button"
                onClick={onResend}
                disabled={cooldown > 0 || !email}
                className="rounded bg-slate-900 text-white px-4 py-2 disabled:opacity-50"
            >
                {cooldown > 0
                    ? t(
                          'auth.email.verification_sent.cooldown',
                          'Resend available in {{seconds}}s',
                          {
                              seconds: cooldown,
                          }
                      )
                    : t('auth.email.verification_sent.resend', 'Resend the email')}
            </button>
            {error !== null && <p className="mt-3 text-red-600 text-sm">{error}</p>}
        </main>
    );
}
