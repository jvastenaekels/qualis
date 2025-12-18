import React, { useState, useEffect } from 'react';
import DroppableSlot from './DroppableSlot';
import SortableCard from './SortableCard';
import { SortableContext, rectSortingStrategy } from '@dnd-kit/sortable';
import { Check, ZoomIn, ZoomOut, RotateCcw, X, Frown, Meh, Smile } from 'lucide-react';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';
import { useTranslation, Trans } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';

interface GridSortProps {
  agreeCards: { id: number; text: string }[];
  disagreeCards: { id: number; text: string }[];
  neutralCards: { id: number; text: string }[];
  gridColumns: { score: number; capacity: number }[];
  responses: unknown;
  renderSlotContent: (col: number, row: number) => React.ReactNode;
  onReset?: () => void;
  selectedCardId?: number | null;
  onCardClick?: (id: number) => void;
  onSlotClick?: (col: number, row: number) => void;
}

type PileType = 'disagree' | 'neutral' | 'agree';

const GridSort: React.FC<GridSortProps> = ({
  agreeCards,
  disagreeCards,
  neutralCards,
  gridColumns,
  renderSlotContent,
  onReset,
  selectedCardId,
  onCardClick,
  onSlotClick
}) => {
  const { t } = useTranslation();
  const [activePile, setActivePile] = useState<PileType>('disagree');
  const [smartFocusActive, setSmartFocusActive] = useState(false); // Controls Tips
  const [dimmingActive, setDimmingActive] = useState(false);       // Controls Dimming
  const [closedTips, setClosedTips] = useState({ extremes: false, vertical: false });
  const [hasPerformedZonalFocus, setHasPerformedZonalFocus] = useState(false);

  // Initial Auto-Fit & Delayed Smart Focus
  useEffect(() => {
      // 1. Fit to screen immediately (small tick for refs)
      const tFit = setTimeout(() => performAutoFit(), 100);

      // 2. Activate Smart Focus (Tips + Dimming) after 2s
      const tFocus = setTimeout(() => {
          setSmartFocusActive(true);
          setDimmingActive(true);
      }, 2000);

      // 3. Deactivate Dimming after 10s more (Total 12s from start)
      const tDimEnd = setTimeout(() => {
          setDimmingActive(false);
      }, 12000);

      return () => {
          clearTimeout(tFit);
          clearTimeout(tFocus);
          clearTimeout(tDimEnd);
      };
  }, []); 

  const [cardDimensions, setCardDimensions] = useState({ width: 160, height: 96 }); // Dynamic Card Sizing
  const getActiveCards = () => {
      switch(activePile) {
          case 'agree': return agreeCards;
          case 'disagree': return disagreeCards;
          case 'neutral': return neutralCards;
          default: return [];
      }
  };
  const activeCards = getActiveCards();

  // ... (Column Tint, Refs, AutoFit Logic remain same) ...
  // Column Tint Helper
  const getColumnTint = (score: number) => {
      if (score <= -3) return 'bg-red-50/50';
      if (score < 0) return 'bg-orange-50/30';
      if (score === 0) return 'bg-slate-50';
      if (score >= 3) return 'bg-green-50/50';
      if (score > 0) return 'bg-emerald-50/30';
      return 'bg-transparent';
  };
  
  // Legend Label Sizing Helper (Unified for all labels)
  const getLegendFontSize = (maxLen: number) => {
    // Increased sizes for better mobile readability
    if (maxLen < 12) return 'text-base sm:text-xl'; 
    if (maxLen < 25) return 'text-sm sm:text-lg';
    return 'text-xs sm:text-base';
  };
  
  // Zone Highlighting Helper
  const isColumnDimmed = (score: number) => {
      if (!dimmingActive) return false; 
      
      // Logic: Dim the "opposite" side to guide focus
      if (activePile === 'disagree' && score > 0) return true;
      if (activePile === 'agree' && score < 0) return true;
      // For neutral, maybe dim the extremes slightly? Or keep all active?
      // Let's keep all active for neutral to allow broad scanning, 
      // or dim extremes to focus on the "grey area".
      if (activePile === 'neutral' && Math.abs(score) >= 3) return true; 
      return false;
  };
  

  const transformRef = React.useRef<any>(null);
  const wrapperRef = React.useRef<HTMLDivElement>(null);
  const contentRef = React.useRef<HTMLDivElement>(null);
  const pyramidRef = React.useRef<HTMLDivElement>(null);

  // Auto-Fit Logic (Robust)
  const performAutoFit = () => {
      if (!transformRef.current || !wrapperRef.current || !contentRef.current) return;

      const wrapper = wrapperRef.current;
      const content = contentRef.current;
      
      // Get dimensions
      const wrapperW = wrapper.clientWidth;
      const wrapperH = wrapper.clientHeight;
      
      // Content size (native, unscaled)
      // We must measure the inner content. scrollWidth should be accurate if not transformed yet, 
      // but react-zoom-pan-pinch wraps it. 
      // Safest is to rely on 'offset' dimensions of the grid container *if* it weren't scaled?
      // Actually, if we use the helper from the library, it handles the math.
      // But let's trust our refs:
      const contentW = content.offsetWidth; // The rigid grid width
      const contentH = content.offsetHeight;
      
      if (contentW === 0 || contentH === 0) return;

      // Check for mobile (lg breakpoint is 1024px)
      const isMobile = window.innerWidth < 1024;

      if (isMobile) {
          // Mobile: 110% of screen width
          // The wrapper might have padding, but usually on mobile it's full width of the 'canvas' area.
          const scale = (wrapperW * 1.10) / contentW;
          
          // Center Horizontally
          // X = (ContainerWidth - ScaledContentWidth) / 2
          const x = (wrapperW - (contentW * scale)) / 2;
          
          // Align Bottom
          // Y = ContainerHeight - ScaledContentHeight - Padding
          // Use a small padding to sit "just above" the bottom edge
          const y = wrapperH - (contentH * scale) - 20;

          transformRef.current.setTransform(x, y, scale, 200);
      } else {
          // Desktop: Refined Center Fit on the PYRAMID
          const padding = 64; 
          const availableW = wrapperW - padding;
          const availableH = wrapperH - padding;
    
          const scaleX = availableW / contentW;
          const scaleY = availableH / contentH;
          
          const fitScale = Math.min(scaleX, scaleY, 1.2); 
    
          // 1. Calculate general center for content
          let x = (wrapperW - (contentW * fitScale)) / 2;
          const y = (wrapperH - (contentH * fitScale)) / 3.0; // Slightly higher bias for the "Big Picture"

          // 2. Adjust X to center specifically on the PYRAMID if possible
          if (pyramidRef.current) {
              const pyramid = pyramidRef.current;
              const pyramidW = pyramid.offsetWidth;
              const pyramidOffsetLeft = pyramid.offsetLeft; // Offset relative to grid-container
              
              // We want the viewport center to align with the pyramid center
              // Resulting X = (wrapperW / 2) - ((pyramidOffsetLeft + pyramidW / 2) * fitScale)
              x = (wrapperW / 2) - ((pyramidOffsetLeft + (pyramidW / 2)) * fitScale);
          }

          transformRef.current.setTransform(x, y, fitScale, 200);
      }
  };

  /* Safe Calculation of Optimal Size */
  const calculateOptimalSize = React.useCallback(() => {
      if (!wrapperRef.current) return;
      const wrapper = wrapperRef.current;
      const W = wrapper.clientWidth;
      const H = wrapper.clientHeight;
      if (W === 0 || H === 0) return;

      const numCols = gridColumns.length;
      if (numCols === 0) return; // Prevent divide by zero

      const maxRows = Math.max(...gridColumns.map(c => c.capacity || 0));
      if (maxRows === 0) return;

      const screenRatio = W / H;
      const gridStructureRatio = maxRows / numCols;
      const rawGridRatio = screenRatio * gridStructureRatio;
      
      // Balanced Ratio: Weighted average between "perfect grid fit" and "standard landscape"
      const goldenRatio = 1.6;
      let targetCardRatio = (rawGridRatio + goldenRatio) / 2;
      
      // Safety Clamp
      if (!isFinite(targetCardRatio) || isNaN(targetCardRatio)) targetCardRatio = 1.6;
      targetCardRatio = Math.max(1.0, Math.min(targetCardRatio, 2.2)); 
      
      const targetArea = 160 * 96; 
      let newWidth = Math.sqrt(targetArea * targetCardRatio);
      let newHeight = targetArea / newWidth;

      // Ensure finite values
      if (!isFinite(newWidth)) newWidth = 160;
      if (!isFinite(newHeight)) newHeight = 96;
      
      setCardDimensions(prev => {
          // Strict convergence check to prevent loops (1px delta)
          if (Math.abs(prev.width - newWidth) < 1.5 && Math.abs(prev.height - newHeight) < 1.5) return prev;
          return { width: newWidth, height: newHeight };
      });
  }, [gridColumns]);


  
  // Recalculate size on mount/resize
  useEffect(() => {
      // Auto-close tips on mobile when a card is selected
      if (selectedCardId && window.innerWidth < 1024) {
          setClosedTips({ extremes: true, vertical: true });
      }
  }, [selectedCardId]);

  useEffect(() => {
      // Logic for transient transition could go here if needed in the future
  }, [activePile]);

  // Smart Focus: Auto-Pan & Focus Reset on Pile Switch
  useEffect(() => {
    // TRIGGER: First selection/tap activates zonal focus permanently
    if (selectedCardId !== null && !hasPerformedZonalFocus) {
        setHasPerformedZonalFocus(true);
    }
  }, [selectedCardId, hasPerformedZonalFocus]);

  useEffect(() => {
    if (!transformRef.current || !hasPerformedZonalFocus) return;
    
    // 1. GLOBAL VIEW: Reset zoom briefly so user sees the "Big Picture" switch
    const fitTimer = setTimeout(performAutoFit, 30);

    // Reactivate dimming when switching piles to guide the user
    setDimmingActive(true);
    
    // Safety delay to allow render and auto-fit to settle
    const timer = setTimeout(() => {
        const { zoomToElement } = transformRef.current;
        
        let targetId = '';
        // Strategy: Focus on the "Center of the Zone" (Zonal Focus)
        if (activePile === 'disagree') {
            // Target the column closer to center of the disagree zone (-1) to avoid showing too much empty space
            targetId = 'column--1';
            if (!document.getElementById(targetId)) targetId = 'column--2';
        } else if (activePile === 'agree') {
            // Target the column closer to center of the agree zone (+1) to avoid showing too much empty space
            targetId = 'column-1';
            if (!document.getElementById(targetId)) targetId = 'column-2';
        } else {
            // Neutral -> Center Column
            targetId = 'column-0';
        }

        const targetNode = document.getElementById(targetId);
        if (targetNode && wrapperRef.current && pyramidRef.current && contentRef.current) {
            const isMobile = window.innerWidth < 1024;
            const state = transformRef.current.instance.transformState;
            
            // 1. Calculate Target Scale
            // On Mobile: Zoom in by 1.33x from overview
            // On Desktop: Subtle 1.05x zoom for slight emphasis
            const targetScale = isMobile ? (state.scale * 1.33) : (state.scale * 1.05);

            // 2. Manual Coordinate Calculation for PERFECT Centering
            const wrapperW = wrapperRef.current.clientWidth;
            const wrapperH = wrapperRef.current.clientHeight;
            const pyramid = pyramidRef.current;
            const pyramidOffsetLeft = pyramid.offsetLeft;
            
            const targetColumnCenter = targetNode.offsetLeft + (targetNode.offsetWidth / 2);

            // X = (Viewport Midpoint) - (Target Column Center in Global Pyramid Space * scale)
            const targetX = (wrapperW / 2) - ((pyramidOffsetLeft + targetColumnCenter) * targetScale);
            
            // Y = Maintain a consistent vertical position
            // Mobile: Align to Bottom (so spectrum bar is always visible)
            // Desktop: Slightly higher bias for context
            const contentH = contentRef.current.offsetHeight;
            const targetY = isMobile 
                ? (wrapperH - (contentH * targetScale) - 20) 
                : (wrapperH - (contentH * targetScale)) / 3.0; 

            transformRef.current.setTransform(targetX, targetY, targetScale, 500, 'easeOut');
        }

        // Set a timer to deactivate dimming again after guidance is likely absorbed
        const dimTimer = setTimeout(() => {
            setDimmingActive(false);
        }, 8000);

        return () => clearTimeout(dimTimer);
    }, 550); // Increased delay to 550ms to allow performAutoFit (30ms start + 200ms anim) + buffer

    return () => {
        clearTimeout(fitTimer);
        clearTimeout(timer);
    };
  }, [activePile, hasPerformedZonalFocus]);

  React.useEffect(() => {
      // Initial
      calculateOptimalSize();
      
      const wrapper = wrapperRef.current;
      if (!wrapper) return;

      // Debounced Observer
      let rafId: number;
      const observer = new ResizeObserver(() => {
          // Use RAF to throttle to frame rate and prevent sync loops
          cancelAnimationFrame(rafId);
          rafId = requestAnimationFrame(() => {
              calculateOptimalSize();
          });
      });
      observer.observe(wrapper);

      return () => {
          observer.disconnect();
          cancelAnimationFrame(rafId);
      };
  }, [calculateOptimalSize]);

  // Separate AutoFit effect
  useEffect(() => {
     // Wait for DOM
     const t = setTimeout(performAutoFit, 50);
     return () => clearTimeout(t);
  }, [cardDimensions]);

  return (
    // MAIN CONTAINER: Flex Column Reverse for Mobile (Deck at bottom), Row for Desktop
    <div className="flex flex-col-reverse lg:flex-row h-full bg-slate-50 w-full max-w-[1920px] mx-auto overflow-hidden">
      
       {/* ---------------------------------------------------------------------------
          PANEL 1: SOURCE INVENTORY (Deck)
          Mobile: Fixed/Sticky Bottom, Horizontal Scroll.
          Desktop: Left Sidebar, Vertical Scroll.
      --------------------------------------------------------------------------- */}
      <div className="
          w-full lg:w-[320px] flex-none 
          bg-white lg:border-r border-t lg:border-t-0 border-gray-200 
          z-40 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)] lg:shadow-md 
          flex flex-col
          h-auto lg:h-full 
          transition-all duration-300
          pb-safe
      ">
          
              {/* HEADER & TABS */}
              <div className="flex-none px-2 lg:px-3 pt-2 lg:pt-4 pb-2 border-b border-gray-100 bg-white z-20">
                  <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-2 px-1 hidden lg:block">
                      {t('fine.deck.title')}
                  </h3>

              {/* COMPACT TABS */}
              {/* CARD PILES SELECTOR */}
              <div className="flex gap-3 w-full mb-4 px-2 justify-center" role="tablist">
                   {/* Disagree Pile */}
                   <button
                       role="tab"
                       aria-selected={activePile === 'disagree'}
                       aria-label={`${t('common.disagree')}: ${disagreeCards.length} ${t('common.cards', 'cards')}`}
                       onClick={() => {
                           setActivePile('disagree');
                           setHasPerformedZonalFocus(true);
                       }}
                       className={`relative group flex-1 min-w-[80px] h-14 lg:h-auto lg:min-w-0 lg:aspect-[4/5] lg:max-w-[90px] rounded-lg border-2 shadow-sm transition-all duration-200 flex flex-col items-center justify-center p-1
                         ${activePile === 'disagree'
                             ? 'bg-red-50 border-red-300 shadow-md scale-105 z-10'
                             : 'bg-white border-slate-200 hover:border-red-200 hover:bg-slate-50 opacity-80 hover:opacity-100'
                         }
                       `}
                    >
                      {/* Mobile Icon */}
                      <Frown size={24} className="lg:hidden text-red-500" strokeWidth={2.5} aria-hidden="true" />

                      {/* Desktop Text */}
                      <span className={`hidden lg:block text-[10px] font-bold uppercase tracking-wider mb-1 ${activePile === 'disagree' ? 'text-red-700' : 'text-slate-400'}`} aria-hidden="true">
                         {t('common.disagree')}
                      </span>
                      {/* Fake Lines to look like text - Desktop Only */}
                      <div className={`hidden lg:block w-8 h-1 rounded-full mb-1 ${activePile === 'disagree' ? 'bg-red-200' : 'bg-slate-100'}`} aria-hidden="true"></div>
                      <div className={`hidden lg:block w-6 h-1 rounded-full ${activePile === 'disagree' ? 'bg-red-200' : 'bg-slate-100'}`} aria-hidden="true"></div>

                      {/* Badge */}
                      <motion.span
                         key={disagreeCards.length}
                         initial={{ scale: 0.8, opacity: 0.5 }}
                         animate={{ scale: [1.4, 1], opacity: 1 }}
                         transition={{ duration: 0.3, type: "spring" }}
                         className={`absolute -top-2 -right-2 w-6 h-6 flex items-center justify-center rounded-full text-xs font-bold border-2 shadow-sm z-20
                         ${activePile === 'disagree' ? 'bg-red-600 text-white border-white' : 'bg-slate-100 text-slate-500 border-white'}
                      `} aria-hidden="true">
                          {disagreeCards.length}
                      </motion.span>
                   </button>

                   {/* Neutral Pile */}
                   <button
                       role="tab"
                       aria-selected={activePile === 'neutral'}
                       aria-label={`${t('common.neutral')}: ${neutralCards.length} ${t('common.cards', 'cards')}`}
                       onClick={() => {
                           setActivePile('neutral');
                           setHasPerformedZonalFocus(true);
                       }}
                        className={`relative group flex-1 min-w-[80px] h-14 lg:h-auto lg:min-w-0 lg:aspect-[4/5] lg:max-w-[90px] rounded-lg border-2 shadow-sm transition-all duration-200 flex flex-col items-center justify-center p-1
                         ${activePile === 'neutral'
                             ? 'bg-slate-100 border-slate-400 shadow-md scale-105 z-10'
                             : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50 opacity-80 hover:opacity-100'
                         }
                       `}
                    >
                      {/* Mobile Icon */}
                      <Meh size={24} className="lg:hidden text-slate-500" strokeWidth={2.5} aria-hidden="true" />

                      {/* Desktop Text */}
                      <span className={`hidden lg:block text-[10px] font-bold uppercase tracking-wider mb-1 ${activePile === 'neutral' ? 'text-slate-700' : 'text-slate-400'}`} aria-hidden="true">
                         {t('common.neutral')}
                      </span>
                      <div className={`hidden lg:block w-8 h-1 rounded-full mb-1 ${activePile === 'neutral' ? 'bg-slate-300' : 'bg-slate-100'}`} aria-hidden="true"></div>
                      <div className={`hidden lg:block w-6 h-1 rounded-full ${activePile === 'neutral' ? 'bg-slate-300' : 'bg-slate-100'}`} aria-hidden="true"></div>

                      {/* Badge */}
                      <motion.span
                         key={neutralCards.length}
                          initial={{ scale: 0.8, opacity: 0.5 }}
                          animate={{ scale: [1.4, 1], opacity: 1 }}
                          transition={{ duration: 0.3, type: "spring" }}
                         className={`absolute -top-2 -right-2 w-6 h-6 flex items-center justify-center rounded-full text-xs font-bold border-2 shadow-sm z-20
                         ${activePile === 'neutral' ? 'bg-slate-600 text-white border-white' : 'bg-slate-100 text-slate-500 border-white'}
                      `} aria-hidden="true">
                        {neutralCards.length}
                      </motion.span>
                   </button>

                   {/* Agree Pile */}
                   <button
                       role="tab"
                       aria-selected={activePile === 'agree'}
                       aria-label={`${t('common.agree')}: ${agreeCards.length} ${t('common.cards', 'cards')}`}
                       onClick={() => {
                           setActivePile('agree');
                           setHasPerformedZonalFocus(true);
                       }}
                        className={`relative group flex-1 min-w-[80px] h-14 lg:h-auto lg:min-w-0 lg:aspect-[4/5] lg:max-w-[90px] rounded-lg border-2 shadow-sm transition-all duration-200 flex flex-col items-center justify-center p-1
                         ${activePile === 'agree'
                             ? 'bg-green-50 border-green-300 shadow-md scale-105 z-10'
                             : 'bg-white border-slate-200 hover:border-green-200 hover:bg-slate-50 opacity-80 hover:opacity-100'
                         }
                       `}
                    >
                      {/* Mobile Icon */}
                      <Smile size={24} className="lg:hidden text-green-600" strokeWidth={2.5} aria-hidden="true" />

                      {/* Desktop Text */}
                      <span className={`hidden lg:block text-[10px] font-bold uppercase tracking-wider mb-1 ${activePile === 'agree' ? 'text-green-700' : 'text-slate-400'}`} aria-hidden="true">
                         {t('common.agree')}
                      </span>
                      <div className={`hidden lg:block w-8 h-1 rounded-full mb-1 ${activePile === 'agree' ? 'bg-green-200' : 'bg-slate-100'}`} aria-hidden="true"></div>
                      <div className={`hidden lg:block w-6 h-1 rounded-full ${activePile === 'agree' ? 'bg-green-200' : 'bg-slate-100'}`} aria-hidden="true"></div>

                      {/* Badge */}
                      <motion.span
                         key={agreeCards.length}
                          initial={{ scale: 0.8, opacity: 0.5 }}
                          animate={{ scale: [1.4, 1], opacity: 1 }}
                          transition={{ duration: 0.3, type: "spring" }}
                         className={`absolute -top-2 -right-2 w-6 h-6 flex items-center justify-center rounded-full text-xs font-bold border-2 shadow-sm z-20
                         ${activePile === 'agree' ? 'bg-green-600 text-white border-white' : 'bg-slate-100 text-slate-500 border-white'}
                      `} aria-hidden="true">
                         {agreeCards.length}
                      </motion.span>
                   </button>
              </div>
          </div>

          {/* THE SOURCE DECK CONTENT */}
          {/* Mobile: Horizontal Scroll (flex-row). Desktop: Vertical Grid (flex-col). */}
          <motion.div 
            key={activePile}
            initial={{ backgroundColor: activePile === 'disagree' ? '#fee2e2' : activePile === 'agree' ? '#dcfce7' : '#f1f5f9' }}
            animate={{ backgroundColor: 'rgba(248, 250, 252, 0.5)' }} // fading to slate-50/50
            transition={{ duration: 0.5, ease: 'easeOut' }}
            className="flex-1 p-2 overflow-x-auto lg:overflow-x-hidden lg:overflow-y-auto"
          >
              <SortableContext 
                  items={activeCards.map(c => c.id)} 
                  strategy={rectSortingStrategy}
               >
                  <div className={`
                        ${activeCards.length === 0 
                            ? 'flex w-full h-full justify-center items-center' 
                            : 'flex flex-row lg:grid lg:grid-cols-1 2xl:lg:grid-cols-2 gap-2 lg:gap-3'}
                  `}>
                      {activeCards.length > 0 ? activeCards.map(card => (
                          <div key={card.id} className="flex-none w-[120px] sm:w-[140px] lg:w-full">
                              <SortableCard 
                                id={card.id} 
                                text={card.text} 
                                variant="compact" 
                                isSelected={selectedCardId === card.id}
                                onClick={() => onCardClick?.(card.id)}
                            />
                          </div>
                      )) : (
                          <div className="text-center text-slate-300 flex flex-col items-center gap-2">
                              <Check size={24} className="text-green-400" />
                              <span className="text-sm font-medium">{t('fine.deck.all_placed')}</span>
                          </div>
                      )}
                  </div>

               </SortableContext>
          </motion.div>
          
          {/* FOOTER ACTION (Reset) */}
          {onReset && (
              <div className="flex-none p-2 border-t border-gray-100 bg-slate-50/50 hidden lg:flex justify-center">
                  <button 
                      onClick={onReset}
                      className="text-xs font-bold text-slate-400 hover:text-red-500 transition-colors uppercase tracking-wider px-3 py-1.5 rounded hover:bg-red-50"
                  >
                      {t('fine.deck.reset')}
                  </button>
              </div>
          )}
      </div>

       {/* ---------------------------------------------------------------------------
          PANEL 2: THE CANVAS (Interactive Grid)
          Flex-1. Top on Mobile. Right on Desktop.
      --------------------------------------------------------------------------- */}
      <div className="flex-1 h-full bg-slate-50 relative flex flex-col overflow-hidden">
          
           {/* Toolbar Info: Visible on ALL screens now */}
           <div className="py-2 flex-none bg-white border-b border-gray-200 flex items-center justify-center px-4 shadow-sm z-20">
                {/* Mobile Text */}
                <span className="text-base sm:text-xl font-bold text-slate-700 text-center leading-tight lg:hidden">
                   <Trans 
                       i18nKey="fine.toolbar.mobile"
                       components={[
                           <strong className="text-red-600" key="0" />,
                           <strong className="text-green-600" key="1" />
                       ]}
                   />
                </span>
                {/* Desktop Text */}
                <span className="text-lg sm:text-xl font-bold text-slate-700 text-center leading-tight hidden lg:inline">
                   <Trans 
                       i18nKey="fine.toolbar.desktop"
                       components={[
                           <strong className="text-red-600" key="0" />,
                           <strong className="text-green-600" key="1" />
                       ]}
                   />
                </span>
           </div>

           <div className="flex-1 w-full h-full relative overflow-hidden bg-slate-100 cursor-grab active:cursor-grabbing" ref={wrapperRef}>
                
                {/* FLOATING CONTROLS (Top Right now for Mobile Compat) */}
                <div className="absolute top-4 right-4 z-50 flex flex-col gap-1 bg-white/90 backdrop-blur p-1.5 rounded-lg border border-slate-200 shadow-md" role="toolbar" aria-label={t('fine.toolbar.label', 'Grid controls')}>
                        <button onClick={() => transformRef.current?.zoomIn()} className="p-2 hover:bg-slate-100 rounded text-slate-600" aria-label={t('fine.toolbar.zoom_in')}>
                            <ZoomIn size={20} aria-hidden="true" />
                        </button>
                        <button onClick={() => transformRef.current?.zoomOut()} className="p-2 hover:bg-slate-100 rounded text-slate-600" aria-label={t('fine.toolbar.zoom_out')}>
                            <ZoomOut size={20} aria-hidden="true" />
                        </button>
                        <div className="h-px bg-slate-200 my-0.5" aria-hidden="true"></div>
                        <button onClick={performAutoFit} className="p-2 hover:bg-slate-100 rounded text-slate-600" aria-label={t('fine.toolbar.fit_screen')}>
                            <RotateCcw size={20} aria-hidden="true" />
                        </button>
                </div>

                {/* TIPS CONTAINER */}
                {smartFocusActive && (
                    <div className="absolute top-4 left-4 z-40 max-w-[85vw] md:max-w-sm pointer-events-none select-none flex flex-col gap-2" role="status" aria-live="polite">
                        <AnimatePresence mode="popLayout">
                            {/* Tip 1: Extremes */}
                            {!closedTips.extremes && (
                                <motion.div 
                                    key="tip-extremes"
                                    drag="x"
                                    dragConstraints={{ left: 0, right: 0 }}
                                    dragElastic={0.8}
                                    onDragEnd={(_, info) => {
                                        // Ultra sensitivity: 20px distance or 50 velocity
                                        if (Math.abs(info.offset.x) > 20 || Math.abs(info.velocity.x) > 50) {
                                            setClosedTips(prev => ({ ...prev, extremes: true }));
                                        }
                                    }}
                                    initial={{ opacity: 0, x: -50 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, x: 500, rotate: 10, transition: { duration: 0.3 } }}
                                    transition={{ duration: 1.2, ease: "easeOut" }}
                                    className="bg-white/90 backdrop-blur-sm border border-blue-100 shadow-sm rounded-xl p-3 flex gap-2 pr-8 relative pointer-events-auto cursor-grab active:cursor-grabbing dnd-prevent-pan touch-none"
                                >
                                    <span className="text-base select-none" aria-hidden="true">💡</span>
                                    <p className="text-sm text-slate-600 leading-relaxed font-medium">
                                        {t('fine.tips.extremes')}
                                    </p>
                                    <button 
                                        onClick={() => setClosedTips(prev => ({ ...prev, extremes: true }))}
                                        className="absolute top-2 right-2 p-1 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 transition-colors"
                                        aria-label={t('common.close', 'Close tip')}
                                    >
                                        <X size={14} aria-hidden="true" />
                                    </button>
                                </motion.div>
                            )}
                            
                            {/* Tip 2: Vertical Order */}
                            {!closedTips.vertical && (
                                <motion.div 
                                    key="tip-vertical"
                                    drag="x"
                                    dragConstraints={{ left: 0, right: 0 }}
                                    dragElastic={0.8}
                                    onDragEnd={(_, info) => {
                                        if (Math.abs(info.offset.x) > 20 || Math.abs(info.velocity.x) > 50) {
                                            setClosedTips(prev => ({ ...prev, vertical: true }));
                                        }
                                    }}
                                    initial={{ opacity: 0, x: -50 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, x: 500, rotate: -10, transition: { duration: 0.3 } }}
                                    transition={{ duration: 1.5, ease: "easeOut", delay: 0.3 }}
                                    className="bg-blue-50/90 backdrop-blur-sm border border-blue-100 shadow-sm rounded-xl p-3 flex gap-2 relative pr-8 pointer-events-auto cursor-grab active:cursor-grabbing dnd-prevent-pan touch-none"
                                >
                                    <span className="text-base select-none" aria-hidden="true">ℹ️</span>
                                    <p className="text-sm text-blue-800 leading-relaxed font-medium">
                                        {t('fine.tips.vertical')}
                                    </p>
                                    <button 
                                        onClick={() => setClosedTips(prev => ({ ...prev, vertical: true }))}
                                        className="absolute top-2 right-2 p-1 text-blue-300 hover:text-blue-500 rounded-full hover:bg-blue-100/50 transition-colors"
                                        aria-label={t('common.close', 'Close tip')}
                                    >
                                        <X size={14} aria-hidden="true" />
                                    </button>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                )}

                <TransformWrapper
                    ref={transformRef}
                    initialScale={0.8}
                    minScale={0.1}
                    maxScale={3.0}
                    centerOnInit={false}
                    limitToBounds={false}
                    wheel={{ step: 0.1 }}
                    panning={{ excluded: ['dnd-prevent-pan'] }}
                >
                    {() => (
                        <TransformComponent 
                            wrapperClass="w-full h-full !overflow-hidden" 
                            contentClass="" 
                        >
                            <div 
                                data-testid="grid-container"
                                ref={contentRef}
                                className="flex flex-col items-center gap-8 px-4 relative"
                            >
                                {/* THE PYRAMID GRID */}
                                <div 
                                    ref={pyramidRef}
                                    className="flex flex-row gap-2 items-end flex-nowrap"
                                    role="grid"
                                    aria-label={t('fine.grid.label', 'Sorting Grid')}
                                >
                                    {gridColumns.map((col, colIndex) => {
                                    const score = col.score;
                                    const columnTint = getColumnTint(score);

                                    return (
                                        <div  
                                            key={score} 
                                            id={`column-${score}`} // ID for Smart Focus
                                            className={`
                                                flex flex-col gap-2 items-center flex-shrink-0 transition-opacity duration-1000
                                                ${isColumnDimmed(score) ? 'opacity-50 grayscale-[30%]' : 'opacity-100'}
                                            `}
                                            aria-label={`${t('fine.grid.column', 'Column')} ${score}`}
                                        >
                                                
                                                {/* Slots Column */}
                                                <div className="flex flex-col gap-2" role="row">
                                                    {Array.from({ length: col.capacity }).map((_, rowIndex) => (
                                                        <DroppableSlot
                                                            key={`${colIndex}-${rowIndex}`}
                                                            id={`slot_${colIndex}_${rowIndex}`}
                                                            onClick={() => onSlotClick?.(colIndex, rowIndex)}
                                                            style={{ 
                                                                width: cardDimensions.width, 
                                                                height: cardDimensions.height 
                                                            }}
                                                            className={`
                                                                border-2 border-dashed border-slate-300/80 rounded-xl 
                                                                flex items-center justify-center
                                                                ${columnTint} bg-opacity-40
                                                                transition-all duration-300
                                                                shadow-sm
                                                                ${selectedCardId ? 'animate-pulse ring-2 ring-blue-400/30 cursor-pointer hover:bg-blue-50' : ''}
                                                            `}
                                                            role="gridcell"
                                                            aria-label={`${t('fine.grid.slot', 'Slot')} ${rowIndex + 1} ${t('fine.grid.column', 'in column')} ${score}`}
                                                        >
                                                            {renderSlotContent(colIndex, rowIndex)}
                                                        </DroppableSlot>
                                                    ))}
                                                </div>

                                                {/* Column Footer */}
                                                <div 
                                                    id={`footer-${score}`} // Specific ID for Smart Focus Baseline
                                                    className="text-slate-400 mt-1"
                                                    aria-hidden="true"
                                                >
                                                    <span className="text-3xl font-bold leading-none">{score > 0 ? `+${score}` : score}</span>
                                                </div>
                                        </div>
                                    );
                                })}
                                </div>

                                    {/* 2. THE BOTTOM SPECTRUM LEGEND */}
                                    <div className="w-full max-w-[90%] flex flex-col gap-3 pt-4 border-t border-slate-200/50" role="complementary" aria-label={t('fine.legend.label', 'Spectrum legend')}>
                                         {/* Labels */}
                                          <div className="flex justify-between items-end w-full font-bold uppercase tracking-widest opacity-60 px-2 gap-4">
                                              {(() => {
                                                  const label1 = t('fine.legend.disagree');
                                                  const label2 = t('fine.legend.neutral');
                                                  const label3 = t('fine.legend.agree');
                                                  const maxLen = Math.max(label1.length, label2.length, label3.length);
                                                  const fontSizeClass = getLegendFontSize(maxLen);
                                                  
                                                  return (
                                                      <>
                                                          <span className={`text-red-600 flex-1 text-left whitespace-nowrap overflow-hidden text-ellipsis ${fontSizeClass}`}>
                                                            {label1}
                                                          </span>
                                                          <span className={`text-slate-400 flex-1 text-center whitespace-nowrap overflow-hidden text-ellipsis ${fontSizeClass}`}>
                                                            {label2}
                                                          </span>
                                                          <span className={`text-green-600 flex-1 text-right whitespace-nowrap overflow-hidden text-ellipsis ${fontSizeClass}`}>
                                                            {label3}
                                                          </span>
                                                      </>
                                                  );
                                              })()}
                                          </div>
                                         {/* Gradient Bar */}
                                         <div className="w-full h-3 bg-gradient-to-r from-red-500/30 via-slate-200 to-green-500/30 rounded-full relative backdrop-blur-sm" aria-hidden="true">
                                             {/* Center Tick */}
                                             <div className="absolute left-1/2 top-0 bottom-0 w-0.5 bg-slate-400/50 -translate-x-1/2"></div>
                                             {/* End Ticks */}
                                             <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-red-400/50"></div>
                                             <div className="absolute right-0 top-0 bottom-0 w-0.5 bg-green-400/50"></div>
                                         </div>
                                    </div>
                                </div>
                        </TransformComponent>
                    )}
                </TransformWrapper>
           </div>
      </div>

    </div>
  );
};

export default GridSort;
