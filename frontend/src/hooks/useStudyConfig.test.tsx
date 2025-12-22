/*
 * Open-Q - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

import { renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useStudyConfig } from './useStudyConfig';
import { useConfigStore } from '../store/useConfigStore';
import { useSessionStore } from '../store/useSessionStore';
import * as apiClient from '../api/client';
import { applyStudyOverrides } from '../utils/i18nOverrides';

// Mock specific parts 
vi.mock('../api/client', () => ({
    get: vi.fn(),
    post: vi.fn()
}));

// Mock the i18n overrides utility
vi.mock('../utils/i18nOverrides', () => ({
    applyStudyOverrides: vi.fn(),
    resetBaseLocales: vi.fn(),
}));

// Mock i18n instance methods for tracking
vi.mock('../i18n', () => ({
    default: {
        changeLanguage: vi.fn(),
        language: 'en'
    }
}));

// Mock react-router-dom
vi.mock('react-router-dom', () => ({
    useParams: () => ({ slug: 'test-study' }),
    useLocation: () => ({ pathname: '/study/test-study/welcome' }),
}));

describe('useStudyConfig', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // Reset Stores
        useConfigStore.getState().resetConfig();
        useSessionStore.getState().resetSession();
    });

    it('fetches study config on mount', async () => {
        const mockGet = vi.mocked(apiClient.get);
        mockGet.mockResolvedValue({
            slug: 'test-study',
            title: 'Test Title EN',
            description: 'Test Description EN',
            instructions: 'Test Instructions EN',
            presort_config: {},
            statements: [],
        });

        renderHook(() => useStudyConfig());

        await waitFor(() => {
            expect(mockGet).toHaveBeenCalled();
        });
        
        expect(useConfigStore.getState().config?.title).toBe('Test Title EN');
    });

    it('applies UI overrides when present in config', async () => {
        const mockGet = vi.mocked(apiClient.get);
        const uiLabels = { 'common.agree': 'Approve' };
        
        mockGet.mockResolvedValue({
            slug: 'test-study',
            title: 'Test Title',
            description: 'Desc',
            instructions: 'Instr',
            presort_config: {},
            statements: [],
            ui_labels: uiLabels,
            language: 'en'
        });

        renderHook(() => useStudyConfig());

        await waitFor(() => {
            expect(applyStudyOverrides).toHaveBeenCalledWith('en', uiLabels);
        });
    });
});
