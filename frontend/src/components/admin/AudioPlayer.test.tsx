import { describe, expect, it, beforeAll, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { AudioPlayer } from './AudioPlayer';
import { renderWithProviders, screen } from '@/test-utils/test-utils';

// jsdom does not implement HTMLMediaElement playback; stub just enough for the
// toggle handler to run without throwing "not implemented".
beforeAll(() => {
    window.HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);
    window.HTMLMediaElement.prototype.pause = vi.fn();
});

describe('AudioPlayer', () => {
    it('names the play/pause toggle and flips the name when toggled', async () => {
        const user = userEvent.setup();
        renderWithProviders(<AudioPlayer url="https://example.com/audio.webm" />);

        const toggle = screen.getByRole('button', { name: 'Play audio' });
        expect(screen.queryByRole('button', { name: 'Pause audio' })).not.toBeInTheDocument();

        await user.click(toggle);

        expect(screen.getByRole('button', { name: 'Pause audio' })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Play audio' })).not.toBeInTheDocument();
    });

    it('names the download control', () => {
        renderWithProviders(<AudioPlayer url="https://example.com/audio.webm" />);

        expect(screen.getByRole('button', { name: 'Download audio' })).toBeInTheDocument();
    });
});
