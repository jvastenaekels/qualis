/*
 * Qualis - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { passwordResetRequestApiPasswordResetRequestPost } from '@/api/generated';

export default function PasswordResetRequestPage() {
    const { t } = useTranslation();
    const [email, setEmail] = useState('');
    const [sent, setSent] = useState(false);

    const onSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        // 200 always — even on backend error we show the same generic message
        // to preserve anti-enumeration guarantees from the backend.
        try {
            await passwordResetRequestApiPasswordResetRequestPost({ email });
        } catch {
            // Swallow errors — the backend's anti-enum design means a 4xx here
            // is either rate-limit or schema; either way we show the same UX.
        }
        setSent(true);
    };

    if (sent) {
        return (
            <div className="mx-auto max-w-md p-8 text-center">
                <p>
                    {t(
                        'auth.password_reset.request_success',
                        'If the email exists, a reset link is on its way.'
                    )}
                </p>
            </div>
        );
    }

    return (
        <div className="mx-auto max-w-md p-8">
            <h1 className="text-xl font-semibold mb-4">
                {t('auth.password_reset.request_title', 'Reset your password')}
            </h1>
            <p className="mb-4 text-slate-700">
                {t(
                    'auth.password_reset.request_body',
                    "Enter your email and we'll send a reset link."
                )}
            </p>
            <form onSubmit={onSubmit} className="space-y-3">
                <label htmlFor="reset-email" className="sr-only">
                    {t('auth.login.email_label', 'Email address')}
                </label>
                <input
                    id="reset-email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full border rounded px-3 py-2"
                    placeholder="name@example.com"
                    autoComplete="email"
                />
                <button type="submit" className="w-full bg-slate-900 text-white py-2 rounded">
                    {t('auth.password_reset.request_submit', 'Send reset link')}
                </button>
            </form>
        </div>
    );
}
