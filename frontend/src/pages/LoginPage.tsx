import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useLoginForAccessTokenApiTokenPost, useReadUsersMeApiMeGet } from '@/api/generated';
import { useAuthStore } from '@/store/useAuthStore';
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

const LoginPage = () => {
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
                setAuth(tokenResponse.access_token, {
                    id: user.id,
                    email: user.email,
                    is_superuser: user.is_superuser,
                });

                toast.success('Welcome back!');
                const redirect = searchParams.get('redirect') || '/admin';
                navigate(redirect);
            }
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            const detail = message.includes('401')
                ? 'Invalid email or password'
                : 'Something went wrong. Please try again.';

            toast.error(detail);
            // Clear token if fetchMe failed
            useAuthStore.setState({ token: null });
        }
    };

    return (
        <div className="min-h-screen w-full flex items-center justify-center bg-[#fafafa] dark:bg-[#0a0a0a] p-4">
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
                    <div className="w-12 h-12 bg-slate-900 dark:bg-white rounded-xl flex items-center justify-center shadow-lg mb-4">
                        <ShieldCheck className="text-white dark:text-black h-7 w-7" />
                    </div>
                    <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                        Open-Q Admin
                    </h1>
                    <p className="text-sm text-slate-500 mt-2">
                        Enter your credentials to manage your studies
                    </p>
                </div>

                <Card className="border-none shadow-[0_8px_30px_rgb(0,0,0,0.04)] dark:shadow-[0_8px_30px_rgb(0,0,0,0.2)] bg-white/80 dark:bg-slate-900/80 backdrop-blur-md">
                    <form onSubmit={handleLogin}>
                        <CardHeader className="space-y-1 pb-4">
                            <CardTitle className="text-xl">Sign in</CardTitle>
                            <CardDescription>
                                Secure access to your research dashboard
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="email">Email address</Label>
                                <div className="relative">
                                    <AtSign className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                                    <Input
                                        id="email"
                                        type="email"
                                        placeholder="name@example.com"
                                        className="pl-10 bg-slate-50/50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        required
                                    />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <Label htmlFor="password">Password</Label>
                                    <button
                                        type="button"
                                        className="text-[10px] font-medium text-indigo-600 hover:text-indigo-500 dark:text-indigo-400"
                                        tabIndex={-1}
                                    >
                                        Forgot?
                                    </button>
                                </div>
                                <div className="relative">
                                    <Lock className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                                    <Input
                                        id="password"
                                        type="password"
                                        placeholder="••••••••"
                                        className="pl-10 bg-slate-50/50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        required
                                    />
                                </div>
                            </div>
                        </CardContent>
                        <CardFooter className="pt-2 flex flex-col gap-4">
                            <Button
                                type="submit"
                                className="w-full bg-slate-900 hover:bg-slate-800 dark:bg-white dark:text-black dark:hover:bg-slate-200 transition-all font-semibold"
                                disabled={loginMutation.isPending}
                            >
                                {loginMutation.isPending ? (
                                    <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        Authenticating...
                                    </>
                                ) : (
                                    <>
                                        Continue
                                        <ArrowRight className="ml-2 h-4 w-4" />
                                    </>
                                )}
                            </Button>
                        </CardFooter>
                    </form>
                </Card>

                <p className="text-center text-xs text-slate-400 mt-8">
                    By signing in, you agree to our Terms and Privacy Policy.
                    <br />
                    Powered by <span className="font-semibold text-slate-500">Open-Q</span>
                </p>
            </motion.div>
        </div>
    );
};

export default LoginPage;
