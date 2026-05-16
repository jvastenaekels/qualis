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
    presort: Record<string, unknown>;
    postsort: {
        email?: string;
        newsletter_consent?: boolean;
        interview_consent?: boolean;
        questions_answers?: Record<string, unknown>;
        card_comments?: Record<string, string>;
    } & Record<string, unknown>;
    audio_recordings?: Record<string, unknown>;
    language: string;
    is_discarded: boolean;
    discard_reason: string | null;
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
        presort_config?: Record<string, unknown>;
        postsort_config?: {
            email_collection_enabled?: boolean;
            newsletter_consent_enabled?: boolean;
            interview_consent_enabled?: boolean;
        } & Record<string, unknown>;
        state: string;
        rough_sort_enabled?: boolean;
        // Distribution semantics (forced | free | flexible). When 'free', the
        // read-only grid viewer must surface overflow rows that exceed the
        // declared per-column capacity — otherwise admin-side data is
        // silently truncated for free-mode participants.
        distribution_mode?: 'forced' | 'free' | 'flexible';
    };
    participants: DumpParticipant[];
    statement_id_to_index: Record<string, number>;
}
