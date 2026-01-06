import { useStudyDesigner } from '@/store/useStudyDesigner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Palette, Image as ImageIcon, Info } from 'lucide-react';

const BrandingEditor = () => {
    const { draft, updateDraft } = useStudyDesigner();

    if (!draft) return null;

    // biome-ignore lint/suspicious/noExplicitAny: branding missing in generated type
    const branding = (draft as any).branding || { logo_url: null, accent_color: null };

    const updateBranding = (field: 'logo_url' | 'accent_color', value: string | null) => {
        updateDraft((d) => {
            // biome-ignore lint/suspicious/noExplicitAny: branding missing in generated type
            if (!(d as any).branding) (d as any).branding = { logo_url: null, accent_color: null };
            (d as any).branding[field] = value;
        });
    };

    return (
        <div className="space-y-6">
            <section className="space-y-4">
                <div className="flex items-center gap-2 text-primary font-semibold text-lg">
                    <span className="bg-primary/10 p-1 rounded">
                        <Palette className="h-5 w-5" />
                    </span>
                    Visual branding
                </div>

                <Card>
                    <CardHeader>
                        <CardTitle className="text-sm font-semibold">Accent color</CardTitle>
                        <CardDescription>
                            This color will be used for buttons, links, and highlights throughout
                            the study.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="flex items-center gap-4">
                            <div
                                className="w-12 h-12 rounded-lg border shadow-sm shrink-0"
                                style={{ backgroundColor: branding.accent_color || '#2563eb' }}
                            />
                            <div className="flex-1 space-y-2">
                                <Label htmlFor="accent-color">Pick a color</Label>
                                <div className="flex gap-2">
                                    <Input
                                        id="accent-color"
                                        type="color"
                                        value={branding.accent_color || '#2563eb'}
                                        onChange={(e) =>
                                            updateBranding('accent_color', e.target.value)
                                        }
                                        className="w-12 h-9 p-1 cursor-pointer"
                                    />
                                    <Input
                                        type="text"
                                        value={branding.accent_color || '#2563eb'}
                                        onChange={(e) =>
                                            updateBranding('accent_color', e.target.value)
                                        }
                                        placeholder="#000000"
                                        className="max-w-[120px] font-mono text-sm"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => updateBranding('accent_color', null)}
                                        className="text-[10px] text-muted-foreground hover:text-foreground underline"
                                    >
                                        Reset to default
                                    </button>
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-6 gap-2 pt-2">
                            {['#2563eb', '#7c3aed', '#db2777', '#dc2626', '#ea580c', '#16a34a'].map(
                                (color) => (
                                    <button
                                        key={color}
                                        type="button"
                                        className="aspect-square rounded-full border-2 border-transparent hover:border-slate-300 transition-all flex items-center justify-center"
                                        style={{ backgroundColor: color }}
                                        onClick={() => updateBranding('accent_color', color)}
                                    >
                                        {branding.accent_color === color && (
                                            <div className="w-1.5 h-1.5 bg-white rounded-full" />
                                        )}
                                    </button>
                                )
                            )}
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className="text-sm font-semibold flex items-center gap-2">
                            <ImageIcon className="h-4 w-4" />
                            Study logo
                        </CardTitle>
                        <CardDescription>
                            Upload a custom logo to replace the default Open-Q branding.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid gap-2">
                            <Label htmlFor="logo-url">Logo URL</Label>
                            <Input
                                id="logo-url"
                                value={branding.logo_url || ''}
                                onChange={(e) => updateBranding('logo_url', e.target.value)}
                                placeholder="https://example.com/logo.png"
                            />
                            <p className="text-[10px] text-muted-foreground">
                                Recommended size: 200x50px. Supports PNG, SVG, JPG.
                            </p>
                        </div>

                        {branding.logo_url && (
                            <div className="p-4 bg-muted/20 border rounded-lg flex items-center justify-center">
                                <img
                                    src={branding.logo_url}
                                    alt="Logo preview"
                                    className="max-h-12 object-contain"
                                    onError={(e) => {
                                        (e.target as HTMLImageElement).style.display = 'none';
                                    }}
                                />
                            </div>
                        )}
                    </CardContent>
                </Card>
            </section>

            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-900">
                <div className="flex gap-2">
                    <Info className="h-4 w-4 mt-0.5 flex-shrink-0" />
                    <div>
                        <p className="font-medium mb-1">Branding tip</p>
                        <p className="text-amber-800">
                            Ensuring high accessibility is key. When picking an accent color, make
                            sure it has enough contrast against white backgrounds for readability.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default BrandingEditor;
