import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams, useLocation, Link } from 'react-router-dom';
import { useReadUsersMeApiMeGet, listProjectsApiAdminProjectsGet } from '@/api/generated';
import type { Token } from '@/api/model/token';
import type { TokenChannel } from '@/api/model/tokenChannel';
import { useAuthStore } from '@/store/useAuthStore';
import { useAdminStore } from '@/store/useAdminStore';
import { customInstance } from '@/api/mutator';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { Loader2, Lock, AtSign, ArrowRight, ShieldCheck, Info, ArrowLeft } from 'lucide-react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { parseApiErrorSync } from '@/lib/error-utils';
import { ApiError } from '@/api/client';

type LoginStage = 'credentials' | 'two_factor';

const RESEND_COOLDOWN_SECONDS = 30;

const LoginPage = () => {
    const { t } = useTranslation();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const location = useLocation();
    const resetSuccess =
        (location.state as { resetSuccess?: boolean } | null)?.resetSuccess === true;
    const setAuth = useAuthStore((state) => state.setAuth);

    const [stage, setStage] = useState<LoginStage>('credentials');
    const [channel, setChannel] = useState<TokenChannel>(null);
    const [otp, setOtp] = useState('');
    const [isCredentialsPending, setIsCredentialsPending] = useState(false);
    const [isOtpPending, setIsOtpPending] = useState(false);
    const [resendCooldown, setResendCooldown] = useState(0);

    const { refetch: fetchMe } = useReadUsersMeApiMeGet({
        query: { enabled: false },
    });

    useEffect(() => {
        if (resendCooldown <= 0) return;
        const id = setTimeout(() => setResendCooldown((s) => s - 1), 1000);
        return () => clearTimeout(id);
    }, [resendCooldown]);

    /**
     * Submit credentials. Optionally include an `x-totp-token` header to satisfy
     * the 2FA branch on the backend.
     */
    const submitCredentials = async (totpToken?: string): Promise<Token> => {
        const formUrlEncoded = new URLSearchParams();
        formUrlEncoded.append('username', email);
        formUrlEncoded.append('password', password);
        const headers: Record<string, string> = {
            'Content-Type': 'application/x-www-form-urlencoded',
        };
        if (totpToken) {
            headers['x-totp-token'] = totpToken;
        }
        return customInstance<Token>({
            url: '/api/token',
            method: 'POST',
            headers,
            data: formUrlEncoded,
        });
    };

    const navigateAfterLogin = async () => {
        const explicitRedirect = searchParams.get('redirect');
        if (explicitRedirect) {
            navigate(explicitRedirect);
            return;
        }

        try {
            const response = await listProjectsApiAdminProjectsGet();
            const projects = response?.items ?? [];
            if (projects.length === 0) {
                navigate('/hub');
                return;
            }
            const lastProjectId = useAdminStore.getState().activeProjectId;
            const lastProject = lastProjectId ? projects.find((p) => p.id === lastProjectId) : null;
            const target = lastProject ?? projects[0];
            navigate(target ? `/app/${target.slug}/dashboard` : '/hub');
        } catch (err) {
            console.error('Redirection error:', err);
            navigate('/hub');
        }
    };

    const finishLogin = async (accessToken: string) => {
        useAuthStore.setState({ token: accessToken });
        const { data: user } = await fetchMe();

        if (!user) {
            useAuthStore.setState({ token: null });
            return;
        }

        setAuth(accessToken, {
            id: user.id,
            email: user.email,
            full_name: user.full_name,
            is_superuser: user.is_superuser,
        });

        toast.success(t('auth.login.welcome_back'));
        await navigateAfterLogin();
    };

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsCredentialsPending(true);
        try {
            const tokenResponse = await submitCredentials();

            // Backend signals 2FA required → switch to OTP stage; do NOT touch auth store.
            if (tokenResponse.requires_2fa) {
                setChannel(tokenResponse.channel ?? 'app');
                setStage('two_factor');
                setOtp('');
                if ((tokenResponse.channel ?? 'app') === 'email') {
                    setResendCooldown(RESEND_COOLDOWN_SECONDS);
                }
                return;
            }

            if (!tokenResponse.access_token) {
                toast.error(t('auth.login.error_generic'));
                return;
            }
            await finishLogin(tokenResponse.access_token);
        } catch (error: unknown) {
            const message = parseApiErrorSync(error, t('auth.login.error_generic'));
            toast.error(message);
            useAuthStore.setState({ token: null });
        } finally {
            setIsCredentialsPending(false);
        }
    };

    const handleOtpSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (otp.length !== 6) return;
        setIsOtpPending(true);
        try {
            const tokenResponse = await submitCredentials(otp);
            if (tokenResponse.requires_2fa || !tokenResponse.access_token) {
                toast.error(t('auth.login.two_factor_invalid'));
                setOtp('');
                return;
            }
            await finishLogin(tokenResponse.access_token);
        } catch (error: unknown) {
            if (error instanceof ApiError && error.status === 401) {
                toast.error(t('auth.login.two_factor_invalid'));
                setOtp('');
            } else {
                const message = parseApiErrorSync(error, t('auth.login.error_generic'));
                toast.error(message);
            }
        } finally {
            setIsOtpPending(false);
        }
    };

    const handleResend = async () => {
        if (resendCooldown > 0) return;
        try {
            await submitCredentials(); // re-issues an email OTP server-side
            setResendCooldown(RESEND_COOLDOWN_SECONDS);
        } catch (error: unknown) {
            const message = parseApiErrorSync(error, t('auth.login.error_generic'));
            toast.error(message);
        }
    };

    const handleBackToCredentials = () => {
        setStage('credentials');
        setChannel(null);
        setOtp('');
        setResendCooldown(0);
    };

    return (
        <div className="min-h-screen w-full flex items-center justify-center bg-[#fafafa] p-4">
            {/* Background decorative elements */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute -top-[10%] -left-[10%] w-[40%] h-[40%] bg-indigo-500/5 blur-[120px] rounded-full" />
                <div className="absolute -bottom-[10%] -right-[10%] w-[40%] h-[40%] bg-emerald-500/5 blur-[120px] rounded-full" />
            </div>

            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, ease: 'easeOut' }}
                className="w-full max-w-[400px] z-10"
            >
                <div className="flex justify-center mb-8">
                    <div className="w-12 h-12 bg-slate-900 rounded-xl flex items-center justify-center shadow-lg">
                        <ShieldCheck className="text-white h-7 w-7" />
                    </div>
                </div>

                <Card className="border-none shadow-[0_8px_30px_rgb(0,0,0,0.04)] bg-white/80 backdrop-blur-md">
                    {stage === 'credentials' && (
                        <form onSubmit={handleLogin}>
                            <CardHeader className="pb-4">
                                <CardTitle className="text-xl font-black">
                                    {t('auth.login.card_title')}
                                </CardTitle>
                            </CardHeader>
                            {resetSuccess && (
                                <div className="px-6 pb-2">
                                    <div
                                        role="status"
                                        className="flex items-start gap-2 px-3 py-2 rounded-md text-sm bg-emerald-50 border border-emerald-200 text-emerald-800"
                                    >
                                        <Info
                                            className="h-4 w-4 mt-0.5 flex-shrink-0 text-emerald-600"
                                            aria-hidden="true"
                                        />
                                        <span>
                                            {t(
                                                'auth.login.reset_success_banner',
                                                'Password updated. You can now sign in with your new password.'
                                            )}
                                        </span>
                                    </div>
                                </div>
                            )}
                            {(() => {
                                const reason = searchParams.get('reason');
                                if (reason !== 'session_expired' && reason !== 'auth_required') {
                                    return null;
                                }
                                const messageKey =
                                    reason === 'session_expired'
                                        ? 'auth.login.reason_session_expired'
                                        : 'auth.login.reason_auth_required';
                                const fallback =
                                    reason === 'session_expired'
                                        ? 'Your session has expired. Please sign in again.'
                                        : 'Please sign in to continue.';
                                return (
                                    <div className="px-6 pb-2">
                                        <div
                                            role="status"
                                            className="flex items-start gap-2 px-3 py-2 rounded-md text-sm bg-slate-50 border border-slate-200 text-slate-700"
                                        >
                                            <Info
                                                className="h-4 w-4 mt-0.5 flex-shrink-0 text-slate-500"
                                                aria-hidden="true"
                                            />
                                            <span>{t(messageKey, fallback)}</span>
                                        </div>
                                    </div>
                                );
                            })()}
                            <CardContent className="space-y-4">
                                <div className="space-y-2">
                                    <Label htmlFor="email">{t('auth.login.email_label')}</Label>
                                    <div className="relative">
                                        <AtSign className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                                        <Input
                                            id="email"
                                            type="email"
                                            placeholder="name@example.com"
                                            className="pl-10 bg-slate-50/50 border-slate-200"
                                            value={email}
                                            onChange={(e) => setEmail(e.target.value)}
                                            autoComplete="email"
                                        />
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <div className="flex items-center justify-between">
                                        <Label htmlFor="password">
                                            {t('auth.login.password_label')}
                                        </Label>
                                        <Link
                                            to="/forgot-password"
                                            className="text-xs text-slate-500 hover:text-slate-700 underline"
                                        >
                                            {t(
                                                'auth.login.forgot_password_link',
                                                'Forgot password?'
                                            )}
                                        </Link>
                                    </div>
                                    <div className="relative">
                                        <Lock className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                                        <Input
                                            id="password"
                                            type="password"
                                            placeholder={t('auth.register.placeholder_password')}
                                            className="pl-10 h-11 bg-slate-50/50 border-slate-200 focus:bg-white transition-all shadow-sm"
                                            value={password}
                                            onChange={(e) => setPassword(e.target.value)}
                                            required
                                            autoComplete="current-password"
                                        />
                                    </div>
                                </div>
                            </CardContent>
                            <CardFooter className="pt-2 flex flex-col gap-4">
                                <Button
                                    type="submit"
                                    className="w-full bg-slate-900 hover:bg-slate-800 transition-all font-semibold"
                                    disabled={isCredentialsPending}
                                >
                                    {isCredentialsPending ? (
                                        <>
                                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                            {t('auth.login.loading')}
                                        </>
                                    ) : (
                                        <>
                                            {t('auth.login.submit')}
                                            <ArrowRight className="ml-2 h-4 w-4" />
                                        </>
                                    )}
                                </Button>
                            </CardFooter>
                        </form>
                    )}

                    {stage === 'two_factor' && (
                        <form onSubmit={handleOtpSubmit}>
                            <CardHeader className="pb-4">
                                <CardTitle className="text-xl font-black">
                                    {t('auth.login.two_factor_title', 'Two-factor authentication')}
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <p className="text-sm text-slate-600">
                                    {channel === 'email'
                                        ? t(
                                              'auth.login.two_factor_email_prompt',
                                              'We sent a 6-digit code to your email. Enter it below.'
                                          )
                                        : t(
                                              'auth.login.two_factor_app_prompt',
                                              'Enter the 6-digit code from your authenticator app.'
                                          )}
                                </p>
                                <div className="space-y-2">
                                    <Label htmlFor="otp" className="sr-only">
                                        {t(
                                            'auth.login.two_factor_title',
                                            'Two-factor authentication'
                                        )}
                                    </Label>
                                    <Input
                                        id="otp"
                                        inputMode="numeric"
                                        autoComplete="one-time-code"
                                        placeholder="000000"
                                        className="h-12 text-center text-2xl tracking-[0.5em] font-bold"
                                        maxLength={6}
                                        value={otp}
                                        onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                                        autoFocus
                                    />
                                </div>
                                {channel === 'email' && (
                                    <button
                                        type="button"
                                        onClick={handleResend}
                                        disabled={resendCooldown > 0}
                                        className="text-xs text-slate-500 hover:text-slate-700 underline disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        {resendCooldown > 0
                                            ? t(
                                                  'auth.login.two_factor_resend_cooldown',
                                                  'Resend available in {{seconds}}s',
                                                  { seconds: resendCooldown }
                                              )
                                            : t('auth.login.two_factor_resend', 'Resend code')}
                                    </button>
                                )}
                            </CardContent>
                            <CardFooter className="pt-2 flex flex-col gap-3">
                                <Button
                                    type="submit"
                                    className="w-full bg-slate-900 hover:bg-slate-800 transition-all font-semibold"
                                    disabled={otp.length !== 6 || isOtpPending}
                                >
                                    {isOtpPending ? (
                                        <>
                                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                            {t('auth.login.loading')}
                                        </>
                                    ) : (
                                        t('auth.login.two_factor_submit', 'Verify')
                                    )}
                                </Button>
                                <div className="flex items-center justify-between w-full text-xs">
                                    <button
                                        type="button"
                                        onClick={handleBackToCredentials}
                                        className="flex items-center gap-1 text-slate-500 hover:text-slate-700"
                                    >
                                        <ArrowLeft className="h-3 w-3" />
                                        {t('auth.login.cta', 'Sign in')}
                                    </button>
                                    <Link
                                        to="/2fa/recover"
                                        className="text-slate-500 hover:text-slate-700 underline"
                                    >
                                        {t('auth.login.lost_2fa_link', 'Lost access to your 2FA?')}
                                    </Link>
                                </div>
                            </CardFooter>
                        </form>
                    )}
                </Card>

                <p className="text-center text-2xs text-slate-400 mt-12 font-medium opacity-50">
                    Qualis
                </p>
            </motion.div>
        </div>
    );
};

export default LoginPage;
