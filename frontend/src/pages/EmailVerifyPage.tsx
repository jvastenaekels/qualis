/*
 * Qualis - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

import { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { verifyEmailApiEmailVerifyPost } from '@/api/generated';

type Status = 'loading' | 'success' | 'error';

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

export default function EmailVerifyPage() {
    const { t } = useTranslation();
    const [params] = useSearchParams();
    const [status, setStatus] = useState<Status>('loading');

    useReferrerNoReferrer();

    useEffect(() => {
        const token = params.get('token');
        if (!token) {
            setStatus('error');
            return;
        }
        verifyEmailApiEmailVerifyPost({ token })
            .then(() => setStatus('success'))
            .catch(() => setStatus('error'));
    }, [params]);

    return (
        <div className="mx-auto max-w-md p-8 text-center">
            {status === 'loading' && (
                <p>{t('auth.email.verify.verifying', 'Verifying your email…')}</p>
            )}
            {status === 'success' && (
                <>
                    <p className="mb-4">
                        {t('auth.email.verify.success', 'Email verified. You can now sign in.')}
                    </p>
                    <Link to="/login" className="underline">
                        {t('auth.login.cta', 'Sign in')}
                    </Link>
                </>
            )}
            {status === 'error' && (
                <>
                    <p className="mb-4">
                        {t('auth.email.verify.expired', 'This link has expired or is invalid.')}
                    </p>
                    <Link to="/forgot-password" className="underline">
                        {t('auth.email.verify.resend_link', 'Request a new verification email')}
                    </Link>
                </>
            )}
        </div>
    );
}
