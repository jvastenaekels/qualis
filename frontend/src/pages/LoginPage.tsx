import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
    useLoginForAccessTokenApiTokenPost,
    useReadUsersMeApiMeGet,
    listProjectsApiAdminProjectsGet,
} from '@/api/generated';
import { useAuthStore } from '@/store/useAuthStore';
import { useAdminStore } from '@/store/useAdminStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Card,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';
import { toast } from 'sonner';
import { Loader2, Lock, AtSign, ArrowRight, ShieldCheck } from 'lucide-react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { parseApiErrorSync } from '@/lib/error-utils';

const LoginPage = () => {
    const { t } = useTranslation();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const setAuth = useAuthStore((state) => state.setAuth);

    const loginMutation = useLoginForAccessTokenApiTokenPost();
    const { refetch: fetchMe } = useReadUsersMeApiMeGet({
        query: { enabled: false },
    });

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();

        try {
            // 1. Get Token
            const tokenResponse = await loginMutation.mutateAsync({
                data: {
                    username: email,
                    password: password,
                },
            });

            // 2. Temporarily set token in store so fetchMe can use it
            // (useAuthStore.getState().token is used by mutator)
            useAuthStore.setState({ token: tokenResponse.access_token });

            // 3. Fetch User Info
            const { data: user } = await fetchMe();

            if (user) {
                setAuth(tokenResponse.access_token as string, {
                    id: user.id,
                    email: user.email,
                    full_name: user.full_name,
                    is_superuser: user.is_superuser,
                });

                toast.success(t('auth.login.welcome_back'));

                // Handle redirection: preference for 'redirect' param, then most recent project, then /admin
                const explicitRedirect = searchParams.get('redirect');
                if (explicitRedirect) {
                    navigate(explicitRedirect);
                    return;
                }

                try {
                    const response = await listProjectsApiAdminProjectsGet();
                    const projects = response?.items;
                    if (projects && projects.length > 0) {
                        // Prefer last visited project if still accessible
                        const lastProjectId = useAdminStore.getState().activeProjectId;
                        const lastProject = lastProjectId
                            ? projects.find((p) => p.id === lastProjectId)
                            : null;
                        const target = lastProject ?? projects[0];
                        if (target) {
                            navigate(`/app/${target.slug}/dashboard`);
                        } else {
                            navigate('/hub');
                        }
                    } else {
                        navigate('/hub');
                    }
                } catch (err) {
                    console.error('Redirection error:', err);
                    navigate('/hub');
                }
            }
        } catch (error: unknown) {
            const message = parseApiErrorSync(error, t('auth.login.error_generic'));
            toast.error(message);
            // Clear token if fetchMe failed
            useAuthStore.setState({ token: null });
        }
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
                <div className="flex flex-col items-center mb-8">
                    <div className="w-12 h-12 bg-slate-900 rounded-xl flex items-center justify-center shadow-lg mb-4">
                        <ShieldCheck className="text-white h-7 w-7" />
                    </div>
                    <h1 className="text-2xl font-bold tracking-tight text-slate-900">
                        {t('auth.login.title')}
                    </h1>
                    <p className="text-sm text-slate-500 mt-2">{t('auth.login.subtitle')}</p>
                </div>

                <Card className="border-none shadow-[0_8px_30px_rgb(0,0,0,0.04)] bg-white/80 backdrop-blur-md">
                    <form onSubmit={handleLogin}>
                        <CardHeader className="space-y-1 pb-4">
                            <CardTitle className="text-xl font-black">
                                {t('auth.login.card_title')}
                            </CardTitle>
                            <CardDescription>{t('auth.login.card_description')}</CardDescription>
                        </CardHeader>
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
                                <Label htmlFor="password">{t('auth.login.password_label')}</Label>
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
                                disabled={loginMutation.isPending}
                            >
                                {loginMutation.isPending ? (
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
                </Card>

                <p className="text-center text-2xs text-slate-400 mt-12 font-medium opacity-50">
                    Libre-Q
                </p>
            </motion.div>
        </div>
    );
};

export default LoginPage;
