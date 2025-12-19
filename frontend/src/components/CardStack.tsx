import { forwardRef, useImperativeHandle, useState, useRef, useEffect } from 'react';
import { motion, useTransform, useAnimation, type PanInfo, type MotionValue } from 'framer-motion';
import { createPortal } from 'react-dom';

interface CardStackProps {
  statement: { id: number; text: string };
  onVote: (direction: 'agree' | 'disagree' | 'neutral') => void;
  x: MotionValue<number>;
  y: MotionValue<number>;
}

export interface CardStackHandle {
  swipe: (direction: 'agree' | 'disagree' | 'neutral') => Promise<void>;
}

const CardStack = forwardRef<CardStackHandle, CardStackProps>(({ statement, onVote, x, y }, ref) => {
  const controls = useAnimation();
  const [showZoom, setShowZoom] = useState(false);
  const [isOverflowing, setIsOverflowing] = useState(false);
  const textRef = useRef<HTMLParagraphElement>(null);

  // Dynamic Tints
  // Left (-x): Red, Right (+x): Green, Down (+y): Gray
  const rotate = useTransform(x, [-200, 200], [-10, 10]);
  // Immediate Feedback: Start opacity change at 10px, solid by 100px
  const opacityAgree = useTransform(x, [10, 100], [0, 1]);
  const opacityDisagree = useTransform(x, [-10, -100], [0, 1]);
  const opacityNeutral = useTransform(y, [10, 100], [0, 1]);

  // Dynamic Typography
  const textLength = statement.text.length;
  let fontSizeClass = 'text-xl sm:text-2xl';
  if (textLength > 150) fontSizeClass = 'text-sm sm:text-base';
  else if (textLength > 80) fontSizeClass = 'text-lg sm:text-xl';

  const ZoomPortal = () => createPortal(
    <div className="fixed inset-0 z-[9999] pointer-events-none flex items-center justify-center">
        <div className="bg-white/95 backdrop-blur-sm p-8 rounded-2xl shadow-2xl border-2 border-indigo-500 max-w-sm mx-4 transform scale-105 max-h-[80vh] overflow-y-auto flex flex-col">
            <p className="text-xl font-medium text-slate-800 text-center leading-relaxed my-auto font-sans">
                {statement.text}
            </p>
        </div>
    </div>,
    document.body
  );

  // Overflow Detection
  useEffect(() => {
    const checkOverflow = () => {
        if (textRef.current) {
            const hasOverflow = textRef.current.scrollHeight > textRef.current.clientHeight;
            setIsOverflowing(hasOverflow);
        }
    };
    
    checkOverflow();
    // Re-check on statement change or window resize (typography auto-scale might change things)
    window.addEventListener('resize', checkOverflow);
    return () => window.removeEventListener('resize', checkOverflow);
  }, [statement.text, fontSizeClass]);

  useImperativeHandle(ref, () => ({
    swipe: async (direction) => {
        // Trigger animation matching gestures
        switch(direction) {
            case 'agree':
                await controls.start({ x: 500, opacity: 0, transition: { duration: 0.2 } });
                break;
            case 'disagree':
                await controls.start({ x: -500, opacity: 0, transition: { duration: 0.2 } });
                break;
            case 'neutral':
                await controls.start({ y: 500, opacity: 0, transition: { duration: 0.2 } });
                break;
        }
        onVote(direction);
        // Reset position instantly after voting
        controls.set({ x: 0, y: 0, opacity: 1 });
    }
  }));

  const handleDragEnd = async (_: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    const threshold = 100;
    const { x: offsetX, y: offsetY } = info.offset;

    if (offsetX > threshold) {
      await controls.start({ x: 500, opacity: 0, transition: { duration: 0.2 } });
      onVote('agree');
    } else if (offsetX < -threshold) {
      await controls.start({ x: -500, opacity: 0, transition: { duration: 0.2 } });
      onVote('disagree');
    } else if (offsetY > threshold) {
      await controls.start({ y: 500, opacity: 0, transition: { duration: 0.2 } });
      onVote('neutral');
    } else {
      controls.start({ x: 0, y: 0, transition: { type: 'spring' } });
    }
    // Note: We don't reset controls here immediately as unmount/remount handles it, 
    // but swipe method needs explicit reset if component stays mounted. 
    // In our case, key={currentCard.id} remounts it, so explicit reset in swipe might be redundant but safe.
  };

  return (
    <div className="relative w-full h-full flex items-center justify-center">
      {/* Dummy Cards for Depth Effect */}
      <div className="absolute w-full h-full bg-white rounded-3xl border border-gray-200 shadow-sm scale-90 translate-y-4 opacity-50 z-0" />
      <div className="absolute w-full h-full bg-white rounded-3xl border border-gray-200 shadow-sm scale-95 translate-y-2 opacity-80 z-0" />

      {/* Interactable Card */}
      <motion.div
        drag
        dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }} // Snap back origin
        dragElastic={0.7} // Resistance
        onDragEnd={handleDragEnd}
        animate={controls}
        style={{ x, y, rotate }}
        onMouseEnter={() => isOverflowing && setShowZoom(true)}
        onMouseLeave={() => setShowZoom(false)}
        className="absolute w-full h-full bg-white rounded-3xl border border-gray-200 shadow-xl z-10 flex flex-col items-center justify-center p-6 sm:p-8 cursor-grab active:cursor-grabbing touch-none overflow-hidden"
      >
        {/* Color Overlays */}
        <motion.div 
            style={{ opacity: opacityAgree }}
            className="absolute inset-0 bg-green-100/50 pointer-events-none flex items-center justify-center border-4 border-green-500 rounded-3xl" 
        >
            <span className="text-4xl font-bold text-green-600 tracking-wider rotate-[-12deg] border-4 border-green-600 px-4 py-2 rounded-lg opacity-80">
                AGREE
            </span>
        </motion.div>
        <motion.div 
            style={{ opacity: opacityDisagree }}
            className="absolute inset-0 bg-red-100/50 pointer-events-none flex items-center justify-center border-4 border-red-500 rounded-3xl" 
        >
             <span className="text-4xl font-bold text-red-600 tracking-wider rotate-[12deg] border-4 border-red-600 px-4 py-2 rounded-lg opacity-80">
                DISAGREE
            </span>
        </motion.div>
        <motion.div 
            style={{ opacity: opacityNeutral }}
            className="absolute inset-0 bg-gray-100/50 pointer-events-none border-4 border-gray-500 rounded-3xl" 
        />

        {/* Content - No scroll to avoid drag conflict */}
        <div className="flex-1 w-full flex flex-col p-2 overflow-hidden">
            <p 
                ref={textRef}
                className={`${fontSizeClass} font-medium text-gray-800 text-center select-none m-auto leading-relaxed line-clamp-6 sm:line-clamp-none`}
            >
              {statement.text}
            </p>
        </div>

        {/* Zoom Trigger Info - ONLY if overflowing */}
        {isOverflowing && (
            <div className="absolute bottom-4 right-6 opacity-40">
                <span className="text-lg">🔍</span>
            </div>
        )}
      </motion.div>

      {showZoom && <ZoomPortal />}
    </div>
  );
});

export default CardStack;
