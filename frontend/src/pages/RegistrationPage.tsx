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
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { toast } from 'sonner';
import {
    useVerifyInvitationApiAdminInvitationsVerifyTokenGet,
    useRegisterUserApiAuthRegisterPost,
} from '@/api/generated';

const RegistrationPage = () => {
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
    } = useVerifyInvitationApiAdminInvitationsVerifyTokenGet(token || '', {
        query: {
            enabled: !!token,
        },
    });

    const registerMutation = useRegisterUserApiAuthRegisterPost();

    useEffect(() => {
        if (invite) {
            setEmail(invite.email);
        }
    }, [invite]);

    const handleRegister = async (e: React.FormEvent) => {
        e.preventDefault();
        if (password !== confirmPassword) {
            toast.error('Passwords do not match');
            return;
        }

        try {
            await registerMutation.mutateAsync({
                data: {
                    email,
                    password,
                    invitation_token: token || undefined,
                },
            });
            setIsSuccess(true);
            toast.success('Account created successfully!');
        } catch (error) {
            toast.error('Registration failed');
            console.error(error);
        }
    };

    if (!token) {
        return (
            <div className="flex h-screen items-center justify-center bg-slate-50 p-6">
                <Alert variant="destructive" className="max-w-md shadow-xl bg-white">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>Missing Token</AlertTitle>
                    <AlertDescription>
                        This page requires a valid invitation token. Please check the link you
                        received.
                    </AlertDescription>
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
                        Verifying your invitation...
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
                        <CardTitle className="text-red-600">Invalid Invitation</CardTitle>
                        <CardDescription>
                            This invitation link is invalid or has expired.
                        </CardDescription>
                    </CardHeader>
                    <CardFooter>
                        <Button variant="outline" className="w-full" onClick={() => navigate('/')}>
                            Back to Home
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
                        <CardTitle className="text-emerald-600">Welcome Aboard!</CardTitle>
                        <CardDescription>
                            Your account has been created and linked to the study.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <p className="text-sm text-slate-500">
                            You can now log in to the administrative dashboard to begin
                            collaborating.
                        </p>
                    </CardContent>
                    <CardFooter>
                        <Button
                            className="w-full h-12 text-lg font-semibold"
                            onClick={() => navigate('/admin')}
                        >
                            Go to Dashboard
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
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100 text-[10px] font-bold uppercase tracking-widest mb-4">
                        <ShieldCheck className="h-3 w-3" /> Secure Invitation
                    </div>
                    <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 italic">
                        Open<span className="text-primary">-Q</span>
                    </h1>
                    <p className="text-slate-500 font-medium">Join the research project</p>
                </div>

                <Card className="shadow-2xl border-none bg-white/80 backdrop-blur-xl">
                    <CardHeader>
                        <CardTitle className="flex items-center justify-between">
                            <span>Create Account</span>
                            <UserPlus className="h-5 w-5 text-primary" />
                        </CardTitle>
                        <CardDescription className="bg-slate-50 p-3 rounded-lg border mt-2 flex flex-col gap-1">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                                Invitation To:
                            </span>
                            <span className="font-semibold text-slate-700">
                                Study #{invite?.study_id}
                            </span>
                            <span className="text-xs text-slate-500 italic">
                                Role: {invite?.role}
                            </span>
                        </CardDescription>
                    </CardHeader>
                    <form onSubmit={handleRegister}>
                        <CardContent className="space-y-4 pt-4">
                            <div className="space-y-2">
                                <Label
                                    htmlFor="email"
                                    className="text-xs font-bold uppercase text-slate-400 tracking-wider"
                                >
                                    Email Address
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
                                <Label htmlFor="password text-xs font-bold uppercase text-slate-400 tracking-wider">
                                    Choose Password
                                </Label>
                                <div className="relative">
                                    <Lock className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                                    <Input
                                        id="password"
                                        type="password"
                                        placeholder="••••••••"
                                        className="pl-10 h-11 bg-slate-50/50 border-slate-200 focus:bg-white"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        required
                                    />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="confirm-password text-xs font-bold uppercase text-slate-400 tracking-wider">
                                    Confirm Password
                                </Label>
                                <div className="relative">
                                    <Lock className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                                    <Input
                                        id="confirm-password"
                                        type="password"
                                        placeholder="••••••••"
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
                                    'Complete Registration'
                                )}
                            </Button>
                        </CardFooter>
                    </form>
                </Card>

                <p className="text-center text-xs text-slate-400">
                    By registering, you agree to follow the research ethics guidelines configured
                    for this study.
                </p>
            </div>
        </div>
    );
};

export default RegistrationPage;
