import type React from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Copy, QrCode, ExternalLink, Check, Megaphone } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { QRCodeSVG } from 'qrcode.react';
import { useTranslation } from 'react-i18next';

interface RecruitmentModuleProps {
    slug: string;
}

const RecruitmentModule: React.FC<RecruitmentModuleProps> = ({ slug }) => {
    const { t } = useTranslation();
    const [copied, setCopied] = useState(false);
    const [showQR, setShowQR] = useState(true);

    // Construct the public study URL
    const publicUrl = `${window.location.origin}/study/${slug}`;

    const handleCopy = () => {
        navigator.clipboard.writeText(publicUrl);
        setCopied(true);
        toast.success(t('admin.recruitment.copy_success', 'Study link copied to clipboard'));
        setTimeout(() => setCopied(false), 2000);
    };

    const handleOpen = () => {
        window.open(publicUrl, '_blank');
    };

    return (
        <Card className="col-span-12 md:col-span-4 shadow-md border-none bg-white overflow-hidden h-fit">
            <CardHeader className="border-b border-slate-50 bg-slate-50/30">
                <div className="flex items-center gap-2 mb-1">
                    <Megaphone className="h-5 w-5 text-indigo-500" />
                    <CardTitle className="text-lg">
                        {t('admin.recruitment.share_title', 'Share study')}
                    </CardTitle>
                </div>
                <CardDescription>
                    {t(
                        'admin.recruitment.share_desc',
                        'Distribute your study URL to invite participants.'
                    )}
                </CardDescription>
            </CardHeader>
            <CardContent className="p-6 space-y-6">
                <div className="space-y-2">
                    <label
                        htmlFor="public-url"
                        className="text-[10px] font-bold text-slate-400 uppercase tracking-wider"
                    >
                        {t('admin.recruitment.public_url_label', 'Public Participation URL')}
                    </label>
                    <div className="flex gap-2">
                        <Input
                            id="public-url"
                            readOnly
                            value={publicUrl}
                            className="bg-slate-50 border-slate-100 text-xs text-slate-500 font-mono focus-visible:ring-indigo-500"
                        />
                        <Button
                            variant="outline"
                            size="icon"
                            onClick={handleCopy}
                            className="bg-white border-slate-200 hover:border-indigo-300 hover:text-indigo-600 shrink-0"
                        >
                            {copied ? (
                                <Check className="h-4 w-4 text-emerald-500" />
                            ) : (
                                <Copy className="h-4 w-4" />
                            )}
                        </Button>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                    <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setShowQR(!showQR)}
                        className="w-full gap-2 bg-slate-100 text-slate-700 hover:bg-slate-200 border-none font-bold"
                    >
                        <QrCode className="h-4 w-4" />
                        {showQR
                            ? t('admin.recruitment.hide_qr', 'Hide QR')
                            : t('admin.recruitment.show_qr', 'Show QR')}
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={handleOpen}
                        className="w-full gap-2 border-slate-200 hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-600 font-bold"
                    >
                        <ExternalLink className="h-4 w-4" />
                        {t('admin.recruitment.live_study', 'Live Study')}
                    </Button>
                </div>

                {showQR && (
                    <div className="pt-4 border-t border-slate-50 flex flex-col items-center animate-in fade-in slide-in-from-top-2 duration-300">
                        <div className="p-4 bg-white border border-slate-100 rounded-2xl shadow-sm mb-4">
                            <QRCodeSVG
                                value={publicUrl}
                                size={150}
                                level="H"
                                includeMargin={false}
                                imageSettings={{
                                    src: '/favicon.svg',
                                    x: undefined,
                                    y: undefined,
                                    height: 30,
                                    width: 30,
                                    excavate: true,
                                }}
                            />
                        </div>
                        <p className="text-[11px] text-slate-400 text-center leading-relaxed max-w-[200px]">
                            {t(
                                'admin.recruitment.qr_print_hint',
                                'Scan or print this code for physical recruitment materials (flyers, posters).'
                            )}
                        </p>
                    </div>
                )}
            </CardContent>
        </Card>
    );
};

export default RecruitmentModule;
