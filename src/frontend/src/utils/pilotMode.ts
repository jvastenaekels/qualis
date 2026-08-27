export const isPilot = (): boolean => {
    try {
        const params = new URLSearchParams(window.location.search);
        if (params.get('mode') === 'test') {
            sessionStorage.setItem('qualis-pilot-mode', 'true');
            return true;
        }
        return sessionStorage.getItem('qualis-pilot-mode') === 'true';
    } catch {
        return false;
    }
};

export const clearPilotFlag = (): void => {
    try {
        sessionStorage.removeItem('qualis-pilot-mode');
    } catch {
        /* ignore */
    }
};
