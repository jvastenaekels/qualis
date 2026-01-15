import { useReadUsersMeApiMeGet } from '../api/generated';

export const useAuth = () => {
    const {
        data: user,
        isLoading,
        error,
        refetch,
    } = useReadUsersMeApiMeGet({
        query: {
            retry: false,
            staleTime: 1000 * 60 * 5, // Cache user for 5m
        },
    });

    const isAuthenticated = !!user;
    const isAdmin = user?.is_superuser || false; // Or check specific role if added to UserRead

    return {
        user,
        isLoading,
        error,
        isAuthenticated,
        isAdmin,
        refetch,
    };
};
