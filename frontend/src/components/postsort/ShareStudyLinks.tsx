/*
 * Libre-Q - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

import type React from 'react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Link, Mail, Share2 } from 'lucide-react';
import { FaBluesky, FaFacebook, FaLinkedin, FaWhatsapp } from 'react-icons/fa6';
import { toast } from 'sonner';

interface ShareStudyLinksProps {
    studyUrl: string;
    studyTitle: string;
}

export const ShareStudyLinks: React.FC<ShareStudyLinksProps> = ({ studyUrl, studyTitle }) => {
    const { t } = useTranslation();
    const [copied, setCopied] = useState(false);

    const shareText = t('post.success.share.message', {
        title: studyTitle,
        defaultValue:
            'I just participated in this study: "{{title}}". I thought it might interest you. You can access it here:',
    });

    const encodedUrl = encodeURIComponent(studyUrl);
    const encodedTextWithUrl = encodeURIComponent(`${shareText}\n${studyUrl}`);

    const handleCopy = () => {
        navigator.clipboard.writeText(studyUrl);
        setCopied(true);
        toast.success(t('post.success.share.copy_success', 'Link copied!'));
        setTimeout(() => setCopied(false), 2000);
    };

    const canShare = typeof navigator !== 'undefined' && !!navigator.share;

    const handleNativeShare = async () => {
        try {
            await navigator.share({
                title: studyTitle,
                text: shareText,
                url: studyUrl,
            });
        } catch (err) {
            if (err instanceof Error && err.name !== 'AbortError') {
                console.warn('Share failed:', err);
            }
        }
    };

    const channels = [
        {
            key: 'email',
            icon: <Mail size={18} />,
            label: t('post.success.share.email', 'Email'),
            href: `mailto:?subject=${encodeURIComponent(
                t('post.success.share.email_subject', {
                    title: studyTitle,
                    defaultValue: 'Participate in this study: {{title}}',
                })
            )}&body=${encodedTextWithUrl}`,
        },
        {
            key: 'whatsapp',
            icon: <FaWhatsapp size={18} />,
            label: 'WhatsApp',
            href: `https://wa.me/?text=${encodedTextWithUrl}`,
        },
        {
            key: 'bluesky',
            icon: <FaBluesky size={16} />,
            label: 'Bluesky',
            href: `https://bsky.app/intent/compose?text=${encodedTextWithUrl}`,
        },
        {
            key: 'facebook',
            icon: <FaFacebook size={18} />,
            label: 'Facebook',
            href: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`,
        },
        {
            key: 'linkedin',
            icon: <FaLinkedin size={18} />,
            label: 'LinkedIn',
            href: `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`,
        },
    ];

    return (
        <div className="mt-8 pt-6 border-t border-slate-100">
            <p className="text-sm text-slate-400 mb-3">
                {t('post.success.share.title', 'Spread the word')}
            </p>
            <div className="flex items-center justify-center gap-2 flex-wrap">
                <button
                    type="button"
                    onClick={handleCopy}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full border border-slate-200 text-sm text-slate-600 hover:border-slate-300 hover:bg-slate-50 transition-colors"
                >
                    {copied ? <Check size={16} className="text-emerald-500" /> : <Link size={16} />}
                    {t('post.success.share.copy_link', 'Copy link')}
                </button>

                {channels.map((ch) => (
                    <a
                        key={ch.key}
                        href={ch.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={ch.label}
                        className="w-9 h-9 rounded-full border border-slate-200 flex items-center justify-center text-slate-500 hover:border-slate-300 hover:bg-slate-50 hover:text-slate-700 transition-colors"
                    >
                        {ch.icon}
                    </a>
                ))}

                {canShare && (
                    <button
                        type="button"
                        onClick={handleNativeShare}
                        aria-label={t('post.success.share.native', 'Share')}
                        className="w-9 h-9 rounded-full border border-slate-200 flex items-center justify-center text-slate-500 hover:border-slate-300 hover:bg-slate-50 hover:text-slate-700 transition-colors"
                    >
                        <Share2 size={16} />
                    </button>
                )}
            </div>
        </div>
    );
};
