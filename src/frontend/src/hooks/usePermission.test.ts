import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { usePermission } from './usePermission';
import { useAuthStore } from '@/store/useAuthStore';

vi.mock('@/store/useAuthStore');

describe('usePermission', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('returns isMember=true and isOwner=false for a member', () => {
        vi.mocked(useAuthStore).mockReturnValue({
            currentProject: { user_role: 'member' },
        } as ReturnType<typeof useAuthStore>);
        const { result } = renderHook(() => usePermission());
        expect(result.current.isMember).toBe(true);
        expect(result.current.isOwner).toBe(false);
        expect(result.current.isViewer).toBe(false);
    });

    it('a member can edit_design but cannot manage_team', () => {
        vi.mocked(useAuthStore).mockReturnValue({
            currentProject: { user_role: 'member' },
        } as ReturnType<typeof useAuthStore>);
        const { result } = renderHook(() => usePermission());
        expect(result.current.can('study:edit_design')).toBe(true);
        expect(result.current.cannot('project:manage_team')).toBe(true);
    });

    it('a viewer can view but cannot edit', () => {
        vi.mocked(useAuthStore).mockReturnValue({
            currentProject: { user_role: 'viewer' },
        } as ReturnType<typeof useAuthStore>);
        const { result } = renderHook(() => usePermission());
        expect(result.current.can('study:view_data')).toBe(true);
        expect(result.current.cannot('study:edit_design')).toBe(true);
    });

    it('an owner can do everything', () => {
        vi.mocked(useAuthStore).mockReturnValue({
            currentProject: { user_role: 'owner' },
        } as ReturnType<typeof useAuthStore>);
        const { result } = renderHook(() => usePermission());
        expect(result.current.can('project:delete')).toBe(true);
        expect(result.current.can('project:manage_team')).toBe(true);
    });

    it('returns false for any permission when no project selected', () => {
        vi.mocked(useAuthStore).mockReturnValue({
            currentProject: null,
        } as ReturnType<typeof useAuthStore>);
        const { result } = renderHook(() => usePermission());
        expect(result.current.can('study:view_data')).toBe(false);
    });
});
