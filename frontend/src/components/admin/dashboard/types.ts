// Types representing the backend dump response structure

interface DumpStatement {
    id: number;
    code?: string;
    translations: { lang: string; text: string }[];
}

export interface DumpParticipant {
    id: string;
    db_id: number;
    duration_seconds: number | null;
    scores: (number | null)[];
    placements: Record<string, number>;
    // biome-ignore lint/suspicious/noExplicitAny: dynamic structure
    presort: Record<string, any>;
    postsort: {
        email?: string;
        newsletter_consent?: boolean;
        interview_consent?: boolean;
        // biome-ignore lint/suspicious/noExplicitAny: dynamic structure
        questions_answers?: Record<string, any>;
        card_comments?: Record<string, string>;
        // biome-ignore lint/suspicious/noExplicitAny: dynamic structure
    } & Record<string, any>;
    // biome-ignore lint/suspicious/noExplicitAny: dynamic structure
    audio_recordings?: Record<string, any>;
    language: string;
    is_discarded: boolean;
    discard_reason: string | null;
    is_test_run: boolean;
    submitted_at?: string;
    recruitment_token?: string;
    status: string;
    user_agent?: string;
    created_at?: string;
    ip_address?: string;
    last_step_reached?: number | null;
    last_step_reached_at?: string | null;
}

export interface DumpResponse {
    study: {
        slug: string;
        statements: DumpStatement[];
        translations: { lang: string; title: string }[];
        grid_config?: Record<string, number> | { score: number; capacity: number }[];
        // biome-ignore lint/suspicious/noExplicitAny: dynamic config
        presort_config?: Record<string, any>;
        postsort_config?: {
            email_collection_enabled?: boolean;
            newsletter_consent_enabled?: boolean;
            interview_consent_enabled?: boolean;
            // biome-ignore lint/suspicious/noExplicitAny: dynamic config
        } & Record<string, any>;
        state: string;
    };
    participants: DumpParticipant[];
    statement_id_to_index: Record<string, number>;
}
