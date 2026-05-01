import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { isPilot } from '../utils/pilotMode';
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
    /**
     * Flat unsorted deck (deck mode, rough_sort_enabled=false).
     * Holds every statement id that has not yet been placed in the qsort
     * grid. The list is mode-specific: when rough_sort_enabled=true the
     * orphan reconciler in useFineSort uses categorizeCard('neutral')
     * instead, and `deck` stays empty.
     */
    deck: number[];
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

    // Deck mode (rough_sort_enabled=false)
    addToDeck: (statementId: number) => void;
    removeFromDeck: (statementId: number) => void;

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

export const initialResponses: Responses = {
    presort: {},
    rough: { agree: [], disagree: [], neutral: [], history: [] },
    deck: [],
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
let savingIndicatorTimeoutId: ReturnType<typeof setTimeout> | null = null;
const triggerSavingIndicator = () => {
    useSessionStore.getState().setSaving(true);
    if (savingIndicatorTimeoutId !== null) {
        clearTimeout(savingIndicatorTimeoutId);
    }
    savingIndicatorTimeoutId = setTimeout(() => {
        useSessionStore.getState().setSaving(false);
        savingIndicatorTimeoutId = null;
    }, 800);
};

type SetFn = (partial: Partial<Responses>) => void;
const _placeOrMove = (
    get: () => Responses & ResponseActions,
    set: SetFn,
    statementId: number,
    col: number,
    row: number,
    warnOnFull: boolean
) => {
    const config = useConfigStore.getState().config;
    if (!config) return;
    const colConfig = config.grid_config?.[col];
    if (!colConfig) return;
    const state = get();
    const cardsInCol = state.qsort.filter((c) => c.col === col && c.statementId !== statementId);
    // Per-column capacity is a hard cap only in `forced` mode. In `free` and
    // `flexible` mode the visual grid grows past capacity (free-mode overflow
    // rows render in GridSort; submission validation only checks the total
    // card count). Returning early here would block every overflow placement,
    // even when the caller already resolved an empty row past the declared
    // capacity (see useGridPlacement.findClosestEmptyRow).
    const isForced = (config.distribution_mode ?? 'forced') === 'forced';
    if (isForced && cardsInCol.length >= colConfig.capacity) {
        if (warnOnFull) console.warn(`Column ${col} is full.`);
        return;
    }
    const filtered = state.qsort.filter((p) => p.statementId !== statementId);
    // Deck-mode invariant: a placed card must not also live in the flat deck.
    // When the card is currently in the deck, splice it out atomically with the
    // qsort update so the two slices never disagree (rough mode: deck is always
    // empty, so this branch is skipped and only qsort is updated).
    if (state.deck.includes(statementId)) {
        set({
            qsort: [...filtered, { statementId, col, row }],
            deck: state.deck.filter((id) => id !== statementId),
        });
    } else {
        set({ qsort: [...filtered, { statementId, col, row }] });
    }
    triggerSavingIndicator();
};

export const useResponseStore = create<Responses & ResponseActions>()(
    persist(
        (set, get) => ({
            ...initialResponses,

            setPresortResponse: (data) => {
                const current = get().presort;
                if (JSON.stringify(current) === JSON.stringify(data)) return;
                set({ presort: data });
                triggerSavingIndicator();
            },

            categorizeCard: (statementId, category) => {
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

                triggerSavingIndicator();
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
                triggerSavingIndicator();
            },

            addToDeck: (statementId) => {
                const { deck } = get();
                if (deck.includes(statementId)) return;
                set({ deck: [...deck, statementId] });
                triggerSavingIndicator();
            },

            removeFromDeck: (statementId) => {
                const { deck } = get();
                if (!deck.includes(statementId)) return;
                set({ deck: deck.filter((id) => id !== statementId) });
                triggerSavingIndicator();
            },

            placeCardInGrid: (statementId, col, row) => {
                _placeOrMove(get, set, statementId, col, row, true);
            },

            moveCardInGrid: (statementId, col, row) => {
                _placeOrMove(get, set, statementId, col, row, false);
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
                triggerSavingIndicator();
            },

            unplaceCard: (statementId) => {
                set((state) => ({
                    qsort: state.qsort.filter((p) => p.statementId !== statementId),
                }));
                triggerSavingIndicator();
            },

            resetFineSort: () => {
                set({ qsort: [] });
                triggerSavingIndicator();
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
                triggerSavingIndicator();
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
                triggerSavingIndicator();
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
                triggerSavingIndicator();
            },

            getAudioRecording: (questionKey) => {
                return get().postsort.audio_recordings?.[questionKey] || null;
            },

            resetResponses: () => {
                if (savingIndicatorTimeoutId !== null) {
                    clearTimeout(savingIndicatorTimeoutId);
                    savingIndicatorTimeoutId = null;
                }
                set(initialResponses);
            },
        }),
        {
            name: isPilot() ? 'qualis-pilot-responses' : 'qualis-responses',
            version: 2,
            storage: safeLocalStorage,
            migrate: (persisted: unknown, version: number) => {
                // v1 → v2: deck slice added; structurally compatible because
                // `deck` defaults to [] via the `...initialResponses` spread on
                // rehydration (any persisted v1 blob simply lacks `deck` and the
                // default fills it in). No data transform needed.
                if (version < 2) return persisted as Responses;
                return persisted as Responses;
            },
        }
    )
);
