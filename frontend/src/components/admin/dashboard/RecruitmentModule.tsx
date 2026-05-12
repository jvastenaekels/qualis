import type React from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Copy, QrCode, ExternalLink, Check, Megaphone } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { QRCodeCanvas } from 'qrcode.react';
import { useTranslation } from 'react-i18next';
import { Download } from 'lucide-react';

interface RecruitmentModuleProps {
    slug: string;
}

const RecruitmentModule: React.FC<RecruitmentModuleProps> = ({ slug }) => {
    const { t } = useTranslation();
    const [copied, setCopied] = useState(false);
    const [showQR, setShowQR] = useState(false);

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

    const handleDownloadQR = () => {
        const canvas = document.getElementById('study-qr-code') as HTMLCanvasElement;
        if (canvas) {
            const pngUrl = canvas.toDataURL('image/png').replace('image/png', 'image/octet-stream');
            const downloadLink = document.createElement('a');
            downloadLink.href = pngUrl;
            downloadLink.download = `qr-code-${slug}.png`;
            document.body.appendChild(downloadLink);
            downloadLink.click();
            document.body.removeChild(downloadLink);
        }
    };

    return (
        <Card
            data-testid="recruitment-module"
            className="shadow-md border-none bg-white overflow-hidden h-fit min-w-0"
        >
            <CardHeader className="border-b border-slate-50 bg-slate-50/30">
                <div className="flex items-center gap-2 mb-1">
                    <Megaphone className="h-5 w-5 text-indigo-500" />
                    <CardTitle className="text-lg font-black">
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
            <CardContent className="p-4 space-y-4">
                <div className="space-y-2">
                    <label htmlFor="public-url" className="text-2xs font-bold text-slate-400">
                        {t('admin.recruitment.public_url_label', 'Public Participation URL')}
                    </label>
                    <div className="flex gap-2 min-w-0">
                        <Input
                            id="public-url"
                            readOnly
                            value={publicUrl}
                            className="min-w-0 bg-slate-50 border-slate-100 text-xs text-slate-500 font-mono focus-visible:ring-indigo-500"
                        />
                        <Button
                            variant="outline"
                            size="icon"
                            onClick={handleCopy}
                            className="bg-white border-slate-200 hover:border-indigo-300 hover:text-indigo-600 shrink-0"
                            aria-label={
                                copied
                                    ? t('admin.recruitment.copied', 'Copied')
                                    : t('admin.recruitment.copy_url', 'Copy URL')
                            }
                        >
                            {copied ? (
                                <Check className="h-4 w-4 text-emerald-500" />
                            ) : (
                                <Copy className="h-4 w-4" />
                            )}
                        </Button>
                    </div>
                </div>

                <div
                    data-testid="recruitment-actions"
                    className="grid grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-3 lg:grid-cols-1 xl:grid-cols-2"
                >
                    <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setShowQR(!showQR)}
                        className="w-full min-w-0 h-auto min-h-8 whitespace-normal text-center leading-tight gap-2 bg-slate-100 text-slate-700 hover:bg-slate-200 border-none font-bold"
                    >
                        <QrCode className="h-4 w-4 shrink-0" />
                        <span className="min-w-0 break-words">
                            {showQR
                                ? t('admin.recruitment.hide_qr', 'Hide QR')
                                : t('admin.recruitment.show_qr', 'Show QR')}
                        </span>
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={handleOpen}
                        className="w-full min-w-0 h-auto min-h-8 whitespace-normal text-center leading-tight gap-2 border-slate-200 hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-600 font-bold"
                    >
                        <ExternalLink className="h-4 w-4 shrink-0" />
                        <span className="min-w-0 break-words">
                            {t('admin.recruitment.live_study', 'Live Study')}
                        </span>
                    </Button>
                </div>

                {showQR && (
                    <div className="pt-4 border-t border-slate-50 flex flex-col items-center animate-in fade-in slide-in-from-top-2 duration-300">
                        <div className="p-4 bg-white border border-slate-100 rounded-2xl shadow-sm mb-4">
                            <QRCodeCanvas
                                id="study-qr-code"
                                value={publicUrl}
                                size={150}
                                level="H"
                                includeMargin={false}
                                imageSettings={{
                                    src: '/icon-192.png',
                                    x: undefined,
                                    y: undefined,
                                    height: 30,
                                    width: 30,
                                    excavate: true,
                                }}
                            />
                        </div>

                        <div className="w-full flex flex-col gap-3 items-center">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={handleDownloadQR}
                                className="w-full min-w-0 h-auto min-h-8 whitespace-normal text-center leading-tight gap-2 border-slate-200 hover:bg-slate-50 text-slate-600 font-bold rounded-xl"
                            >
                                <Download className="h-3.5 w-3.5 shrink-0" />
                                <span className="min-w-0 break-words">
                                    {t('admin.recruitment.download_qr', 'Download Image')}
                                </span>
                            </Button>

                            <p className="text-xs text-slate-400 text-center leading-relaxed max-w-[200px]">
                                {t(
                                    'admin.recruitment.qr_print_hint',
                                    'Scan or print this code for physical recruitment materials (flyers, posters).'
                                )}
                            </p>
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    );
};

export default RecruitmentModule;
