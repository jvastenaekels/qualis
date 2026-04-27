import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import {
    Card,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { customInstance } from '@/api/mutator';
import {
    useSetupTotpApiMe2faSetupGet,
    useEnableTotpApiMe2faEnablePost,
    useDisableTotpApiMe2faDisablePost,
} from '@/api/generated';
import { QRCodeSVG } from 'qrcode.react';
import { Shield, ShieldCheck, ShieldAlert, Key, Copy, AlertCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { StudyPageHeader } from '@/components/admin/layout/StudyPageHeader';
import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';
import { parseApiErrorSync } from '@/lib/error-utils';

type Translator = (key: string, fallback: string) => string;

export function makeProfileSchema(t: Translator) {
    return z.object({
        email: z.string().optional(),
        full_name: z
            .string()
            .min(1, t('admin.profile.personal.name_required', 'Full name is required')),
    });
}

export function makePasswordSchema(t: Translator) {
    return z.object({
        current_password: z
            .string()
            .min(1, t('admin.profile.password.validation.required', 'Required')),
        new_password: z
            .string()
            .min(8, t('admin.profile.password.validation.min_length', 'Min 8 characters')),
    });
}

type ProfileFormValues = z.infer<ReturnType<typeof makeProfileSchema>>;
type PasswordFormValues = z.infer<ReturnType<typeof makePasswordSchema>>;

const ProfilePage = () => {
    const { user, refetch: refetchUser } = useAuth();
    const { t } = useTranslation();
    const [isUpdating, setIsUpdating] = useState(false);
    const [isChangingPassword, setIsChangingPassword] = useState(false);

    // 2FA State
    const [is2FASetupMode, setIs2FASetupMode] = useState(false);
    const [totpToken, setTotpToken] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showDisableConfirm, setShowDisableConfirm] = useState(false);

    const { data: totpSetup, isLoading: isSetupLoading } = useSetupTotpApiMe2faSetupGet({
        query: {
            enabled: is2FASetupMode && !user?.is_totp_enabled,
        },
    });

    const enableMutation = useEnableTotpApiMe2faEnablePost({
        mutation: {
            onSuccess: () => {
                toast.success(
                    t('admin.profile.security.enabled_success', 'Two-factor authentication enabled')
                );
                setIs2FASetupMode(false);
                setTotpToken('');
                refetchUser();
            },
            onError: (err: unknown) => {
                toast.error(
                    parseApiErrorSync(
                        err,
                        t('admin.profile.security.invalid_token', 'Invalid verification code')
                    )
                );
            },
        },
    });

    const disableMutation = useDisableTotpApiMe2faDisablePost({
        mutation: {
            onSuccess: () => {
                toast.success(
                    t(
                        'admin.profile.security.disabled_success',
                        'Two-factor authentication disabled'
                    )
                );
                setShowDisableConfirm(false);
                setConfirmPassword('');
                refetchUser();
            },
            onError: (err: unknown) => {
                toast.error(
                    parseApiErrorSync(
                        err,
                        t('admin.profile.security.disable_error', 'Failed to disable 2FA')
                    )
                );
            },
        },
    });

    const profileSchema = useMemo(() => makeProfileSchema(t), [t]);
    const passwordSchema = useMemo(() => makePasswordSchema(t), [t]);

    const profileForm = useForm<ProfileFormValues>({
        resolver: zodResolver(profileSchema),
        values: {
            email: user?.email ?? undefined,
            full_name: user?.full_name ?? '',
        },
    });

    const passwordForm = useForm<PasswordFormValues>({
        resolver: zodResolver(passwordSchema),
        defaultValues: { current_password: '', new_password: '' },
    });

    const onProfileSubmit = async ({ full_name }: ProfileFormValues) => {
        setIsUpdating(true);
        try {
            await customInstance<void>({
                url: '/api/me',
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                data: { full_name },
            });
            toast.success(t('admin.profile.personal.success', 'Profile updated successfully'));
            refetchUser();
        } catch (error) {
            toast.error(
                parseApiErrorSync(
                    error,
                    t('admin.profile.personal.error', 'Failed to update profile')
                )
            );
        } finally {
            setIsUpdating(false);
        }
    };

    const onPasswordSubmit = async (data: PasswordFormValues) => {
        setIsChangingPassword(true);
        try {
            await customInstance<void>({
                url: '/api/me/password',
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                data,
            });
            toast.success(t('admin.profile.password.success', 'Password changed successfully'));
            passwordForm.reset();
        } catch (error) {
            toast.error(
                parseApiErrorSync(
                    error,
                    t(
                        'admin.profile.password.error',
                        'Failed to change password. Check current password.'
                    )
                )
            );
        } finally {
            setIsChangingPassword(false);
        }
    };

    return (
        <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6 pt-2">
            <StudyPageHeader
                title={t('admin.profile.title', 'Profile & security')}
                description={t(
                    'admin.profile.description',
                    'Manage your personal information and account security.'
                )}
                icon={Shield}
            />

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-8 pb-12">
                {/* Profile Information */}
                <Card className="border-none shadow-sm bg-white rounded-2xl overflow-hidden h-fit">
                    <CardHeader className="border-b border-slate-50 pb-4">
                        <CardTitle className="text-lg font-black text-slate-900 flex items-center gap-2">
                            <Key className="size-5 text-indigo-500" />
                            {t('admin.profile.personal.title', 'Personal information')}
                        </CardTitle>
                        <CardDescription className="text-sm font-medium text-slate-500">
                            {t(
                                'admin.profile.personal.description',
                                'Update your name and contact details.'
                            )}
                        </CardDescription>
                    </CardHeader>
                    <Form {...profileForm}>
                        <form onSubmit={profileForm.handleSubmit(onProfileSubmit)}>
                            <CardContent className="space-y-4">
                                <FormField
                                    control={profileForm.control}
                                    name="email"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel className="text-2xs font-black text-slate-500">
                                                {t('admin.profile.personal.email', 'Email address')}
                                            </FormLabel>
                                            <FormControl>
                                                <Input
                                                    {...field}
                                                    value={field.value ?? ''}
                                                    disabled
                                                    className="h-11 rounded-xl bg-slate-50 border-slate-200"
                                                />
                                            </FormControl>
                                            <p className="text-2xs text-slate-400 italic">
                                                {t(
                                                    'admin.profile.personal.email_locked',
                                                    'Email cannot be changed directly. Contact admin.'
                                                )}
                                            </p>
                                        </FormItem>
                                    )}
                                />
                                <FormField
                                    control={profileForm.control}
                                    name="full_name"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel className="text-2xs font-black text-slate-500">
                                                {t('admin.profile.personal.name', 'Full name')}
                                            </FormLabel>
                                            <FormControl>
                                                <Input
                                                    {...field}
                                                    placeholder={t(
                                                        'admin.profile.personal.name',
                                                        'Full name'
                                                    )}
                                                    className="h-11 rounded-xl"
                                                />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            </CardContent>
                            <CardFooter className="border-t border-slate-50 px-6 py-4 justify-end">
                                <Button
                                    type="submit"
                                    disabled={isUpdating}
                                    className="h-11 rounded-xl px-6 font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm"
                                >
                                    {isUpdating
                                        ? t('admin.profile.personal.saving', 'Saving...')
                                        : t('admin.profile.personal.save', 'Save changes')}
                                </Button>
                            </CardFooter>
                        </form>
                    </Form>
                </Card>

                {/* Two-Factor Authentication (2FA) */}
                <Card
                    className={cn(
                        'border-none shadow-sm bg-white rounded-2xl overflow-hidden h-fit transition-all',
                        user?.is_totp_enabled ? 'bg-emerald-50/20' : ''
                    )}
                >
                    <CardHeader className="border-b border-slate-50 pb-4">
                        <div className="flex items-center justify-between">
                            <div className="space-y-1">
                                <CardTitle className="text-lg font-black text-slate-900 flex items-center gap-2">
                                    <ShieldCheck className="size-5 text-indigo-500" />
                                    {t('admin.profile.security.title', 'Security & 2FA')}
                                    {user?.is_totp_enabled && (
                                        <Badge className="bg-emerald-50 text-emerald-700 border-emerald-100 text-2xs font-black">
                                            {t('admin.profile.security.enabled', 'Enabled')}
                                        </Badge>
                                    )}
                                </CardTitle>
                                <CardDescription className="text-sm font-medium text-slate-500">
                                    {t(
                                        'admin.profile.security.description',
                                        'Add an extra layer of security using TOTP.'
                                    )}
                                </CardDescription>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        {!user?.is_totp_enabled && !is2FASetupMode && (
                            <div className="flex flex-col items-start gap-4 p-6 border rounded-2xl bg-slate-50 border-slate-100 shadow-inner">
                                <div className="flex items-start gap-4">
                                    <div className="p-2.5 bg-white rounded-xl border border-slate-200 shadow-sm mt-1">
                                        <ShieldAlert size={24} className="text-amber-500" />
                                    </div>
                                    <div className="space-y-1">
                                        <h4 className="font-bold text-slate-900">
                                            {t(
                                                'admin.profile.security.status_inactive',
                                                'Account security is low'
                                            )}
                                        </h4>
                                        <p className="text-sm text-slate-500 font-medium">
                                            {t(
                                                'admin.profile.security.status_inactive_desc',
                                                'Enable two-factor authentication to protect your sensitive data and studies.'
                                            )}
                                        </p>
                                    </div>
                                </div>
                                <Button
                                    onClick={() => setIs2FASetupMode(true)}
                                    className="h-11 rounded-xl px-8 font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm"
                                >
                                    {t('admin.profile.security.setup_cta', 'Setup 2FA now')}
                                </Button>
                            </div>
                        )}

                        {!user?.is_totp_enabled && is2FASetupMode && (
                            <div className="space-y-6 border rounded-xl p-6 bg-white animate-in slide-in-from-top-2 duration-300">
                                <header className="flex items-center justify-between pb-4 border-b">
                                    <h4 className="font-bold text-slate-900 flex items-center gap-2">
                                        <Key size={18} className="text-indigo-600" />
                                        {t(
                                            'admin.profile.security.configure_title',
                                            'Configure authenticator app'
                                        )}
                                    </h4>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => setIs2FASetupMode(false)}
                                    >
                                        {t('admin.profile.security.cancel', 'Cancel')}
                                    </Button>
                                </header>

                                <div className="grid md:grid-cols-2 gap-8 items-center">
                                    <div className="space-y-4">
                                        <p className="text-sm text-slate-600 leading-relaxed">
                                            {t(
                                                'admin.profile.security.scan_desc',
                                                '1. Scan this QR code with an authenticator app.'
                                            )}
                                        </p>
                                        <div className="p-3 bg-slate-50 rounded-lg border font-mono text-xs flex items-center justify-between select-all group">
                                            {isSetupLoading ? 'Generating...' : totpSetup?.secret}
                                            <button
                                                type="button"
                                                className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-slate-200 rounded"
                                                onClick={() => {
                                                    navigator.clipboard.writeText(
                                                        totpSetup?.secret || ''
                                                    );
                                                    toast.success(
                                                        t(
                                                            'admin.profile.security.secret_copied',
                                                            'Secret copied'
                                                        )
                                                    );
                                                }}
                                            >
                                                <Copy size={14} className="text-slate-500" />
                                            </button>
                                        </div>
                                    </div>
                                    <div className="flex flex-col items-center justify-center p-4 bg-white border-2 border-dashed rounded-2xl">
                                        {isSetupLoading ? (
                                            <div className="h-40 w-40 flex items-center justify-center animate-pulse bg-slate-100 rounded-lg">
                                                <AlertCircle className="text-slate-300" size={48} />
                                            </div>
                                        ) : (
                                            <QRCodeSVG
                                                value={totpSetup?.qr_code_uri || ''}
                                                size={160}
                                            />
                                        )}
                                    </div>
                                </div>

                                <div className="space-y-3 pt-4 border-t">
                                    <Label
                                        htmlFor="2fa-token"
                                        className="text-sm font-bold text-slate-700"
                                    >
                                        {t(
                                            'admin.profile.security.enter_code',
                                            '2. Enter the 6-digit code'
                                        )}
                                    </Label>
                                    <div className="flex gap-3">
                                        <Input
                                            id="2fa-token"
                                            placeholder="000000"
                                            className="h-12 text-center text-2xl tracking-[0.5em] font-bold max-w-[200px]"
                                            maxLength={6}
                                            value={totpToken}
                                            onChange={(e) => setTotpToken(e.target.value)}
                                        />
                                        <Button
                                            className="h-12 px-8 bg-indigo-600 hover:bg-indigo-700 font-bold"
                                            disabled={
                                                totpToken.length !== 6 || enableMutation.isPending
                                            }
                                            onClick={() =>
                                                enableMutation.mutate({
                                                    data: { token: totpToken },
                                                })
                                            }
                                        >
                                            {enableMutation.isPending
                                                ? t(
                                                      'admin.profile.security.verifying',
                                                      'Verifying...'
                                                  )
                                                : t(
                                                      'admin.profile.security.enable_btn',
                                                      'Enable 2FA'
                                                  )}
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        )}

                        {user?.is_totp_enabled && (
                            <div className="space-y-6">
                                <div className="p-4 border border-green-100 bg-green-50/50 rounded-xl flex items-start gap-3">
                                    <ShieldCheck size={20} className="text-green-600 mt-1" />
                                    <div className="space-y-1">
                                        <h4 className="font-semibold text-green-900">
                                            {t(
                                                'admin.profile.security.active_msg',
                                                '2FA is active'
                                            )}
                                        </h4>
                                        <p className="text-sm text-green-700/80">
                                            {t(
                                                'admin.profile.security.status_active',
                                                'Your account is secured with two-factor authentication.'
                                            )}
                                        </p>
                                    </div>
                                </div>

                                {!showDisableConfirm ? (
                                    <Button
                                        variant="outline"
                                        className="text-red-600 border-red-200"
                                        onClick={() => setShowDisableConfirm(true)}
                                    >
                                        {t('admin.profile.security.disable_btn', 'Disable 2FA')}
                                    </Button>
                                ) : (
                                    <div className="p-4 border border-red-100 bg-red-50/20 rounded-xl space-y-4">
                                        <Label htmlFor="disable-password">
                                            {t(
                                                'admin.profile.security.confirm_password_label',
                                                'Confirm with your password'
                                            )}
                                        </Label>
                                        <div className="flex gap-3">
                                            <Input
                                                id="disable-password"
                                                type="password"
                                                value={confirmPassword}
                                                onChange={(e) => setConfirmPassword(e.target.value)}
                                            />
                                            <Button
                                                variant="destructive"
                                                disabled={
                                                    !confirmPassword || disableMutation.isPending
                                                }
                                                onClick={() =>
                                                    disableMutation.mutate({
                                                        data: { current_password: confirmPassword },
                                                    })
                                                }
                                            >
                                                {t(
                                                    'admin.profile.security.confirm_disable',
                                                    'Confirm disable'
                                                )}
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                onClick={() => setShowDisableConfirm(false)}
                                            >
                                                {t('admin.profile.security.cancel', 'Cancel')}
                                            </Button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Security */}
                <Card className="border-none shadow-sm bg-white rounded-2xl overflow-hidden h-fit">
                    <CardHeader className="border-b border-slate-50 pb-4">
                        <CardTitle className="text-lg font-black text-slate-900 flex items-center gap-2">
                            <Shield size={20} className="text-indigo-500" />
                            {t('admin.profile.password.title', 'Password management')}
                        </CardTitle>
                        <CardDescription className="text-sm font-medium text-slate-500">
                            {t(
                                'admin.profile.password.description',
                                'Update your password to keep your account secure.'
                            )}
                        </CardDescription>
                    </CardHeader>
                    <Form {...passwordForm}>
                        <form onSubmit={passwordForm.handleSubmit(onPasswordSubmit)}>
                            <CardContent className="space-y-4">
                                <FormField
                                    control={passwordForm.control}
                                    name="current_password"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel className="text-2xs font-black text-slate-500">
                                                {t(
                                                    'admin.profile.password.current',
                                                    'Current password'
                                                )}
                                            </FormLabel>
                                            <FormControl>
                                                <Input
                                                    {...field}
                                                    type="password"
                                                    className="h-11 rounded-xl"
                                                />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                <FormField
                                    control={passwordForm.control}
                                    name="new_password"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel className="text-2xs font-black text-slate-500">
                                                {t('admin.profile.password.new', 'New password')}
                                            </FormLabel>
                                            <FormControl>
                                                <Input
                                                    {...field}
                                                    type="password"
                                                    className="h-11 rounded-xl"
                                                />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            </CardContent>
                            <CardFooter className="border-t border-slate-50 px-6 py-4 justify-end">
                                <Button
                                    type="submit"
                                    disabled={isChangingPassword}
                                    className="h-11 rounded-xl px-6 font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm"
                                >
                                    {isChangingPassword
                                        ? t('admin.profile.password.updating', 'Updating...')
                                        : t('admin.profile.password.change_btn', 'Change password')}
                                </Button>
                            </CardFooter>
                        </form>
                    </Form>
                </Card>
            </div>
        </div>
    );
};

export default ProfilePage;
