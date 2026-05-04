interface UAInfo {
    browser: string;
    os: string;
    device: 'mobile' | 'tablet' | 'desktop';
}

function detectDevice(ua: string): UAInfo['device'] {
    if (/tablet|ipad|playbook|silk/i.test(ua)) return 'tablet';
    if (/mobile|iphone|ipod|android|blackberry|opera mini|windows phone/i.test(ua)) return 'mobile';
    return 'desktop';
}

function detectOS(ua: string): string {
    if (/windows/i.test(ua)) return 'Windows';
    if (/android/i.test(ua)) return 'Android';
    if (/ipad|iphone|ipod/i.test(ua)) return 'iOS';
    if (/macintosh|mac os x/i.test(ua)) return 'macOS';
    if (/linux/i.test(ua)) return 'Linux';
    return 'Unknown';
}

function detectBrowser(ua: string): string {
    if (/edg/i.test(ua)) return 'Edge';
    if (/opr|opios/i.test(ua)) return 'Opera';
    if (/chrome|crios/i.test(ua)) return 'Chrome';
    if (/firefox|fxios/i.test(ua)) return 'Firefox';
    if (/safari/i.test(ua)) return 'Safari';
    if (/trident|msie/i.test(ua)) return 'Internet Explorer';
    return 'Unknown';
}

export function parseUA(userAgent?: string): UAInfo {
    if (!userAgent) {
        return { browser: 'Unknown', os: 'Unknown', device: 'desktop' };
    }
    return {
        device: detectDevice(userAgent),
        os: detectOS(userAgent),
        browser: detectBrowser(userAgent),
    };
}
