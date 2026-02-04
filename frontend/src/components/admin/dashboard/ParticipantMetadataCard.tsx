import { parseUA } from '@/utils/uaParser';
import { Button } from '@/components/ui/button';
import {
    Monitor,
    Smartphone,
    Tablet,
    Globe,
    Fingerprint,
    Clock,
    Activity,
    Shield,
    Hash,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useTranslation } from 'react-i18next';
import { formatDistanceToNow } from 'date-fns';
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
    const { t } = useTranslation();
    const uaInfo = parseUA(participant.user_agent || '');

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
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Fingerprint className="h-5 w-5 text-indigo-500" />
                        <CardTitle className="text-lg font-black text-slate-900">
                            {t('admin.participant.metadata.title', 'Session Metadata')}
                        </CardTitle>
                    </div>

                    <div className="flex items-center gap-2">
                        {onToggleDiscard && (
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() =>
                                    onToggleDiscard(
                                        !participant.status.includes('discarded') &&
                                            participant.status !== 'discarded'
                                    )
                                } // Simple check, ideally check is_discarded but status usually reflects it
                                disabled={isDiscardPending}
                                className={cn(
                                    'h-6 px-2 text-[10px] font-bold uppercase tracking-wider',
                                    participant.status === 'discarded'
                                        ? 'text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50'
                                        : 'text-red-500 hover:text-red-600 hover:bg-red-50'
                                )}
                            >
                                {participant.status === 'discarded'
                                    ? t('admin.data.actions.restore', 'Restore')
                                    : t('admin.data.actions.discard', 'Discard')}
                            </Button>
                        )}
                        {participant.is_test_run && (
                            <Badge
                                variant="outline"
                                className="bg-amber-50 text-amber-600 border-amber-100 font-black uppercase text-[10px]"
                            >
                                {t('admin.participant.metadata.test_run', 'Test Run')}
                            </Badge>
                        )}
                        <Badge
                            variant="secondary"
                            className={cn(
                                'font-black uppercase text-[10px]',
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
            <CardContent className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Tech Info */}
                <div className="space-y-4">
                    <h4 className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                        {t('admin.participant.metadata.technology', 'Technology')}
                    </h4>
                    <div className="space-y-3">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-slate-50 rounded-lg">
                                <DeviceIcon className="h-4 w-4 text-slate-500" />
                            </div>
                            <div>
                                <p className="text-xs font-black text-slate-900 leading-none">
                                    {uaInfo.os}
                                </p>
                                <p className="text-[10px] text-slate-500 uppercase font-bold mt-1">
                                    {t(
                                        `admin.participant.metadata.device.${uaInfo.device}`,
                                        uaInfo.device
                                    )}
                                </p>
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-slate-50 rounded-lg">
                                <Globe className="h-4 w-4 text-slate-500" />
                            </div>
                            <div>
                                <p className="text-xs font-black text-slate-900 leading-none">
                                    {uaInfo.browser}
                                </p>
                                <p className="text-[10px] text-slate-500 uppercase font-bold mt-1">
                                    {t('admin.participant.metadata.browser', 'Browser')}
                                </p>
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-slate-50 rounded-lg">
                                <Shield className="h-4 w-4 text-slate-500" />
                            </div>
                            <div>
                                <p className="text-xs font-black text-slate-900 leading-none">
                                    participant.ip_address || '---'
                                </p>
                                <p className="text-[10px] text-slate-500 uppercase font-bold mt-1">
                                    t('admin.participant.metadata.ip_address', 'IP Address')
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
                <div className="space-y-4">
                    <h4 className="text-[10px] font-black uppercase tracking-wider text-slate-400">
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
                                        ? `${Math.floor(participant.duration_seconds / 60)}m ${participant.duration_seconds % 60}s`
                                        : '---'}
                                </p>
                                <p className="text-[10px] text-slate-500 uppercase font-bold mt-1">
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
                                    })}
                                </p>
                                <p className="text-[10px] text-slate-500 uppercase font-bold mt-1">
                                    {t('admin.participant.metadata.started', 'Started')}
                                </p>
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-slate-50 rounded-lg">
                                <Hash className="h-4 w-4 text-slate-500" />
                            </div>
                            <div>
                                <p className="text-xs font-black text-slate-900 leading-none font-mono">
                                    {participant.id}
                                </p>
                                <p className="text-[10px] text-slate-500 uppercase font-bold mt-1">
                                    {t('admin.participant.metadata.id', 'Internal ID')}
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
