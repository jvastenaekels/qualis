import type React from 'react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Lock, ChevronRight, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface StudyAccessGateProps {
    title: string;
    description: string;
    onUnlock: (password: string) => void;
    isLoading?: boolean;
    error?: string | null;
}

export const StudyAccessGate: React.FC<StudyAccessGateProps> = ({
    title,
    description,
    onUnlock,
    isLoading,
    error,
}) => {
    const { t } = useTranslation();
    const [password, setPassword] = useState('');

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (password.trim()) {
            onUnlock(password);
        }
    };

    return (
        <div className="flex-1 flex flex-col items-center justify-center p-6 bg-slate-50 min-h-dvh">
            <Card className="w-full max-w-md shadow-xl border-slate-200 animate-in fade-in zoom-in-95 duration-500">
                <CardHeader className="text-center space-y-4">
                    <div className="mx-auto w-16 h-16 bg-indigo-50 rounded-2xl flex items-center justify-center text-indigo-600 shadow-inner">
                        <Lock className="w-8 h-8" />
                    </div>
                    <div className="space-y-2">
                        <CardTitle className="text-2xl font-bold text-slate-900">{title}</CardTitle>
                        <CardDescription className="text-slate-500 italic">
                            {description ||
                                t(
                                    'study.access.protected_desc',
                                    'This study is protected by an access password.'
                                )}
                        </CardDescription>
                    </div>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleSubmit} className="space-y-6">
                        <div className="space-y-2">
                            <Label
                                htmlFor="password"
                                name="password"
                                className="text-sm font-bold text-slate-700 uppercase tracking-wider ml-1"
                            >
                                {t('study.access.password_label', 'Enter Password')}
                            </Label>
                            <Input
                                id="password"
                                type="password"
                                placeholder="••••••••"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="h-12 border-slate-200 focus:ring-indigo-500 focus:border-indigo-500 rounded-xl"
                                autoFocus
                            />
                        </div>

                        {error && (
                            <Alert
                                variant="destructive"
                                className="bg-red-50 border-red-100 text-red-800 rounded-xl animate-in shake duration-300"
                            >
                                <AlertCircle className="h-4 w-4" />
                                <AlertDescription className="text-xs font-medium">
                                    {t(
                                        'study.access.wrong_password',
                                        'Incorrect password. Please try again.'
                                    )}
                                </AlertDescription>
                            </Alert>
                        )}

                        <Button
                            type="submit"
                            disabled={isLoading || !password.trim()}
                            className="w-full h-12 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-lg shadow-indigo-200 transition-all active:scale-95 group"
                        >
                            {isLoading ? (
                                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            ) : (
                                <>
                                    {t('study.access.unlock_btn', 'Unlock Study')}
                                    <ChevronRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
                                </>
                            )}
                        </Button>
                    </form>
                </CardContent>
            </Card>

            <p className="mt-8 text-slate-400 text-xs font-medium uppercase tracking-widest flex items-center gap-2">
                <span className="w-8 h-px bg-slate-200" />
                Powered by Open-Q
                <span className="w-8 h-px bg-slate-200" />
            </p>
        </div>
    );
};

// Helper internal component to avoid Label import if not available
// biome-ignore lint/suspicious/noExplicitAny: internal helper
const Label = ({ children, className, htmlFor }: any) => (
    <label htmlFor={htmlFor} className={className}>
        {children}
    </label>
);
