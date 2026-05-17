/*
 * Qualis - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

/**
 * AdminUsersPage — superuser-only account administration surface.
 *
 * Declarative JSX shell. ALL state-and-effect logic lives in
 * `useAdminUsersPage` (search, filter, risk derivation, sort, mutations,
 * pending-action confirmation). This component only renders the hook's
 * return value and wires the confirm dialog to the hook's actions.
 */

import { useTranslation } from 'react-i18next';
import {
    Users,
    Search,
    MoreVertical,
    ShieldAlert,
    Mail,
    KeyRound,
    Clock,
    UserCog,
    AlertCircle,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
    DropdownMenu,
    DropdownMenuTrigger,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { StudyPageHeader } from '@/components/admin/layout/StudyPageHeader';
import { resolveApiErrorKey } from '@/lib/error-utils';
import {
    useAdminUsersPage,
    deriveRiskBadges,
    type AdminUser,
    type FilterMode,
    type RiskBadge,
} from '@/hooks/admin/useAdminUsersPage';

const FILTER_MODES: FilterMode[] = ['all', 'superusers', 'no_2fa', 'unverified', 'dormant'];

const FILTER_FALLBACK: Record<FilterMode, string> = {
    all: 'All users',
    superusers: 'Superusers',
    no_2fa: 'No 2FA',
    unverified: 'Unverified email',
    dormant: 'Dormant',
};

const RISK_FALLBACK: Record<RiskBadge, string> = {
    superuser_no_2fa: 'Superuser without 2FA',
    email_unverified: 'Email unverified',
    password_stale: 'Password over a year old',
    email_change_pending: 'Email change pending',
    dormant: 'Dormant (90+ days)',
};

const RISK_ICON: Record<RiskBadge, typeof ShieldAlert> = {
    superuser_no_2fa: ShieldAlert,
    email_unverified: Mail,
    password_stale: KeyRound,
    email_change_pending: Mail,
    dormant: Clock,
};

type ActionKind =
    | 'delete'
    | 'reset-totp'
    | 'force-password-reset'
    | 'toggle-superuser'
    | 'deactivate';

// ────────────────────────────────────────────────────────────────
// Pure presentational helpers (no business logic — formatting only)
// ────────────────────────────────────────────────────────────────

function formatLastSeen(value: string | null | undefined): string | null {
    if (!value) return null;
    return new Date(value).toLocaleDateString();
}

// Deliberately surfaces the server's human-readable message and ignores the
// resolved i18n key (unlike ProjectMembersPage, which prefers a mapped key):
// backend guard-rail messages ("You cannot demote yourself.", "...must keep at
// least one active superuser.") are not in ERROR_KEY, so mapping would swallow
// the actionable reason. Do not reintroduce key-mapping here.
function readMutationError(err: unknown, fallback: string): string {
    if (err && typeof err === 'object') {
        const { fallback: serverMessage } = resolveApiErrorKey(
            err as { code?: string; message?: string }
        );
        if (serverMessage && serverMessage !== 'An error occurred.') return serverMessage;
    }
    if (err instanceof Error && err.message) return err.message;
    return fallback;
}

// ────────────────────────────────────────────────────────────────
// Page shell
// ────────────────────────────────────────────────────────────────

export default function AdminUsersPage() {
    const { t } = useTranslation();
    const {
        users,
        isLoading,
        error,
        search,
        setSearch,
        filter,
        setFilter,
        pendingAction,
        setPendingAction,
        now,
        isMutating,
        mutationError,
        actions,
    } = useAdminUsersPage();

    const confirmPending = async () => {
        if (!pendingAction) return;
        const { kind, user } = pendingAction;
        if (kind === 'delete') await actions.delete(user);
        else if (kind === 'deactivate') await actions.deactivate(user);
        else if (kind === 'reset-totp') await actions.resetTotp(user);
        else if (kind === 'force-password-reset') await actions.forcePasswordReset(user);
        else if (kind === 'toggle-superuser')
            await (user.is_superuser ? actions.demote(user) : actions.promote(user));
        setPendingAction(null);
    };

    return (
        <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6 pt-2">
            <StudyPageHeader
                title={t('admin.users.title', 'Users')}
                description={t(
                    'admin.users.subtitle',
                    'Manage platform accounts and audit hygiene.'
                )}
                icon={Users}
            />

            {mutationError != null && (
                <Alert variant="destructive">
                    <AlertCircle className="size-4" />
                    <AlertTitle>{t('admin.users.error_title', 'Action failed')}</AlertTitle>
                    <AlertDescription>
                        {readMutationError(
                            mutationError,
                            t(
                                'admin.users.generic_error',
                                'Something went wrong. Please try again.'
                            )
                        )}
                    </AlertDescription>
                </Alert>
            )}

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="relative w-full sm:max-w-xs">
                    <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                    <Input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder={t('admin.users.search_placeholder', 'Search by email or name')}
                        className="h-10 rounded-xl bg-slate-50 border-slate-200 pl-9 focus:bg-white transition-colors"
                        aria-label={t('admin.users.search_placeholder', 'Search by email or name')}
                    />
                </div>
                <div className="flex flex-wrap gap-2">
                    {FILTER_MODES.map((mode) => (
                        <Button
                            key={mode}
                            type="button"
                            size="sm"
                            variant={filter === mode ? 'default' : 'outline'}
                            onClick={() => setFilter(mode)}
                            className="rounded-full text-xs font-bold"
                        >
                            {t(`admin.users.filter.${mode}`, FILTER_FALLBACK[mode])}
                        </Button>
                    ))}
                </div>
            </div>

            <Card className="border-none shadow-sm bg-white rounded-2xl overflow-hidden">
                <CardContent className="p-0">
                    {isLoading ? (
                        <div className="space-y-3 p-6">
                            {Array.from({ length: 4 }).map((_, i) => (
                                <Skeleton key={i} className="h-16 w-full rounded-xl" />
                            ))}
                        </div>
                    ) : error != null ? (
                        <div className="p-12">
                            <Alert variant="destructive">
                                <AlertCircle className="size-4" />
                                <AlertTitle>
                                    {t('admin.users.load_error_title', 'Could not load users')}
                                </AlertTitle>
                                <AlertDescription>
                                    {t(
                                        'admin.users.load_error_body',
                                        'The user list could not be retrieved. Please refresh the page or try again later.'
                                    )}
                                </AlertDescription>
                            </Alert>
                        </div>
                    ) : users.length === 0 ? (
                        <div className="p-12 text-center text-sm font-medium text-slate-500">
                            {t('admin.users.empty', 'No users match.')}
                        </div>
                    ) : (
                        <ul className="divide-y divide-slate-50">
                            {users.map((u) => (
                                <UserRow
                                    key={u.id}
                                    user={u}
                                    now={now}
                                    isMutating={isMutating}
                                    onAction={(kind) => setPendingAction({ kind, user: u })}
                                    onReactivate={(target) => actions.activate(target)}
                                />
                            ))}
                        </ul>
                    )}
                </CardContent>
            </Card>

            <AlertDialog
                open={pendingAction !== null}
                onOpenChange={(open) => !open && setPendingAction(null)}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            {pendingAction
                                ? confirmTitle(t, pendingAction.kind, pendingAction.user)
                                : ''}
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            {pendingAction
                                ? confirmBody(t, pendingAction.kind, pendingAction.user)
                                : ''}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel onClick={() => setPendingAction(null)}>
                            {t('admin.users.confirm.cancel', 'Cancel')}
                        </AlertDialogCancel>
                        <AlertDialogAction
                            onClick={confirmPending}
                            disabled={isMutating}
                            className="bg-red-600 hover:bg-red-700"
                        >
                            {t('admin.users.confirm.confirm', 'Confirm')}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}

// ────────────────────────────────────────────────────────────────
// Confirm-dialog copy (presentational; reads from the user, no logic)
// ────────────────────────────────────────────────────────────────

type TFn = ReturnType<typeof useTranslation>['t'];

function confirmTitle(t: TFn, kind: ActionKind, user: AdminUser): string {
    switch (kind) {
        case 'delete':
            return t('admin.users.confirm.delete_title', 'Delete this user?');
        case 'reset-totp':
            return t('admin.users.confirm.reset-totp_title', 'Reset two-factor authentication?');
        case 'force-password-reset':
            return t('admin.users.confirm.force-password-reset_title', 'Force a password reset?');
        case 'deactivate':
            return t('admin.users.confirm.deactivate_title', 'Deactivate this account?');
        default:
            return user.is_superuser
                ? t('admin.users.confirm.demote_title', 'Revoke superuser access?')
                : t('admin.users.confirm.promote_title', 'Grant superuser access?');
    }
}

function confirmBody(t: TFn, kind: ActionKind, user: AdminUser): string {
    const email = user.email;
    switch (kind) {
        case 'delete':
            return t(
                'admin.users.confirm.delete_body',
                'Permanently delete {{email}}. This cannot be undone.',
                { email }
            );
        case 'reset-totp':
            return t(
                'admin.users.confirm.reset-totp_body',
                'Disable 2FA for {{email}}. They will need to set it up again.',
                { email }
            );
        case 'force-password-reset':
            return t(
                'admin.users.confirm.force-password-reset_body',
                'Invalidate the password for {{email}} and require a reset on next login.',
                { email }
            );
        case 'deactivate':
            return t(
                'admin.users.confirm.deactivate_body',
                'Immediately log {{email}} out and block sign-in until reactivated.',
                { email }
            );
        default:
            return user.is_superuser
                ? t(
                      'admin.users.confirm.demote_body',
                      'Remove superuser privileges from {{email}}.',
                      { email }
                  )
                : t(
                      'admin.users.confirm.promote_body',
                      'Grant {{email}} full superuser privileges over the platform.',
                      { email }
                  );
    }
}

// ────────────────────────────────────────────────────────────────
// Row (presentational: props in, JSX out)
// ────────────────────────────────────────────────────────────────

function UserRow({
    user,
    now,
    isMutating,
    onAction,
    onReactivate,
}: {
    user: AdminUser;
    now: Date;
    isMutating: boolean;
    onAction: (kind: ActionKind) => void;
    onReactivate: (user: AdminUser) => void;
}) {
    const { t } = useTranslation();
    const badges = deriveRiskBadges(user, now);
    const lastSeen = formatLastSeen(user.last_login_at);

    return (
        <li
            data-testid="admin-users-row"
            className="flex items-center justify-between gap-4 px-6 py-4 hover:bg-slate-50/40 transition-colors"
        >
            <div
                data-testid={`admin-users-row-${user.id}`}
                className="flex min-w-0 items-center gap-3"
            >
                <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-slate-100 to-slate-200 border border-slate-200 font-bold text-slate-500 shadow-sm">
                    {(user.full_name || user.email).charAt(0).toUpperCase()}
                </div>
                <div className="flex min-w-0 flex-col gap-1">
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate text-sm font-bold text-slate-900">
                            {user.email}
                        </span>
                        <Badge
                            variant={user.is_superuser ? 'default' : 'secondary'}
                            className="text-2xs"
                        >
                            {user.is_superuser
                                ? t('admin.users.role.superuser', 'Superuser')
                                : t('admin.users.role.user', 'User')}
                        </Badge>
                        {!user.is_active && (
                            <Badge variant="outline" className="text-2xs text-slate-500">
                                {t('admin.users.inactive', 'Inactive')}
                            </Badge>
                        )}
                    </div>
                    <span className="truncate text-xs font-medium text-slate-400">
                        {user.full_name || t('admin.users.no_name', 'No name')}
                    </span>
                    <div className="flex flex-wrap items-center gap-1.5">
                        {badges.map((b) => {
                            const Icon = RISK_ICON[b];
                            return (
                                <Badge
                                    key={b}
                                    variant="destructive"
                                    className="gap-1 text-2xs font-semibold"
                                >
                                    <Icon className="size-3" />
                                    {t(`admin.users.risk.${b}`, RISK_FALLBACK[b])}
                                </Badge>
                            );
                        })}
                    </div>
                    <span className="text-2xs font-medium text-slate-400">
                        {lastSeen
                            ? t('admin.users.last_seen', 'Last seen {{when}}', { when: lastSeen })
                            : t('admin.users.never_logged_in', 'Never logged in')}
                    </span>
                </div>
            </div>

            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        data-testid={`admin-users-actions-${user.id}`}
                        aria-label={t('admin.users.actions_aria', 'Actions for {{email}}', {
                            email: user.email,
                        })}
                        className="size-9 shrink-0 p-0 text-slate-400 hover:bg-slate-100 hover:text-slate-700 rounded-lg"
                    >
                        <MoreVertical className="size-4" />
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                    <DropdownMenuLabel className="flex items-center gap-2 text-xs">
                        <UserCog className="size-3.5" />
                        {t('admin.users.menu_label', 'Manage account')}
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                        disabled={isMutating}
                        onSelect={() => onAction('toggle-superuser')}
                    >
                        {user.is_superuser
                            ? t('admin.users.action.demote', 'Revoke superuser')
                            : t('admin.users.action.promote', 'Make superuser')}
                    </DropdownMenuItem>
                    {user.is_active ? (
                        <DropdownMenuItem
                            disabled={isMutating}
                            onSelect={() => onAction('deactivate')}
                        >
                            {t('admin.users.action.deactivate', 'Deactivate account')}
                        </DropdownMenuItem>
                    ) : (
                        <DropdownMenuItem disabled={isMutating} onSelect={() => onReactivate(user)}>
                            {t('admin.users.action.reactivate', 'Reactivate account')}
                        </DropdownMenuItem>
                    )}
                    <DropdownMenuItem
                        disabled={isMutating}
                        onSelect={() => onAction('force-password-reset')}
                    >
                        {t('admin.users.action.force_password_reset', 'Force password reset')}
                    </DropdownMenuItem>
                    <DropdownMenuItem disabled={isMutating} onSelect={() => onAction('reset-totp')}>
                        {t('admin.users.action.reset_totp', 'Reset 2FA')}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                        disabled={isMutating}
                        onSelect={() => onAction('delete')}
                        className="text-red-600 focus:text-red-600"
                    >
                        {t('admin.users.action.delete', 'Delete user')}
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>
        </li>
    );
}
