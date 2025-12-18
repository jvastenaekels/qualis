import { useState, useEffect, type RefObject } from 'react';

export const useScaleToFit = (
    containerRef: RefObject<HTMLElement>,
    contentRef: RefObject<HTMLElement>,
    padding: number = 32
) => {
    const [scale, setScale] = useState(1);

    useEffect(() => {
        const handleResize = () => {
            if (!containerRef.current || !contentRef.current) return;

            const container = containerRef.current;
            const content = contentRef.current;

            const containerWidth = container.clientWidth - padding * 2;
            const containerHeight = container.clientHeight - padding * 2;

            // Use scrollWidth/scrollHeight to get the full unscaled dimensions
            // Assuming the content is rendered at scale(1) initially or we can measure its intrinsic size
            // A safer way is to measure the children or clone logic, but simplified:
            // We expect the content to have a fixed layout size.
            
            const contentWidth = content.scrollWidth;
            const contentHeight = content.scrollHeight;

            if (contentWidth === 0 || contentHeight === 0) return;

            const scaleX = containerWidth / contentWidth;
            const scaleY = containerHeight / contentHeight;

            // Use the smaller scale to fit both dimensions
            const newScale = Math.min(scaleX, scaleY, 1); // Never zoom in past 100%? User said "If large, it scales up." so remove 1 limit.
            
            // User requirement: "Improve auto-scaling" -> Allow slight upscale (1.5 max) if screen allows
            const finalScale = Math.min(scaleX, scaleY, 1.5);
            
            setScale(finalScale);
        };

        // ResizeObserver is more robust than window.resize
        const observer = new ResizeObserver(handleResize);
        if (containerRef.current) observer.observe(containerRef.current);
        
        // Initial call
        handleResize();
        
        return () => observer.disconnect();
    }, [containerRef, contentRef, padding]);

    return scale;
};
