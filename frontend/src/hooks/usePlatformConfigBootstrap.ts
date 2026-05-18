import { useEffect } from 'react';
import { useGetPublicConfigApiConfigGet } from '@/api/generated';
import { usePlatformConfigStore } from '@/store/usePlatformConfigStore';

/** Fetch GET /api/config once at app start and cache it in the store. */
export function usePlatformConfigBootstrap(): void {
    // Silent-until-loaded by design: on error/loading the store stays null,
    // isEmailManual() is false, and consumers fall back to the safe SMTP-mode UX.
    // Do not "improve" this to surface errors or reset state — that breaks the
    // safe default (a transient /api/config failure must not strand users in a
    // manual-recovery UI they cannot action).
    const { data } = useGetPublicConfigApiConfigGet();
    const setEmailDelivery = usePlatformConfigStore((s) => s.setEmailDelivery);
    const setAudioStorage = usePlatformConfigStore((s) => s.setAudioStorage);

    useEffect(() => {
        if (data?.email_delivery) {
            setEmailDelivery(data.email_delivery);
        }
        if (data?.audio_storage) {
            setAudioStorage(data.audio_storage);
        }
    }, [data, setEmailDelivery, setAudioStorage]);
}
