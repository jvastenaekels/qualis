export type FormFactor =
    | 'mobile_portrait'
    | 'mobile_landscape'
    | 'tablet_portrait'
    | 'tablet_landscape'
    | 'desktop';

export const FORM_FACTORS: Record<FormFactor, { width: number; height: number }> = {
    mobile_portrait: { width: 390, height: 844 },
    mobile_landscape: { width: 844, height: 390 },
    tablet_portrait: { width: 768, height: 1024 },
    tablet_landscape: { width: 1024, height: 768 },
    desktop: { width: 1280, height: 800 },
};

export function setViewport(factor: FormFactor): void {
    const { width, height } = FORM_FACTORS[factor];

    Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: width,
    });
    Object.defineProperty(window, 'innerHeight', {
        writable: true,
        configurable: true,
        value: height,
    });

    window.dispatchEvent(new Event('resize'));
}

export function rotateViewport(from: FormFactor, to: FormFactor): void {
    setViewport(from);
    setTimeout(() => {
        setViewport(to);
    }, 0);
}
