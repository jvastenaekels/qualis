import { useEffect } from 'react';
import { useStudyStore } from '../store/useStudyStore';
import { get, ApiError } from '../api/client';
import { useParams } from 'react-router-dom';
import { StudyConfigSchema } from '../schemas/study';
import { ZodError } from 'zod';

export const useStudyConfig = () => {
    const { slug } = useParams();
    const { setConfig, setConfigLoading, setConfigError, triggerConfigRefetch, configRefetchTag, session, config } = useStudyStore();

    useEffect(() => {
        if (!slug) return;
        
        const fetchConfig = async () => {
            // Only show full loading state if we don't have a config yet (stale-while-revalidating)
            if (!config) {
                setConfigLoading(true);
            }
            
            // Clear previous error when starting a new fetch
            setConfigError(null);

            try {
                // Detect Browser Language if session is not yet set
                const langToRequest = session.language ?? window.navigator.language.substring(0, 2); // Fallback to raw navigator if i18n not ready
                
                // Fetch study config from backend
                const data = await get<unknown>(`/api/study/${slug}?lang=${langToRequest}`);
                
                // VALIDATE WITH ZOD
                const validatedData = StudyConfigSchema.parse(data);
                
                setConfig(validatedData);

                // If session language was not set, OR if the backend resolved to a DIFFERENT language
                // we should update our session to match what is actually being displayed.
                if (!session.language || (validatedData.language && session.language !== validatedData.language)) {
                    useStudyStore.getState().setLanguage(validatedData.language || 'en');
                }
                
            } catch (err: unknown) {
                console.error("Failed to fetch or validate study:", err);
                
                let errorKey = 'common.errors.unknown';
                if (err instanceof ApiError) {
                    if (err.status === 404) {
                        errorKey = 'common.errors.not_found';
                    }
                } else if (err instanceof ZodError) {
                    errorKey = 'common.errors.validation';
                } else if (err instanceof TypeError && err.message === 'Failed to fetch') {
                    errorKey = 'common.errors.network';
                }
                
                setConfigError(errorKey);
            }
        };

        fetchConfig();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [slug, session.language, configRefetchTag, setConfig, setConfigLoading, setConfigError]); 

    return { 
        retry: triggerConfigRefetch 
    };
};
