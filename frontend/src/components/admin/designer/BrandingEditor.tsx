import { useStudyDesigner } from '@/store/useStudyDesigner';

import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Palette, Image as ImageIcon, Info, RotateCcw, Trash2, Plus } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';
import ImageUploadInput from './ImageUploadInput';
import type { PartnerLogo } from '@/api/model/partnerLogo';
import type { StudyReadBranding } from '@/api/model/studyReadBranding';
import type { StudyRead } from '@/api/model/studyRead';
import type { BrandingBase } from '@/api/model/brandingBase';

const BrandingEditor = ({ readOnly = false }: { readOnly?: boolean }) => {
    const { t } = useTranslation();
    const { draft, updateDraft } = useStudyDesigner();

    if (!draft) return null;

    // Use StudyRead type for proper casting
    const studyDraft = draft as unknown as StudyRead;
    const branding = (studyDraft.branding as StudyReadBranding) || {
        logo_url: null,
        accent_color: null,
        partners: [],
    };

    const updateBranding = <T extends keyof BrandingBase>(field: T, value: BrandingBase[T]) => {
        updateDraft((d) => {
            const draftAny = d as unknown as StudyRead;
            if (!draftAny.branding) {
                draftAny.branding = {
                    logo_url: null,
                    accent_color: null,
                    partners: [],
                };
            }
            draftAny.branding[field] = value;
        });
    };

    return (
        <div className="space-y-12 pb-12">
            <section className="space-y-6">
                <div className="flex items-center gap-3 text-slate-900 font-bold text-xl tracking-tight">
                    <div className="bg-indigo-50 p-2 rounded-xl border border-indigo-100 shadow-sm">
                        <Palette className="h-5 w-5 text-indigo-600" />
                    </div>
                    {t('admin.design.theme.title')}
                </div>

                <div className="grid gap-8">
                    {/* Accent Color Card */}
                    <Card className="border-none shadow-sm bg-white rounded-2xl overflow-hidden">
                        <CardHeader className="pb-4">
                            <div className="flex items-center gap-2">
                                <CardTitle className="text-sm font-bold">
                                    {t('admin.design.theme.accent.title')}
                                </CardTitle>
                                <TooltipProvider>
                                    <Tooltip>
                                        <TooltipTrigger>
                                            <Info className="h-3.5 w-3.5 text-slate-400 hover:text-indigo-500 transition-colors" />
                                        </TooltipTrigger>
                                        <TooltipContent side="right" className="max-w-xs">
                                            <p className="text-xs">
                                                {t('admin.design.theme.accent.desc')}
                                            </p>
                                        </TooltipContent>
                                    </Tooltip>
                                </TooltipProvider>
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <div className="flex items-center gap-6">
                                <div
                                    className="w-16 h-16 rounded-2xl border-4 border-white shadow-xl shrink-0 ring-1 ring-slate-200"
                                    style={{
                                        backgroundColor: branding.accent_color || '#4f46e5',
                                    }}
                                />
                                <div className="flex-1 space-y-3">
                                    <Label
                                        htmlFor="accent-color"
                                        className="text-[10px] font-black text-slate-500"
                                    >
                                        {t('admin.design.theme.accent.pick')}
                                    </Label>
                                    <div className="flex gap-2">
                                        <Input
                                            id="accent-color"
                                            type="color"
                                            value={branding.accent_color || '#4f46e5'}
                                            onChange={(e) =>
                                                updateBranding('accent_color', e.target.value)
                                            }
                                            disabled={readOnly}
                                            className="w-10 h-10 p-1 cursor-pointer rounded-lg border-2"
                                        />
                                        <Input
                                            type="text"
                                            name="accentColor"
                                            value={branding.accent_color || '#4f46e5'}
                                            onChange={(e) =>
                                                updateBranding('accent_color', e.target.value)
                                            }
                                            placeholder="#000000"
                                            disabled={readOnly}
                                            className="max-w-[120px] font-bold text-sm h-10 rounded-xl"
                                        />
                                        <button
                                            type="button"
                                            disabled={readOnly}
                                            onClick={() => updateBranding('accent_color', null)}
                                            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[10px] font-black text-slate-500 hover:bg-slate-100 transition-colors shadow-sm border bg-white"
                                        >
                                            <RotateCcw className="size-3" />
                                            {t('admin.design.theme.accent.reset')}
                                        </button>
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-3 sm:grid-cols-6 md:grid-cols-8 gap-2 pt-2">
                                {[
                                    '#4f46e5',
                                    '#7c3aed',
                                    '#db2777',
                                    '#dc2626',
                                    '#ea580c',
                                    '#16a34a',
                                ].map((color) => (
                                    <button
                                        key={color}
                                        type="button"
                                        className={cn(
                                            'aspect-square rounded-xl border-2 transition-all flex items-center justify-center shadow-sm',
                                            branding.accent_color === color
                                                ? 'border-indigo-600 scale-110 shadow-indigo-100'
                                                : 'border-transparent hover:border-slate-300'
                                        )}
                                        style={{ backgroundColor: color }}
                                        disabled={readOnly}
                                        onClick={() => updateBranding('accent_color', color)}
                                    >
                                        {branding.accent_color === color && (
                                            <div className="w-2 h-2 bg-white rounded-full shadow-inner" />
                                        )}
                                    </button>
                                ))}
                            </div>
                        </CardContent>
                    </Card>

                    {/* Logo Card */}
                    <Card className="border-none shadow-sm bg-white rounded-2xl overflow-hidden">
                        <CardHeader className="pb-4">
                            <div className="flex items-center gap-2">
                                <CardTitle className="text-sm font-bold flex items-center gap-2">
                                    <ImageIcon className="h-4 w-4 text-indigo-500" />
                                    {t('admin.design.theme.logo.title')}
                                </CardTitle>
                                <TooltipProvider>
                                    <Tooltip>
                                        <TooltipTrigger>
                                            <Info className="h-3.5 w-3.5 text-slate-400" />
                                        </TooltipTrigger>
                                        <TooltipContent side="right">
                                            <p className="text-xs">
                                                {t('admin.design.theme.logo.desc')}
                                            </p>
                                        </TooltipContent>
                                    </Tooltip>
                                </TooltipProvider>
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <ImageUploadInput
                                id="logo-url"
                                name="logoUrl"
                                value={branding.logo_url || ''}
                                onChange={(value) => updateBranding('logo_url', value)}
                                label={t('admin.design.theme.logo.label')}
                                recommendedSize="200x50px"
                                maxFileSize={500 * 1024}
                            />

                            <div className="bg-blue-50/50 border border-blue-100 rounded-xl p-4 text-sm text-blue-900">
                                <div className="flex gap-3">
                                    <div className="bg-blue-100 p-1.5 rounded-lg h-fit">
                                        <Info className="h-4 w-4 text-blue-600" />
                                    </div>
                                    <div>
                                        <p className="font-bold mb-1 text-blue-900">
                                            {t(
                                                'admin.design.theme.logo.help_title',
                                                'Where does this logo appear?'
                                            )}
                                        </p>
                                        <p className="text-blue-800/80 text-xs leading-relaxed font-medium">
                                            {t(
                                                'admin.design.theme.logo.help_desc',
                                                'The logo is displayed at the top of every study page and on the welcome page.'
                                            )}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Institutional Partners Section */}
                    <Card className="border-none shadow-sm bg-white rounded-2xl overflow-hidden">
                        <CardHeader className="pb-4">
                            <div className="flex items-center gap-2">
                                <CardTitle className="text-sm font-bold flex items-center gap-2">
                                    <ImageIcon className="h-4 w-4 text-indigo-500" />
                                    {t(
                                        'admin.design.theme.partners.title',
                                        'Institutional Partners'
                                    )}
                                </CardTitle>
                                <TooltipProvider>
                                    <Tooltip>
                                        <TooltipTrigger>
                                            <Info className="h-3.5 w-3.5 text-slate-400" />
                                        </TooltipTrigger>
                                        <TooltipContent side="right">
                                            <p className="text-xs">
                                                {t(
                                                    'admin.design.theme.partners.desc',
                                                    'Add logos of universities, labs, or funders supporting this study.'
                                                )}
                                            </p>
                                        </TooltipContent>
                                    </Tooltip>
                                </TooltipProvider>
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <div className="grid gap-4">
                                {(branding.partners || []).map(
                                    (partner: PartnerLogo, index: number) => (
                                        <div
                                            key={partner.id || index}
                                            className="flex flex-col sm:flex-row gap-3 sm:gap-4 items-start p-3 sm:p-4 bg-slate-50/50 rounded-2xl border border-slate-200/60 group transition-all hover:bg-white hover:shadow-md"
                                        >
                                            <div className="w-14 h-14 bg-white rounded-xl flex items-center justify-center p-1.5 border border-slate-100 shrink-0 shadow-sm">
                                                {partner.logo_url ? (
                                                    <img
                                                        src={partner.logo_url}
                                                        alt={partner.name}
                                                        className="max-w-full max-h-full object-contain"
                                                    />
                                                ) : (
                                                    <ImageIcon className="text-slate-300 w-6 h-6" />
                                                )}
                                            </div>
                                            <div className="flex-1 space-y-3">
                                                <div className="grid gap-1.5">
                                                    <Label className="text-[10px] font-black text-slate-400">
                                                        {t(
                                                            'admin.design.theme.partners.name_placeholder',
                                                            'Name'
                                                        )}
                                                    </Label>
                                                    <Input
                                                        name="partnerName"
                                                        value={partner.name}
                                                        onChange={(e) => {
                                                            const newPartners = [
                                                                ...(branding.partners || []),
                                                            ];
                                                            newPartners[index] = {
                                                                ...partner,
                                                                name: e.target.value,
                                                            };
                                                            updateBranding('partners', newPartners);
                                                        }}
                                                        placeholder="Institution Name"
                                                        disabled={readOnly}
                                                        className="h-9 text-sm font-bold rounded-xl"
                                                    />
                                                </div>
                                                <ImageUploadInput
                                                    name="partnerLogoUrl"
                                                    value={partner.logo_url}
                                                    onChange={(value) => {
                                                        const newPartners = [
                                                            ...(branding.partners || []),
                                                        ];
                                                        newPartners[index] = {
                                                            ...partner,
                                                            logo_url: value,
                                                        };
                                                        updateBranding('partners', newPartners);
                                                    }}
                                                    recommendedSize="120x40px"
                                                    maxFileSize={300 * 1024}
                                                />
                                            </div>
                                            <button
                                                type="button"
                                                disabled={readOnly}
                                                onClick={() => {
                                                    const newPartners = (
                                                        branding.partners || []
                                                    ).filter((_, i) => i !== index);
                                                    updateBranding('partners', newPartners);
                                                }}
                                                className="text-slate-300 hover:text-red-500 p-2 transition-colors bg-white rounded-xl shadow-sm border border-slate-100 hover:border-red-100"
                                            >
                                                <Trash2 className="size-4" />
                                            </button>
                                        </div>
                                    )
                                )}

                                <button
                                    type="button"
                                    onClick={() => {
                                        const newPartners = [
                                            ...(branding.partners || []),
                                            {
                                                id: crypto.randomUUID(),
                                                name: '',
                                                logo_url: '',
                                                url: '',
                                            },
                                        ];
                                        updateBranding('partners', newPartners);
                                    }}
                                    disabled={readOnly}
                                    className="w-full flex items-center justify-center gap-2 py-4 border-2 border-dashed border-slate-200 rounded-2xl text-slate-500 hover:text-indigo-600 hover:border-indigo-300 hover:bg-indigo-50/50 transition-all font-bold text-sm disabled:opacity-50"
                                >
                                    <Plus className="size-4" />
                                    {t('admin.design.theme.partners.add', 'Add Partner')}
                                </button>
                            </div>

                            <div className="bg-indigo-50/50 border border-indigo-100 rounded-xl p-4 text-sm text-indigo-900 mt-4">
                                <div className="flex gap-3">
                                    <div className="bg-indigo-100 p-1.5 rounded-lg h-fit">
                                        <Palette className="h-4 w-4 text-indigo-600" />
                                    </div>
                                    <div>
                                        <p className="font-bold mb-1 text-indigo-900">
                                            {t(
                                                'admin.design.theme.partners.help_title',
                                                'Credibility & Trust'
                                            )}
                                        </p>
                                        <p className="text-indigo-800/80 text-xs leading-relaxed font-medium">
                                            {t(
                                                'admin.design.theme.partners.help_desc',
                                                'Partner logos are prominently displayed on the study home page.'
                                            )}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </section>
        </div>
    );
};

export default BrandingEditor;
