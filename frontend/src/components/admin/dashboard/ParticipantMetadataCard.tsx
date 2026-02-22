import { useState } from 'react';
import { parseUA } from '@/utils/uaParser';
import { Button } from '@/components/ui/button';
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
import {
    Monitor,
    Smartphone,
    Tablet,
    Globe,
    Fingerprint,
    Clock,
    Activity,
    CheckCircle,
    Hash,
    AlertTriangle,
    Tag,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useTranslation } from 'react-i18next';
import { formatDistanceToNow } from 'date-fns';
import { enUS, fr, fi } from 'date-fns/locale';
import { cn } from '@/lib/utils';

interface ParticipantMetadataCardProps {
    participant: {
        id: string | number;
        user_agent?: string;
        ip_address?: string;
        status: string;
        created_at: string;
        submitted_at?: string;
        duration_seconds?: number | null;
        language_used?: string;
        is_test_run?: boolean;
        is_discarded?: boolean;
        recruitment_token?: string;
    };
    className?: string;
    onToggleDiscard?: (discarded: boolean) => void;
    isDiscardPending?: boolean;
}

export function ParticipantMetadataCard({
    participant,
    className,
    onToggleDiscard,
    isDiscardPending,
}: ParticipantMetadataCardProps) {
    const { t, i18n } = useTranslation();
    const [discardDialogOpen, setDiscardDialogOpen] = useState(false);
    const uaInfo = parseUA(participant.user_agent || '');
    const isDiscarded = !!participant.is_discarded;

    // biome-ignore lint/suspicious/noExplicitAny: library locale types are complex
    const dateLocales: Record<string, any> = {
        en: enUS,
        fr: fr,
        fi: fi,
    };
    const currentLocale = dateLocales[i18n.language] || enUS;

    const DeviceIcon = {
        mobile: Smartphone,
        tablet: Tablet,
        desktop: Monitor,
    }[uaInfo.device];

    return (
        <Card
            className={cn('border-none shadow-sm bg-white rounded-2xl overflow-hidden', className)}
        >
            <CardHeader className="border-b border-slate-50 pb-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                        <Fingerprint className="h-5 w-5 text-indigo-500" />
                        <CardTitle className="text-base sm:text-lg font-black text-slate-900">
                            {t('admin.participant.metadata.title', 'Session Metadata')}
                        </CardTitle>
                    </div>

                    <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                        {onToggleDiscard && (
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setDiscardDialogOpen(true)}
                                disabled={isDiscardPending}
                                className={cn(
                                    'min-h-[44px] px-4 text-xs font-bold',
                                    isDiscarded
                                        ? 'text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50'
                                        : 'text-red-500 hover:text-red-600 hover:bg-red-50'
                                )}
                            >
                                {isDiscarded
                                    ? t('admin.data.actions.restore', 'Restore')
                                    : t('admin.data.actions.discard', 'Discard')}
                            </Button>
                        )}
                        {isDiscarded && (
                            <Badge
                                variant="outline"
                                className="bg-rose-50 text-rose-600 border-rose-200 font-black text-2xs"
                            >
                                {t('admin.data.detail.discarded_badge', 'Discarded')}
                            </Badge>
                        )}
                        {participant.is_test_run && (
                            <Badge
                                variant="outline"
                                className="bg-amber-50 text-amber-600 border-amber-100 font-black text-2xs"
                            >
                                {t('admin.participant.metadata.test_run', 'Test Run')}
                            </Badge>
                        )}
                        <Badge
                            variant="secondary"
                            className={cn(
                                'font-black text-2xs',
                                participant.status === 'completed'
                                    ? 'bg-emerald-50 text-emerald-600'
                                    : 'bg-slate-100 text-slate-500'
                            )}
                        >
                            {t(
                                `admin.participant.status.${participant.status}`,
                                participant.status
                            )}
                        </Badge>
                    </div>
                </div>
            </CardHeader>
            <CardContent className="p-3 sm:p-6 grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                {/* Tech Info */}
                <div className="space-y-4">
                    <h4 className="text-2xs font-black text-slate-400">
                        {t('admin.participant.metadata.technology', 'Technology')}
                    </h4>
                    <div className="space-y-3">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-slate-50 rounded-lg">
                                <DeviceIcon className="h-4 w-4 text-slate-500" />
                            </div>
                            <div>
                                <p className="text-xs font-black text-slate-900 leading-none">
                                    {uaInfo.os === 'Unknown'
                                        ? t('common.unknown', 'Unknown')
                                        : uaInfo.os}
                                </p>
                                <p className="text-2xs text-slate-500 font-bold mt-1">
                                    {uaInfo.device === 'desktop' &&
                                        t('admin.participant.metadata.device.desktop', 'Desktop')}
                                    {uaInfo.device === 'mobile' &&
                                        t('admin.participant.metadata.device.mobile', 'Mobile')}
                                    {uaInfo.device === 'tablet' &&
                                        t('admin.participant.metadata.device.tablet', 'Tablet')}
                                </p>
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-slate-50 rounded-lg">
                                <Globe className="h-4 w-4 text-slate-500" />
                            </div>
                            <div>
                                <p className="text-xs font-black text-slate-900 leading-none">
                                    {uaInfo.browser === 'Unknown'
                                        ? t('common.unknown', 'Unknown')
                                        : uaInfo.browser}
                                </p>
                                <p className="text-2xs text-slate-500 font-bold mt-1">
                                    {t('admin.participant.metadata.browser', 'Browser')}
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
                <div className="space-y-4">
                    <h4 className="text-2xs font-black text-slate-400">
                        {t('admin.participant.metadata.session', 'Session Details')}
                    </h4>
                    <div className="space-y-3">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-slate-50 rounded-lg">
                                <Clock className="h-4 w-4 text-slate-500" />
                            </div>
                            <div>
                                <p className="text-xs font-black text-slate-900 leading-none">
                                    {participant.duration_seconds
                                        ? participant.duration_seconds >= 3600
                                            ? t('common.duration_long', '{{h}}h {{m}}m {{s}}s', {
                                                  h: Math.floor(
                                                      participant.duration_seconds / 3600
                                                  ),
                                                  m: Math.floor(
                                                      (participant.duration_seconds % 3600) / 60
                                                  ),
                                                  s: participant.duration_seconds % 60,
                                              })
                                            : t('common.duration_short', '{{m}}m {{s}}s', {
                                                  m: Math.floor(participant.duration_seconds / 60),
                                                  s: participant.duration_seconds % 60,
                                              })
                                        : '---'}
                                </p>
                                <p className="text-2xs text-slate-500 font-bold mt-1">
                                    {t('admin.participant.metadata.duration', 'Total Duration')}
                                </p>
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-slate-50 rounded-lg">
                                <Activity className="h-4 w-4 text-slate-500" />
                            </div>
                            <div>
                                <p className="text-xs font-black text-slate-900 leading-none">
                                    {formatDistanceToNow(new Date(participant.created_at), {
                                        addSuffix: true,
                                        locale: currentLocale,
                                    })}
                                </p>
                                <p className="text-2xs text-slate-500 font-bold mt-1">
                                    {t('admin.participant.metadata.started', 'Started')}
                                </p>
                            </div>
                        </div>
                        {participant.submitted_at && (
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-slate-50 rounded-lg">
                                    <CheckCircle className="h-4 w-4 text-slate-500" />
                                </div>
                                <div>
                                    <p className="text-xs font-black text-slate-900 leading-none">
                                        {formatDistanceToNow(new Date(participant.submitted_at), {
                                            addSuffix: true,
                                            locale: currentLocale,
                                        })}
                                    </p>
                                    <p className="text-2xs text-slate-500 font-bold mt-1">
                                        {t('admin.participant.metadata.submitted', 'Submitted')}
                                    </p>
                                </div>
                            </div>
                        )}
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-slate-50 rounded-lg">
                                <Hash className="h-4 w-4 text-slate-500" />
                            </div>
                            <div>
                                <p className="text-xs font-black text-slate-900 leading-none font-mono">
                                    {participant.id}
                                </p>
                                <p className="text-2xs text-slate-500 font-bold mt-1">
                                    {t('admin.participant.metadata.id', 'Internal ID')}
                                </p>
                            </div>
                        </div>
                        {participant.recruitment_token && (
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-slate-50 rounded-lg">
                                    <Tag className="h-4 w-4 text-slate-500" />
                                </div>
                                <div>
                                    <p className="text-xs font-black text-slate-900 leading-none font-mono">
                                        {participant.recruitment_token}
                                    </p>
                                    <p className="text-2xs text-slate-500 font-bold mt-1">
                                        {t(
                                            'admin.participant.metadata.recruitment_link',
                                            'Recruitment Link'
                                        )}
                                    </p>
                                </div>
                            </div>
                        )}
                        {participant.ip_address && (
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-slate-50 rounded-lg">
                                    <Fingerprint className="h-4 w-4 text-slate-500" />
                                </div>
                                <div>
                                    <p className="text-xs font-black text-slate-900 leading-none font-mono">
                                        {participant.ip_address.substring(0, 16)}...
                                    </p>
                                    <p className="text-2xs text-slate-500 font-bold mt-1">
                                        {t('admin.participant.metadata.ip_hash', 'IP Hash')}
                                    </p>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </CardContent>

            <AlertDialog open={discardDialogOpen} onOpenChange={setDiscardDialogOpen}>
                <AlertDialogContent className="rounded-3xl border-none shadow-2xl">
                    <AlertDialogHeader>
                        <AlertDialogTitle className="text-xl font-black text-slate-900 flex items-center gap-3">
                            <div
                                className={cn(
                                    'p-2 rounded-xl',
                                    isDiscarded
                                        ? 'bg-emerald-100 text-emerald-600'
                                        : 'bg-rose-100 text-rose-600'
                                )}
                            >
                                <AlertTriangle className="w-5 h-5" />
                            </div>
                            {isDiscarded
                                ? t('admin.data.confirm_restore.title', 'Restore participant?')
                                : t('admin.data.confirm_discard.title', 'Discard participant?')}
                        </AlertDialogTitle>
                        <AlertDialogDescription className="text-slate-500 font-semibold text-base py-4">
                            {isDiscarded
                                ? t(
                                      'admin.data.confirm_restore.description',
                                      'This participant will be included in exports and analysis again.'
                                  )
                                : t(
                                      'admin.data.confirm_discard.description',
                                      'This participant will be excluded from exports and analysis. You can restore them later.'
                                  )}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter className="gap-2">
                        <AlertDialogCancel className="rounded-2xl font-bold h-12">
                            {t('common.cancel')}
                        </AlertDialogCancel>
                        <AlertDialogAction
                            onClick={() => onToggleDiscard?.(!isDiscarded)}
                            className={cn(
                                'rounded-2xl font-bold h-12',
                                isDiscarded
                                    ? 'bg-emerald-600 hover:bg-emerald-700'
                                    : 'bg-rose-600 hover:bg-rose-700'
                            )}
                        >
                            {isDiscarded
                                ? t('admin.data.actions.restore', 'Restore')
                                : t('admin.data.actions.discard', 'Discard')}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </Card>
    );
}
