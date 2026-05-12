/*
 * Qualis - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { passwordResetConfirmApiPasswordResetConfirmPost } from '@/api/generated';

function useReferrerNoReferrer() {
    useEffect(() => {
        const meta = document.createElement('meta');
        meta.name = 'referrer';
        meta.content = 'no-referrer';
        document.head.appendChild(meta);
        return () => {
            document.head.removeChild(meta);
        };
    }, []);
}

export default function PasswordResetConfirmPage() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const [params] = useSearchParams();
    const [pwd, setPwd] = useState('');
    const [pwd2, setPwd2] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);

    useReferrerNoReferrer();

    const token = params.get('token');

    useEffect(() => {
        if (!token) {
            setError(t('auth.password_reset.missing_token', 'No reset token in the URL.'));
        }
    }, [token, t]);

    const onSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!token) return;
        if (pwd.length < 8) {
            setError(t('auth.password_reset.too_short', 'Password must be at least 8 characters.'));
            return;
        }
        if (pwd !== pwd2) {
            setError(t('auth.password_reset.mismatch', 'Passwords do not match.'));
            return;
        }
        setSubmitting(true);
        try {
            await passwordResetConfirmApiPasswordResetConfirmPost({
                token,
                new_password: pwd,
            });
            navigate('/login', { state: { resetSuccess: true } });
        } catch {
            setError(
                t(
                    'auth.password_reset.link_expired',
                    'This link has expired or has already been used.'
                )
            );
            setSubmitting(false);
        }
    };

    return (
        <div className="mx-auto max-w-md p-8">
            <h1 className="text-xl font-semibold mb-4">
                {t('auth.password_reset.confirm_title', 'Choose a new password')}
            </h1>
            <form onSubmit={onSubmit} className="space-y-3">
                <label htmlFor="new-password" className="sr-only">
                    {t('auth.password_reset.new_password_placeholder', 'New password')}
                </label>
                <input
                    id="new-password"
                    type="password"
                    required
                    value={pwd}
                    onChange={(e) => setPwd(e.target.value)}
                    className="w-full border rounded px-3 py-2"
                    placeholder={t('auth.password_reset.new_password_placeholder', 'New password')}
                    autoComplete="new-password"
                    minLength={8}
                />
                <label htmlFor="confirm-password" className="sr-only">
                    {t('auth.password_reset.confirm_placeholder', 'Confirm password')}
                </label>
                <input
                    id="confirm-password"
                    type="password"
                    required
                    value={pwd2}
                    onChange={(e) => setPwd2(e.target.value)}
                    className="w-full border rounded px-3 py-2"
                    placeholder={t('auth.password_reset.confirm_placeholder', 'Confirm password')}
                    autoComplete="new-password"
                />
                <button
                    type="submit"
                    disabled={submitting}
                    className="w-full bg-slate-900 text-white py-2 rounded disabled:opacity-50"
                >
                    {t('auth.password_reset.confirm_submit', 'Reset password')}
                </button>
                {error !== null && <p className="text-red-600 text-sm">{error}</p>}
            </form>
        </div>
    );
}
