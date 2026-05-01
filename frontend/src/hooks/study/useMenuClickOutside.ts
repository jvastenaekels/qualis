/*
 * Qualis - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

/**
 * Closes the StudyLayout dropdown menus (language, step, resume) when the
 * user clicks outside any of them. The resume menu also clears its
 * "link copied" state and returns keyboard focus to the trigger button.
 *
 * Owns the timeout used by the resume-menu copy feedback so it is cleared
 * on click-outside as well as on unmount.
 */

import { type RefObject, useEffect, useRef } from 'react';

interface UseMenuClickOutsideArgs {
    langMenuRef: RefObject<HTMLDivElement | null>;
    stepMenuRef: RefObject<HTMLDivElement | null>;
    resumeMenuRef: RefObject<HTMLDivElement | null>;
    resumeButtonRef: RefObject<HTMLButtonElement | null>;
    setIsLangMenuOpen: (open: boolean) => void;
    setIsStepMenuOpen: (open: boolean) => void;
    setIsResumeMenuOpen: (open: boolean) => void;
    setLinkCopied: (copied: boolean) => void;
}

export function useMenuClickOutside({
    langMenuRef,
    stepMenuRef,
    resumeMenuRef,
    resumeButtonRef,
    setIsLangMenuOpen,
    setIsStepMenuOpen,
    setIsResumeMenuOpen,
    setLinkCopied,
}: UseMenuClickOutsideArgs): {
    copyTimeoutRef: RefObject<ReturnType<typeof setTimeout> | null>;
} {
    const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // The setters and refs are stable identities; the empty dependency array is
    // intentional. The hook also rolls together three menu close paths into one
    // listener, which biome scores as cc 16 — splitting would obscure the
    // shared timeout-clear bookkeeping.
    // biome-ignore lint/correctness/useExhaustiveDependencies: stable refs/setters
    useEffect(() => {
        // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: 3 menus + shared timeout teardown in one listener
        const handleClickOutside = (event: MouseEvent) => {
            const target = event.target as Node;
            if (langMenuRef.current && !langMenuRef.current.contains(target)) {
                setIsLangMenuOpen(false);
            }
            if (stepMenuRef.current && !stepMenuRef.current.contains(target)) {
                setIsStepMenuOpen(false);
            }
            if (resumeMenuRef.current && !resumeMenuRef.current.contains(target)) {
                if (copyTimeoutRef.current) {
                    clearTimeout(copyTimeoutRef.current);
                    copyTimeoutRef.current = null;
                }
                setIsResumeMenuOpen(false);
                setLinkCopied(false);
                resumeButtonRef.current?.focus();
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            if (copyTimeoutRef.current) {
                clearTimeout(copyTimeoutRef.current);
                copyTimeoutRef.current = null;
            }
        };
    }, []);

    return { copyTimeoutRef };
}
