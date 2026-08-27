/*
 * Qualis - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { twofaDisableConfirmApi2faDisableConfirmPost } from '@/api/generated';

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

type Status = 'idle' | 'loading' | 'success' | 'error';
type ErrorKind = 'consumed' | 'expired' | 'missing' | null;

/**
 * SECURITY CONTRACT: This page MUST NOT call the disable API on mount.
 *
 * Email scanners and link-preview services routinely fetch URLs in incoming
 * mail; if the API fired automatically, those fetches would silently disable
 * users' 2FA. The page renders a warning + an explicit "Confirm" button;
 * only on user click does the POST fire.
 *
 * A Vitest test ("does NOT call disable API on mount") enforces this. If
 * that test fails after a future refactor, the contract has been broken.
 */
export default function TwoFactorDisablePage() {
    const { t } = useTranslation();
    const [params] = useSearchParams();
    const [status, setStatus] = useState<Status>('idle');
    const [errorKind, setErrorKind] = useState<ErrorKind>(null);

    useReferrerNoReferrer();

    const token = params.get('token');

    // NOTE: NO useEffect that auto-fires the API. The action is gated on
    // a user click below. This is a hard contract — see auth-email-flows
    // spec rationale.

    const onConfirm = async () => {
        if (!token) {
            setErrorKind('missing');
            setStatus('error');
            return;
        }
        setStatus('loading');
        try {
            await twofaDisableConfirmApi2faDisableConfirmPost({ token });
            setStatus('success');
        } catch (e: unknown) {
            const err = e as { status?: number } | undefined;
            setStatus('error');
            setErrorKind(err?.status === 409 ? 'consumed' : 'expired');
        }
    };

    return (
        <div className="mx-auto max-w-md p-8 text-center">
            <h1 className="text-xl font-semibold mb-3">
                {t('auth.twofa.disable.title', 'Disable two-factor authentication')}
            </h1>

            {status === 'idle' && (
                <>
                    <p className="mb-4 text-slate-700">
                        {t(
                            'auth.twofa.disable.warning',
                            "Clicking the button below will permanently remove the second factor from this account. You'll be able to sign in with just your password until you re-enable 2FA."
                        )}
                    </p>
                    <p className="mb-6 text-sm text-red-600">
                        {t(
                            'auth.twofa.disable.warning_attacker',
                            'If you did NOT request this, close this page and change your password immediately.'
                        )}
                    </p>
                    <button
                        type="button"
                        onClick={onConfirm}
                        className="w-full bg-red-600 text-white py-2 px-4 rounded font-bold"
                    >
                        {t(
                            'auth.twofa.disable.confirm_button',
                            'Yes, disable two-factor authentication'
                        )}
                    </button>
                </>
            )}

            {status === 'loading' && <p>{t('auth.twofa.disable.loading', 'Disabling…')}</p>}

            {status === 'success' && (
                <>
                    <p className="mb-4">
                        {t(
                            'auth.twofa.disable.success',
                            'Two-factor authentication is now disabled. You may sign in.'
                        )}
                    </p>
                    <Link to="/login" className="underline">
                        {t('auth.login.cta', 'Sign in')}
                    </Link>
                </>
            )}

            {status === 'error' && (
                <p className="text-red-600">
                    {errorKind === 'consumed'
                        ? t('auth.twofa.disable.error_consumed', 'This link has already been used.')
                        : errorKind === 'missing'
                          ? t('auth.twofa.disable.missing_token', 'No token in the URL.')
                          : t(
                                'auth.twofa.disable.error_expired',
                                'This link has expired or is invalid.'
                            )}
                </p>
            )}
        </div>
    );
}
