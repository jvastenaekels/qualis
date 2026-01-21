export interface UAInfo {
    browser: string;
    os: string;
    device: 'mobile' | 'tablet' | 'desktop';
}

/**
 * Parse user agent string to extract browser, OS, and device type
 */
export function parseUA(userAgent?: string): UAInfo {
    const info: UAInfo = {
        browser: 'Unknown',
        os: 'Unknown',
        device: 'desktop',
    };

    if (!userAgent) return info;

    // Device detection
    if (/tablet|ipad|playbook|silk/i.test(userAgent)) {
        info.device = 'tablet';
    } else if (/mobile|iphone|ipod|android|blackberry|opera mini|windows phone/i.test(userAgent)) {
        info.device = 'mobile';
    }

    // OS detection
    if (/windows/i.test(userAgent)) {
        info.os = 'Windows';
    } else if (/android/i.test(userAgent)) {
        info.os = 'Android';
    } else if (/ipad|iphone|ipod/i.test(userAgent)) {
        info.os = 'iOS';
    } else if (/macintosh|mac os x/i.test(userAgent)) {
        info.os = 'macOS';
    } else if (/linux/i.test(userAgent)) {
        info.os = 'Linux';
    }

    // Browser detection
    if (/edg/i.test(userAgent)) {
        info.browser = 'Edge';
    } else if (/chrome|crios/i.test(userAgent) && !/opr|opios/i.test(userAgent)) {
        info.browser = 'Chrome';
    } else if (/firefox|fxios/i.test(userAgent)) {
        info.browser = 'Firefox';
    } else if (/safari/i.test(userAgent) && !/chrome|crios|edg|opr|opios/i.test(userAgent)) {
        info.browser = 'Safari';
    } else if (/opr|opios/i.test(userAgent)) {
        info.browser = 'Opera';
    } else if (/trident|msie/i.test(userAgent)) {
        info.browser = 'Internet Explorer';
    }

    return info;
}
