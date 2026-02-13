import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { useConfigStore } from './useConfigStore';
import { useSessionStore } from './useSessionStore';
import { safeLocalStorage } from './safeStorage';

interface AudioRecordingMetadata {
    id: number;
    question_key: string;
    file_size_bytes: number;
    duration_seconds: number;
    presigned_url: string;
    created_at: string;
    url_expires_at?: string;
}

interface Responses {
    presort: Record<string, string | number | boolean>;
    rough: {
        agree: number[];
        disagree: number[];
        neutral: number[];
        history: number[];
    };
    qsort: { statementId: number; col: number; row: number }[];
    postsort: {
        card_comments: Record<number, string>;
        missing_statement: string;
        general_comment: string;
        questions_answers: Record<string, string | number | boolean>;
        email?: string;
        interview_consent?: boolean;
        newsletter_consent?: boolean;
        audio_recordings: Record<string, AudioRecordingMetadata>;
    };
}

interface ResponseActions {
    setPresortResponse: (data: Record<string, string | number | boolean>) => void;

    // Rough Sort
    categorizeCard: (statementId: number, category: 'agree' | 'disagree' | 'neutral') => void;
    undoRoughSort: () => void;

    // Fine Sort
    placeCardInGrid: (statementId: number, col: number, row: number) => void;
    moveCardInGrid: (statementId: number, col: number, row: number) => void;
    swapCardsInGrid: (id1: number, id2: number) => void;
    unplaceCard: (statementId: number) => void;
    resetFineSort: () => void;

    // Post Sort
    setPostSortResponse: (
        field: keyof Responses['postsort'],
        value: string | Record<number, string> | boolean | number
    ) => void;

    // Audio Recordings
    setAudioRecording: (questionKey: string, metadata: AudioRecordingMetadata) => void;
    deleteAudioRecording: (questionKey: string) => void;
    getAudioRecording: (questionKey: string) => AudioRecordingMetadata | null;

    resetResponses: () => void;
}

const initialResponses: Responses = {
    presort: {},
    rough: { agree: [], disagree: [], neutral: [], history: [] },
    qsort: [],
    postsort: {
        card_comments: {},
        missing_statement: '',
        general_comment: '',
        questions_answers: {},
        audio_recordings: {},
    },
};

// Helper: Trigger Saving Indicator (debounced — cancels previous timeout)
let autoSaveTimeoutId: ReturnType<typeof setTimeout> | null = null;
const triggerAutoSave = () => {
    useSessionStore.getState().setSaving(true);
    if (autoSaveTimeoutId !== null) {
        clearTimeout(autoSaveTimeoutId);
    }
    autoSaveTimeoutId = setTimeout(() => {
        useSessionStore.getState().setSaving(false);
        autoSaveTimeoutId = null;
    }, 800);
};

const isPilot = () => {
    try {
        const params = new URLSearchParams(window.location.search);
        if (params.get('mode') === 'test') {
            sessionStorage.setItem('libre-q-pilot-mode', 'true');
            return true;
        }
        return sessionStorage.getItem('libre-q-pilot-mode') === 'true';
    } catch {
        return false;
    }
};

export const useResponseStore = create<Responses & ResponseActions>()(
    persist(
        (set, get) => ({
            ...initialResponses,

            setPresortResponse: (data) => {
                const current = get().presort;
                if (JSON.stringify(current) === JSON.stringify(data)) return;
                set({ presort: data });
                triggerAutoSave();
            },

            categorizeCard: (statementId, category) => {
                const validCategories = ['agree', 'disagree', 'neutral'];
                if (!validCategories.includes(category)) {
                    console.error(`Invalid category: ${category}`);
                    return;
                }
                set((state) => {
                    const { rough } = state;

                    // Remove from other categories first
                    const agree = rough.agree.filter((id) => id !== statementId);
                    const disagree = rough.disagree.filter((id) => id !== statementId);
                    const neutral = rough.neutral.filter((id) => id !== statementId);

                    const newRough = {
                        agree,
                        disagree,
                        neutral,
                        history: [...rough.history, statementId],
                    };

                    // Add to new category
                    // (But careful not to add if currently filtering, though this approach rebuilds them)
                    // Actually, simpler: just filter all, then append to target.

                    return {
                        rough: {
                            ...newRough,
                            [category]: [...newRough[category], statementId],
                        },
                    };
                });

                // Downgrade max step? Logic was in useStudyStore.
                // We should probably handle step logic in the component or a dedicated controller,
                // but strictly keeping it here mimics old behavior.
                // However, accessing other store to set step is tricky.
                // Let's stick to data updates. Step regression logic should be in the UI/Page.
                triggerAutoSave();
            },

            undoRoughSort: () => {
                set((state) => {
                    const { rough } = state;
                    if (rough.history.length === 0) return state;

                    const lastCardId = rough.history[rough.history.length - 1];
                    const newHistory = rough.history.slice(0, -1);

                    return {
                        rough: {
                            agree: rough.agree.filter((id) => id !== lastCardId),
                            disagree: rough.disagree.filter((id) => id !== lastCardId),
                            neutral: rough.neutral.filter((id) => id !== lastCardId),
                            history: newHistory,
                        },
                    };
                });
                triggerAutoSave();
            },

            placeCardInGrid: (statementId, col, row) => {
                const config = useConfigStore.getState().config;
                if (!config) return;

                const colConfig = config.grid_config?.[col];
                if (!colConfig) return;

                const state = get();
                const cardsInCol = state.qsort.filter(
                    (c) => c.col === col && c.statementId !== statementId
                );

                if (cardsInCol.length >= colConfig.capacity) {
                    console.warn(`Column ${col} is full.`);
                    return;
                }

                const filtered = state.qsort.filter((p) => p.statementId !== statementId);
                set({ qsort: [...filtered, { statementId, col, row }] });
                triggerAutoSave();
            },

            moveCardInGrid: (statementId, col, row) => {
                const config = useConfigStore.getState().config;
                if (!config) return;

                const colConfig = config.grid_config?.[col];
                if (!colConfig) return;

                const state = get();
                const cardsInCol = state.qsort.filter(
                    (c) => c.col === col && c.statementId !== statementId
                );

                if (cardsInCol.length >= colConfig.capacity) return;

                const filtered = state.qsort.filter((p) => p.statementId !== statementId);
                set({ qsort: [...filtered, { statementId, col, row }] });
                triggerAutoSave();
            },

            swapCardsInGrid: (id1, id2) => {
                const state = get();
                const card1 = state.qsort.find((p) => p.statementId === id1);
                const card2 = state.qsort.find((p) => p.statementId === id2);

                if (!card1 || !card2) return;

                const newCard1 = { ...card1, col: card2.col, row: card2.row };
                const newCard2 = { ...card2, col: card1.col, row: card1.row };

                const others = state.qsort.filter(
                    (p) => p.statementId !== id1 && p.statementId !== id2
                );
                set({ qsort: [...others, newCard1, newCard2] });
                triggerAutoSave();
            },

            unplaceCard: (statementId) => {
                set((state) => ({
                    qsort: state.qsort.filter((p) => p.statementId !== statementId),
                }));
                triggerAutoSave();
            },

            resetFineSort: () => {
                set({ qsort: [] });
                triggerAutoSave();
            },

            setPostSortResponse: (field, value) => {
                const current = get().postsort[field];
                if (JSON.stringify(current) === JSON.stringify(value)) return;
                set((state) => ({
                    postsort: {
                        ...state.postsort,
                        [field]: value,
                    },
                }));
                triggerAutoSave();
            },

            setAudioRecording: (questionKey, metadata) => {
                set((state) => ({
                    postsort: {
                        ...state.postsort,
                        audio_recordings: {
                            ...state.postsort.audio_recordings,
                            [questionKey]: metadata,
                        },
                    },
                }));
                triggerAutoSave();
            },

            deleteAudioRecording: (questionKey) => {
                set((state) => {
                    const { [questionKey]: _, ...rest } = state.postsort.audio_recordings;
                    return {
                        postsort: {
                            ...state.postsort,
                            audio_recordings: rest,
                        },
                    };
                });
                triggerAutoSave();
            },

            getAudioRecording: (questionKey) => {
                return get().postsort.audio_recordings?.[questionKey] || null;
            },

            resetResponses: () => set(initialResponses),
        }),
        {
            name: isPilot() ? 'libre-q-pilot-responses' : 'libre-q-responses',
            version: 2,
            storage: safeLocalStorage,
        }
    )
);
