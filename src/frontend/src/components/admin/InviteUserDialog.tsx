import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Copy } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { readMutationError } from '@/lib/error-utils';

interface InviteUserDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onInvite: (email: string) => Promise<string>;
    isEmailManual: boolean;
}

export function InviteUserDialog({
    open,
    onOpenChange,
    onInvite,
    isEmailManual,
}: InviteUserDialogProps) {
    const { t } = useTranslation();
    const [email, setEmail] = useState('');
    const [link, setLink] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [pending, setPending] = useState(false);
    const [copied, setCopied] = useState(false);

    const trimmed = email.trim();
    const looksValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);

    const handleOpenChange = (next: boolean) => {
        if (!next) {
            setEmail('');
            setLink(null);
            setError(null);
            setCopied(false);
        }
        onOpenChange(next);
    };

    const submit = async () => {
        if (!looksValid || pending) return;
        setPending(true);
        setError(null);
        try {
            setLink(await onInvite(trimmed));
        } catch (err) {
            const message = readMutationError(
                err,
                t('admin.users.generic_error', 'Something went wrong. Please try again.')
            );
            // The backend sends a stable code, not a sentence, for this 409.
            setError(
                message === 'email_already_registered'
                    ? t(
                          'admin.users.invite_dialog.already_registered',
                          'This address already has an account.'
                      )
                    : message
            );
        } finally {
            setPending(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{t('admin.users.invite_dialog.title', 'Invite user')}</DialogTitle>
                </DialogHeader>
                {link === null ? (
                    <form
                        onSubmit={(e) => {
                            e.preventDefault();
                            void submit();
                        }}
                        className="space-y-4"
                    >
                        <div className="space-y-1.5">
                            <label
                                htmlFor="admin-invite-email-input"
                                className="text-xs font-bold text-slate-600"
                            >
                                {t('admin.users.invite_dialog.label', 'Email address')}
                            </label>
                            <Input
                                id="admin-invite-email-input"
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                autoComplete="off"
                                className="text-sm"
                            />
                        </div>
                        {error && (
                            <p role="alert" className="text-sm font-medium text-red-700">
                                {error}
                            </p>
                        )}
                        <div className="flex justify-end gap-2">
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => handleOpenChange(false)}
                            >
                                {t('admin.users.confirm.cancel', 'Cancel')}
                            </Button>
                            <Button type="submit" disabled={!looksValid || pending}>
                                {t('admin.users.invite_dialog.submit', 'Create invitation')}
                            </Button>
                        </div>
                    </form>
                ) : (
                    <>
                        <p className="text-sm text-slate-600 mb-3">
                            {isEmailManual
                                ? t(
                                      'admin.users.invite_dialog.link_manual',
                                      'Send this link to the person yourself. It works once and expires in 7 days.'
                                  )
                                : t(
                                      'admin.users.invite_dialog.link_sent',
                                      'An email with this link was sent to {{email}}. It works once and expires in 7 days.',
                                      { email: trimmed }
                                  )}
                        </p>
                        <div className="relative">
                            <Input readOnly value={link} className="pr-10 text-xs font-mono" />
                            <Button
                                size="sm"
                                variant="ghost"
                                aria-label={t('admin.users.invite_dialog.copy', 'Copy link')}
                                className="absolute right-1 top-1/2 -translate-y-1/2 size-8 p-0"
                                onClick={() => {
                                    navigator.clipboard.writeText(link);
                                    setCopied(true);
                                    setTimeout(() => setCopied(false), 2000);
                                }}
                            >
                                {copied ? (
                                    <Check className="size-3 text-emerald-600" />
                                ) : (
                                    <Copy className="size-3 text-slate-500" />
                                )}
                            </Button>
                        </div>
                    </>
                )}
            </DialogContent>
        </Dialog>
    );
}
