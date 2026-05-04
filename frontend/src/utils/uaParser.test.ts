import { describe, it, expect } from 'vitest';
import { parseUA } from './uaParser';

describe('parseUA', () => {
    it('returns Unknown defaults for empty input', () => {
        expect(parseUA()).toEqual({ browser: 'Unknown', os: 'Unknown', device: 'desktop' });
        expect(parseUA('')).toEqual({ browser: 'Unknown', os: 'Unknown', device: 'desktop' });
    });

    it('detects iPad as tablet + iOS + Safari', () => {
        const ua = 'Mozilla/5.0 (iPad; CPU OS 16_0 like Mac OS X) AppleWebKit Safari/605.1.15';
        const r = parseUA(ua);
        expect(r.device).toBe('tablet');
        expect(r.os).toBe('iOS');
        expect(r.browser).toBe('Safari');
    });

    it('detects iPhone as mobile + iOS', () => {
        const ua = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0)';
        expect(parseUA(ua)).toMatchObject({ device: 'mobile', os: 'iOS' });
    });

    it('detects Android phone as mobile + Android + Chrome', () => {
        const ua = 'Mozilla/5.0 (Linux; Android 13) AppleWebKit Chrome/120';
        const r = parseUA(ua);
        expect(r.device).toBe('mobile');
        expect(r.os).toBe('Android');
        expect(r.browser).toBe('Chrome');
    });

    it('detects Edge over Chrome on Windows', () => {
        const ua = 'Mozilla/5.0 (Windows NT 10.0) AppleWebKit Chrome/120 Edg/120';
        const r = parseUA(ua);
        expect(r.os).toBe('Windows');
        expect(r.browser).toBe('Edge');
    });

    it('detects Opera not Chrome', () => {
        const ua = 'Mozilla/5.0 (Windows NT 10.0) AppleWebKit Chrome/120 OPR/100';
        expect(parseUA(ua).browser).toBe('Opera');
    });

    it('detects Firefox', () => {
        expect(parseUA('Mozilla/5.0 Firefox/120').browser).toBe('Firefox');
    });

    it('detects macOS desktop Safari', () => {
        const ua = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit Safari/605';
        expect(parseUA(ua)).toEqual({ device: 'desktop', os: 'macOS', browser: 'Safari' });
    });

    it('detects Linux desktop', () => {
        expect(parseUA('Mozilla/5.0 (X11; Linux x86_64) Firefox/120').os).toBe('Linux');
    });

    it('falls back to desktop when no mobile/tablet markers present', () => {
        expect(parseUA('Mozilla/5.0 (Windows NT 10.0)').device).toBe('desktop');
    });
});
