/*
 * Qualis - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

/**
 * useRecruitmentPage hook
 *
 * Encapsulates the durable state-and-effect logic for the Access &
 * Recruitment admin page. RecruitmentPage receives this hook's return value
 * and renders JSX from it.
 *
 * Logic that moves here:
 * - Route param parsing (studySlug, projectSlug)
 * - useLoaderData parsing (links, study)
 * - Slug + access-rules forms (react-hook-form + zod)
 * - Reset effects when the loader's `study` changes
 * - Create-link modal state + dependent field reset on close
 * - createLink / revokeLink mutations
 * - Slug submit (with workspace-aware navigation when slug changes)
 * - Access-rules submit (with query invalidation + revalidation)
 * - Copy-to-clipboard helper + URL builders
 *
 * Visual-only state that stays in the component:
 * - Per-row QR code Dialog open state (Radix UI internal)
 * - Top-level study URL QR code Dialog open state (Radix UI internal)
 */

import { useCallback, useEffect, useState } from 'react';
import {
    type NavigateFunction,
    useLoaderData,
    useNavigate,
    useParams,
    useRevalidator,
} from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { useForm, type UseFormReturn } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { toast } from 'sonner';

import {
    getGetStudyApiAdminStudiesSlugGetQueryKey,
    getListStudiesApiAdminStudiesGetQueryKey,
    useCreateRecruitmentLinksApiAdminRecruitmentSlugLinksPost,
    useRevokeRecruitmentLinkApiAdminRecruitmentLinksLinkIdDelete,
} from '@/api/generated';
import type { RecruitmentLinkRead, RecruitmentLinkType, StudyRead, StudyUpdate } from '@/api/model';
import { AdminService } from '@/api/admin';
import { parseApiErrorSync } from '@/lib/error-utils';
import { useAdminContext } from '@/hooks/useAdminContext';
import { buildAccessRulesUpdate } from './useRecruitmentPage.helpers';

// ────────────────────────────────────────────────────────────────
// Schemas
// ────────────────────────────────────────────────────────────────

export const slugFormSchema = z.object({
    slug: z
        .string()
        .min(3)
        .max(100)
        .regex(/^[a-z0-9-]+$/, 'Slug must be lowercase alphanumeric with hyphens'),
});

export type SlugFormValues = z.infer<typeof slugFormSchema>;

export const accessRulesSchema = z.object({
    passwordEnabled: z.boolean(),
    accessPassword: z.string().optional().or(z.literal('')),
    startDate: z.string().optional().or(z.literal('')),
    endDate: z.string().optional().or(z.literal('')),
});

export type AccessRulesValues = z.infer<typeof accessRulesSchema>;

// ────────────────────────────────────────────────────────────────
// Pure helpers
// ────────────────────────────────────────────────────────────────

export function toLocalDatetimeString(iso: string): string {
    const date = new Date(iso);
    const offset = date.getTimezoneOffset();
    const local = new Date(date.getTime() - offset * 60000);
    return local.toISOString().slice(0, 16);
}

interface RecruitmentLoaderData {
    links: RecruitmentLinkRead[];
    study: StudyRead;
    slug: string;
}

// ────────────────────────────────────────────────────────────────
// Public API surface
// ────────────────────────────────────────────────────────────────

export interface RecruitmentPageApi {
    // Route / navigation
    slug: string | undefined;
    navigate: NavigateFunction;

    // Loader-derived data
    study: StudyRead;
    links: RecruitmentLinkRead[];

    // Derived flags
    isSlugLocked: boolean;
    isArchived: boolean;
    studyUrl: string;

    // Forms
    slugForm: UseFormReturn<SlugFormValues>;
    accessForm: UseFormReturn<AccessRulesValues>;
    passwordEnabled: boolean;
    showWindowPickers: boolean;
    setShowWindowPickers: (value: boolean) => void;
    onSlugSubmit: (data: SlugFormValues) => Promise<void>;
    onAccessRulesSubmit: (data: AccessRulesValues) => Promise<void>;

    // Create-link modal state
    isCreateModalOpen: boolean;
    setIsCreateModalOpen: (open: boolean) => void;
    handleCreateModalOpenChange: (open: boolean) => void;
    newLinkType: RecruitmentLinkType;
    setNewLinkType: (value: RecruitmentLinkType) => void;
    newLinkCount: number;
    setNewLinkCount: (value: number) => void;
    newLinkName: string;
    setNewLinkName: (value: string) => void;

    // Mutation state
    isCreatingLink: boolean;
    isRevokingLink: boolean;

    // Handlers
    handleCreate: () => void;
    handleRevoke: (linkId: number) => void;
    copyToClipboard: (text: string) => void;
    getFullUrl: (token: string) => string;
}

// ────────────────────────────────────────────────────────────────
// Hook
// ────────────────────────────────────────────────────────────────

export function useRecruitmentPage(): RecruitmentPageApi {
    const { studySlug: slug, projectSlug } = useParams<{
        studySlug: string;
        projectSlug: string;
    }>();
    const { links, study } = useLoaderData() as RecruitmentLoaderData;
    const { t } = useTranslation();
    const revalidator = useRevalidator();
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const { project: currentWorkspace } = useAdminContext();

    const isSlugLocked = study.state !== 'draft';
    const isArchived = study.state === 'archived';
    const studyUrl = `${window.location.origin}/study/${slug}`;

    // ── Slug form ────────────────────────────────────────────────
    const slugForm = useForm<SlugFormValues>({
        resolver: zodResolver(slugFormSchema),
        defaultValues: { slug: study?.slug || '' },
    });

    useEffect(() => {
        if (study) {
            slugForm.reset({ slug: study.slug || '' });
        }
    }, [study, slugForm]);

    // ── Access-rules form ────────────────────────────────────────
    const accessForm = useForm<AccessRulesValues>({
        resolver: zodResolver(accessRulesSchema),
        defaultValues: {
            passwordEnabled: study.requires_password ?? false,
            accessPassword: '',
            startDate: study.start_date ? toLocalDatetimeString(study.start_date) : '',
            endDate: study.end_date ? toLocalDatetimeString(study.end_date) : '',
        },
    });

    // The "Limit collection window" toggle is a UI affordance, not a form
    // field: it expands the date pickers without polluting the API payload
    // or the form's dirty state. Initial value follows the persisted dates.
    const [showWindowPickers, setShowWindowPickers] = useState(
        !!study.start_date || !!study.end_date
    );

    useEffect(() => {
        if (study) {
            accessForm.reset({
                passwordEnabled: study.requires_password ?? false,
                accessPassword: '',
                startDate: study.start_date ? toLocalDatetimeString(study.start_date) : '',
                endDate: study.end_date ? toLocalDatetimeString(study.end_date) : '',
            });
            setShowWindowPickers(!!study.start_date || !!study.end_date);
        }
    }, [study, accessForm]);

    const passwordEnabled = accessForm.watch('passwordEnabled');

    // ── Create-link modal state ──────────────────────────────────
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [newLinkType, setNewLinkType] = useState<RecruitmentLinkType>('public');
    const [newLinkCount, setNewLinkCount] = useState(1);
    const [newLinkName, setNewLinkName] = useState('');

    const handleCreateModalOpenChange = useCallback((open: boolean) => {
        setIsCreateModalOpen(open);
        if (!open) {
            setNewLinkType('public');
            setNewLinkCount(1);
            setNewLinkName('');
        }
    }, []);

    // ── Mutations ────────────────────────────────────────────────
    const createMutation = useCreateRecruitmentLinksApiAdminRecruitmentSlugLinksPost({
        mutation: {
            onSuccess: () => {
                toast.success(
                    t('admin.recruitment.toasts.created', 'Recruitment links created successfully')
                );
                setIsCreateModalOpen(false);
                revalidator.revalidate();
                setNewLinkName('');
                setNewLinkCount(1);
            },
            onError: () => {
                toast.error(
                    t(
                        'admin.recruitment.toasts.failed',
                        'Could not create recruitment links. Check the inputs and try again.'
                    )
                );
            },
        },
    });

    const revokeMutation = useRevokeRecruitmentLinkApiAdminRecruitmentLinksLinkIdDelete({
        mutation: {
            onSuccess: () => {
                toast.success(t('admin.recruitment.toasts.revoked', 'Link revoked'));
                revalidator.revalidate();
            },
            onError: () => {
                toast.error(
                    t(
                        'admin.recruitment.toasts.revoke_failed',
                        'Could not revoke this link. It may already be in use.'
                    )
                );
            },
        },
    });

    // ── Handlers ─────────────────────────────────────────────────
    const handleCreate = useCallback(() => {
        if (!slug) return;
        // The single numeric input (newLinkCount) means different things per type:
        //  - individual: how many one-shot links to generate (count=N, capacity=1)
        //  - limited:    submission cap for ONE link        (count=1, capacity=N)
        //  - public:     one uncapped link                  (count=1, capacity=∞)
        // Mapping it explicitly per type avoids the bug where a "limited" link
        // capped at N produced N *unlimited* links, and guards against a stale
        // newLinkCount leaking into the public/limited count.
        const count = newLinkType === 'individual' ? newLinkCount : 1;
        const capacity =
            newLinkType === 'individual' ? 1 : newLinkType === 'limited' ? newLinkCount : undefined; // public → uncapped
        createMutation.mutate({
            slug,
            params: { count },
            data: {
                type: newLinkType,
                name: newLinkName || undefined,
                capacity,
            },
        });
    }, [slug, newLinkCount, newLinkType, newLinkName, createMutation]);

    const handleRevoke = useCallback(
        (linkId: number) => {
            revokeMutation.mutate({ linkId });
        },
        [revokeMutation]
    );

    const copyToClipboard = useCallback(
        (text: string) => {
            navigator.clipboard.writeText(text);
            toast.success(t('admin.recruitment.toasts.copied', 'Copied to clipboard'));
        },
        [t]
    );

    const getFullUrl = useCallback(
        (token: string) => `${window.location.origin}/study/${slug}?token=${token}`,
        [slug]
    );

    // ── Submit handlers ─────────────────────────────────────────
    const onSlugSubmit = useCallback(
        async (data: SlugFormValues) => {
            if (!slug) return;
            try {
                await AdminService.updateStudy(slug, {
                    slug: data.slug,
                } as unknown as StudyUpdate);

                toast.success(t('admin.settings.save_success', 'Settings updated'), {
                    description: t(
                        'admin.settings.save_success_desc',
                        'Study settings have been saved.'
                    ),
                });

                await queryClient.invalidateQueries({
                    queryKey: getListStudiesApiAdminStudiesGetQueryKey(),
                });
                await queryClient.invalidateQueries({
                    queryKey: getGetStudyApiAdminStudiesSlugGetQueryKey(slug),
                });

                if (data.slug !== slug) {
                    const ws = projectSlug || currentWorkspace?.slug;
                    navigate(`/app/${ws}/studies/${data.slug}/recruitment`);
                } else {
                    navigate('.', { replace: true });
                }
            } catch (error) {
                const message = parseApiErrorSync(
                    error,
                    t(
                        'admin.settings.save_error',
                        'Could not save settings. Verify the values and try again.'
                    )
                );
                toast.error(
                    t(
                        'admin.settings.save_error',
                        'Could not save settings. Verify the values and try again.'
                    ),
                    {
                        description: message,
                    }
                );
            }
        },
        [slug, projectSlug, currentWorkspace?.slug, navigate, queryClient, t]
    );

    const onAccessRulesSubmit = useCallback(
        async (data: AccessRulesValues) => {
            if (!slug) return;
            try {
                const update = buildAccessRulesUpdate(data, { isSlugLocked });
                await AdminService.updateStudy(slug, update as unknown as StudyUpdate);

                toast.success(
                    t('admin.recruitment.access_rules.save_success', 'Access rules updated')
                );

                await queryClient.invalidateQueries({
                    queryKey: getGetStudyApiAdminStudiesSlugGetQueryKey(slug),
                });
                revalidator.revalidate();
            } catch (error) {
                const message = parseApiErrorSync(
                    error,
                    t('admin.recruitment.access_rules.save_error', 'Failed to update access rules')
                );
                toast.error(
                    t('admin.recruitment.access_rules.save_error', 'Failed to update access rules'),
                    { description: message }
                );
            }
        },
        [slug, isSlugLocked, queryClient, revalidator, t]
    );

    return {
        slug,
        navigate,
        study,
        links,
        isSlugLocked,
        isArchived,
        studyUrl,
        slugForm,
        accessForm,
        passwordEnabled,
        showWindowPickers,
        setShowWindowPickers,
        onSlugSubmit,
        onAccessRulesSubmit,
        isCreateModalOpen,
        setIsCreateModalOpen,
        handleCreateModalOpenChange,
        newLinkType,
        setNewLinkType,
        newLinkCount,
        setNewLinkCount,
        newLinkName,
        setNewLinkName,
        isCreatingLink: createMutation.isPending,
        isRevokingLink: revokeMutation.isPending,
        handleCreate,
        handleRevoke,
        copyToClipboard,
        getFullUrl,
    };
}
