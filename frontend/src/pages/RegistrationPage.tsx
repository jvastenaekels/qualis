import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
    ShieldCheck,
    UserPlus,
    AtSign,
    Lock,
    Loader2,
    AlertCircle,
    CheckCircle2,
} from 'lucide-react';
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    CardDescription,
    CardFooter,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { toast } from 'sonner';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { parseApiErrorSync } from '@/lib/error-utils';
import { customInstance } from '@/api/mutator';

const RegistrationPage = () => {
    const { t } = useTranslation();
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const token = searchParams.get('token');

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [isSuccess, setIsSuccess] = useState(false);

    const {
        data: invite,
        isLoading: isVerifying,
        error: verifyError,
    } = useQuery<{ email: string; workspace_name: string; role: string }>({
        queryKey: ['verify-invite', token],
        queryFn: ({ signal }) =>
            customInstance({
                url: `/api/admin/invitations/verify`,
                method: 'GET',
                params: { token: token || undefined },
                signal,
            }),
        enabled: !!token,
        retry: false,
    });

    // Manual Mutation for Registration
    const registerMutation = useMutation({
        mutationFn: (data: Record<string, unknown>) =>
            customInstance<unknown>({
                url: `/api/register`,
                method: 'POST',
                data,
            }),
    });

    useEffect(() => {
        if (invite) {
            setEmail(invite.email);
        }
    }, [invite]);

    const handleRegister = async (e: React.FormEvent) => {
        e.preventDefault();
        if (password !== confirmPassword) {
            toast.error(t('auth.register.errors.password_mismatch'));
            return;
        }

        try {
            await registerMutation.mutateAsync({
                email,
                password,
                invitation_token: token || undefined,
            });
            setIsSuccess(true);
            toast.success(t('auth.register.success_title'));
        } catch (error: unknown) {
            const message = parseApiErrorSync(error, t('auth.register.errors.generic_fail'));
            toast.error(t('auth.register.errors.generic_fail'), {
                description: message,
            });
        }
    };

    if (!token) {
        return (
            <div className="flex h-screen items-center justify-center bg-slate-50 p-6">
                <Alert variant="destructive" className="max-w-md shadow-xl bg-white">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>{t('auth.register.missing_token_title')}</AlertTitle>
                    <AlertDescription>{t('auth.register.missing_token_desc')}</AlertDescription>
                </Alert>
            </div>
        );
    }

    if (isVerifying) {
        return (
            <div className="flex h-screen items-center justify-center bg-slate-50">
                <div className="flex flex-col items-center gap-4">
                    <Loader2 className="h-10 w-10 animate-spin text-primary" />
                    <p className="text-slate-500 font-medium animate-pulse">
                        {t('auth.register.verifying')}
                    </p>
                </div>
            </div>
        );
    }

    if (verifyError) {
        return (
            <div className="flex h-screen items-center justify-center bg-slate-50 p-6">
                <Card className="max-w-md shadow-2xl border-none">
                    <CardHeader className="text-center">
                        <div className="bg-red-50 h-16 w-16 rounded-full flex items-center justify-center mx-auto mb-4 border border-red-100">
                            <AlertCircle className="h-8 w-8 text-red-500" />
                        </div>
                        <CardTitle className="text-red-600">
                            {t('auth.register.invalid_title')}
                        </CardTitle>
                        <CardDescription>{t('auth.register.invalid_desc')}</CardDescription>
                    </CardHeader>
                    <CardFooter>
                        <Button variant="outline" className="w-full" onClick={() => navigate('/')}>
                            {t('auth.login.back_to_home')}
                        </Button>
                    </CardFooter>
                </Card>
            </div>
        );
    }

    if (isSuccess) {
        return (
            <div className="flex h-screen items-center justify-center bg-slate-50 p-6">
                <Card className="max-w-md shadow-2xl border-none text-center">
                    <CardHeader>
                        <div className="bg-emerald-50 h-16 w-16 rounded-full flex items-center justify-center mx-auto mb-4 border border-emerald-100">
                            <CheckCircle2 className="h-8 w-8 text-emerald-500" />
                        </div>
                        <CardTitle className="text-emerald-600">
                            {t('auth.register.success_title')}
                        </CardTitle>
                        <CardDescription>{t('auth.register.success_desc')}</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <p className="text-sm text-slate-500">{t('auth.register.success_hint')}</p>
                    </CardContent>
                    <CardFooter>
                        <Button
                            className="w-full h-12 text-lg font-semibold"
                            onClick={() => navigate('/hub')}
                        >
                            {t('auth.register.success_cta')}
                        </Button>
                    </CardFooter>
                </Card>
            </div>
        );
    }

    return (
        <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 p-6">
            <div className="w-full max-w-[420px] space-y-8">
                <div className="text-center space-y-2">
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100 text-2xs font-bold mb-4">
                        <ShieldCheck className="h-3 w-3" /> {t('auth.register.secure_invitation')}
                    </div>
                    <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 italic">
                        Open<span className="text-primary">-Q</span>
                    </h1>
                    <p className="text-slate-500 font-medium">{t('auth.register.subtitle')}</p>
                </div>

                <Card className="shadow-2xl border-none bg-white/90 backdrop-blur-xl ring-1 ring-slate-900/5">
                    <CardHeader className="pb-2">
                        <CardTitle className="flex items-center justify-between">
                            <span className="text-xl tracking-tight">
                                {t('auth.register.title')}
                            </span>
                            <UserPlus className="h-5 w-5 text-indigo-600" />
                        </CardTitle>
                        <CardDescription className="pt-4">
                            <div className="bg-indigo-50/60 p-4 rounded-xl border border-indigo-100/50 flex flex-col gap-3">
                                <div className="flex items-center gap-2 border-b border-indigo-100 pb-2">
                                    <span className="text-2xs font-black text-indigo-400">
                                        {t('auth.register.invitation_to')}
                                    </span>
                                </div>
                                <div className="flex items-center justify-between">
                                    <div className="flex flex-col">
                                        <span className="text-sm font-bold text-slate-900">
                                            {invite?.workspace_name}
                                        </span>
                                        <span className="text-xs text-slate-500 font-medium">
                                            {t('admin.workspace.switcher.new_workspace_desc')}
                                        </span>
                                    </div>
                                    <Badge
                                        variant="outline"
                                        className="bg-white text-2xs font-bold text-indigo-600 border-indigo-200 px-2 py-1 shadow-sm"
                                    >
                                        {invite?.role}
                                    </Badge>
                                </div>
                            </div>
                        </CardDescription>
                    </CardHeader>
                    <form onSubmit={handleRegister}>
                        <CardContent className="space-y-4 pt-4">
                            <div className="space-y-2">
                                <Label htmlFor="email" className="text-xs font-bold text-slate-400">
                                    {t('auth.register.email_label')}
                                </Label>
                                <div className="relative">
                                    <AtSign className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                                    <Input
                                        id="email"
                                        type="email"
                                        className="pl-10 h-11 bg-slate-50/50 border-slate-200 focus:bg-white"
                                        value={email}
                                        disabled // Fixed to invitation email
                                        readOnly
                                    />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <Label
                                    htmlFor="password"
                                    className="text-xs font-bold text-slate-400"
                                >
                                    {t('auth.register.password_label')}
                                </Label>
                                <div className="relative">
                                    <Lock className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                                    <Input
                                        id="password"
                                        type="password"
                                        placeholder={t('auth.register.placeholder_password')}
                                        className="pl-10 h-11 bg-slate-50/50 border-slate-200 focus:bg-white"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        required
                                    />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <Label
                                    htmlFor="confirm-password"
                                    className="text-xs font-bold text-slate-400"
                                >
                                    {t('auth.register.confirm_password_label')}
                                </Label>
                                <div className="relative">
                                    <Lock className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                                    <Input
                                        id="confirm-password"
                                        type="password"
                                        placeholder={t('auth.register.placeholder_password')}
                                        className="pl-10 h-11 bg-slate-50/50 border-slate-200 focus:bg-white"
                                        value={confirmPassword}
                                        onChange={(e) => setConfirmPassword(e.target.value)}
                                        required
                                    />
                                </div>
                            </div>
                        </CardContent>
                        <CardFooter className="pt-2">
                            <Button
                                type="submit"
                                className="w-full h-12 text-lg font-bold shadow-lg shadow-primary/20"
                                disabled={registerMutation.isPending}
                            >
                                {registerMutation.isPending ? (
                                    <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                                ) : (
                                    t('auth.register.submit')
                                )}
                            </Button>
                        </CardFooter>
                    </form>
                </Card>

                <p className="text-center text-2xs text-slate-400 font-medium opacity-50">
                    Libre-Q
                </p>
            </div>
        </div>
    );
};

export default RegistrationPage;
