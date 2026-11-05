import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { StudyConfig } from '@/schemas/study';
import { useConfigStore } from '@/store/useConfigStore';
import { usePlatformConfigStore } from '@/store/usePlatformConfigStore';
import { useResponseStore } from '@/store/useResponseStore';
import { useSessionStore } from '@/store/useSessionStore';
import { renderWithProviders } from '@/test-utils/test-utils';
import { Step1_Feedback } from './Step1_Feedback';
import { Step2_Questionnaire } from './Step2_Questionnaire';

/**
 * Only the tab flag says test here: the store is false, as it would be if a reset or a
 * rehydration had lost it. The real handlers run; only the recorder's UI is replaced.
 */

const api = vi.hoisted(() => ({ upload: vi.fn(), remove: vi.fn() }));

vi.mock('@/api/generated', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/api/generated')>()),
    uploadAudioApiAudioUploadPost: api.upload,
    deleteAudioRecordingApiAudioRecordingIdDelete: api.remove,
}));

vi.mock('@/components/audio/AudioRecorder', () => ({
    AudioRecorder: ({
        questionKey,
        onRecordingComplete,
        onRecordingDeleted,
    }: {
        questionKey: string;
        onRecordingComplete: (blob: Blob, duration: number) => Promise<void>;
        onRecordingDeleted: () => Promise<void>;
    }) => (
        <>
            <button type="button" onClick={() => onRecordingComplete(new Blob(['a']), 1)}>
                finish {questionKey}
            </button>
            <button type="button" onClick={() => onRecordingDeleted()}>
                delete {questionKey}
            </button>
        </>
    ),
}));

const STEPS = [
    ['Step1_Feedback', 'card_1', <Step1_Feedback key="1" onNext={vi.fn()} />],
    [
        'Step2_Questionnaire',
        'question_q1',
        <Step2_Questionnaire key="2" onBack={vi.fn()} onSubmit={vi.fn()} isLoading={false} />,
    ],
] as const;

const storedRecording = (key: string) => useResponseStore.getState().getAudioRecording(key);

describe.each(STEPS)('%s audio in a test tab', (_name, key, step) => {
    beforeEach(() => {
        api.upload.mockReset();
        api.remove.mockReset();
        URL.createObjectURL = vi.fn(() => 'blob:local');
        usePlatformConfigStore.setState({ audioStorage: 'available' });
        useConfigStore.setState({
            config: {
                grid_config: [
                    { score: -4, capacity: 1 },
                    { score: 4, capacity: 1 },
                ],
                statements: [{ id: 1, text: 'S1' }],
                postsort_config: {
                    extreme_columns: [-4, 4],
                    audio: { enabled: true },
                    questions: { q1: { type: 'text_audio', label: 'Why?', required: false } },
                },
            } as unknown as StudyConfig,
        });
        useResponseStore.setState({ qsort: [{ statementId: 1, col: 0, row: 0 }] });
        useSessionStore.setState({ token: 'pilot-token', isPilotMode: false });
        sessionStorage.setItem('qualis-pilot-mode', 'true');
    });

    it('a finished recording stays in the browser', async () => {
        renderWithProviders(step);

        fireEvent.click(screen.getByRole('button', { name: `finish ${key}` }));

        await waitFor(() => expect(storedRecording(key)?.id).toBe(-1));
        expect(api.upload).not.toHaveBeenCalled();
    });

    it('a deleted recording goes without a server call', async () => {
        useResponseStore.getState().setAudioRecording(key, {
            id: 5,
            question_key: key,
            file_size_bytes: 1,
            duration_seconds: 1,
            presigned_url: 'blob:local',
            created_at: new Date().toISOString(),
        });
        renderWithProviders(step);

        fireEvent.click(screen.getByRole('button', { name: `delete ${key}` }));

        await waitFor(() => expect(storedRecording(key)).toBeNull());
        expect(api.remove).not.toHaveBeenCalled();
    });
});
