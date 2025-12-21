
/*
 * Open-Q - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

// Imports
import React, { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
    ZoomIn, ZoomOut, RotateCcw,
    Check, X,
    Smile, Meh, Frown
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';
import SortableCard from './SortableCard';
import DroppableSlot from './DroppableSlot';
import { useGridZoom } from '../hooks/useGridZoom';
import { useGridCalculations } from '../hooks/useGridCalculations';
import { useDeckManagement } from '../hooks/useDeckManagement';
import WorkbenchPanel from './WorkbenchPanel';


interface GridSortProps {
  agreeCards: { id: number; text: string }[];
  disagreeCards: { id: number; text: string }[];
  neutralCards: { id: number; text: string }[];
  gridColumns: { score: number; capacity: number }[];
  renderSlotContent: (col: number, row: number, dimensions: { width: number, height: number }) => React.ReactNode;
  onReset?: () => void;
  selectedCardId?: number | null;
  onCardClick?: (id: number) => void;
  onSlotClick?: (col: number, row: number) => void;
  onDimensionsChange?: (dimensions: { width: number, height: number }) => void;
  forcedTipsClosed?: boolean;
  disableHoverZoom?: boolean;
  onZoomChange?: (scale: number) => void;
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
  onSlotClick,
  onDimensionsChange,
  forcedTipsClosed = false,
  disableHoverZoom = false,
  onZoomChange
}) => {
  const { t } = useTranslation();
  
  // Deck Management Hook
  const { 
      activePile, 
      setActivePile, 
      activeCards, 
      deckHeight, 
      hasPerformedZonalFocus, 
      setHasPerformedZonalFocus 
  } = useDeckManagement({
      agreeCards,
      disagreeCards,
      neutralCards
  });

  const [smartFocusActive, setSmartFocusActive] = useState(false); 
  const [dimmingActive, setDimmingActive] = useState(false);       
  const [closedTips, setClosedTips] = useState({ extremes: false, vertical: false });
  const [autoFitEnabled, setAutoFitEnabled] = useState(true); 

  // Grid Calculations Hook
  const { wrapperRef, cardDimensions } = useGridCalculations({
      gridColumns,
      selectedCardId,
      onDimensionsChange
  });

  const [isMobile, setIsMobile] = useState(false);



  useEffect(() => {
      const checkMobile = () => setIsMobile(window.innerWidth < 1024);
      checkMobile();
      window.addEventListener('resize', checkMobile);
      return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const isDeckCollapsed = isMobile && !!selectedCardId;

  // Refs for Zoom Hook (wrapperRef is now provided by useGridCalculations)
  const contentRef = useRef<HTMLDivElement>(null);
  const pyramidRef = useRef<HTMLDivElement>(null);

  // Zoom Hook
  const { transformRef, performAutoFit, zoomIn, zoomOut, onTransformed } = useGridZoom({
      wrapperRef,
      contentRef,
      pyramidRef,
      gridColumns,
      activePile,
      activePileCount: getActiveCards().length,
      hasPerformedZonalFocus,
      setDimmingActive,
      onZoomChange
  });

  const getColumnTint = (score: number) => {
      if (score <= -3) return 'bg-red-50/50';
      if (score < 0) return 'bg-orange-50/30';
      if (score === 0) return 'bg-slate-50';
      if (score >= 3) return 'bg-green-50/50';
      if (score > 0) return 'bg-emerald-50/30';
      return 'bg-transparent';
  };
  
  const getLegendFontSize = (maxLen: number) => {
    if (maxLen < 12) return 'text-xl sm:text-2xl'; 
    if (maxLen < 25) return 'text-lg sm:text-xl';
    return 'text-base sm:text-lg';
  };
  
  const isColumnDimmed = (score: number) => {
      if (!dimmingActive) return false; 
      if (activePile === 'disagree' && score > 0) return true;
      if (activePile === 'agree' && score < 0) return true;
      if (activePile === 'neutral' && Math.abs(score) >= 3) return true; 
      return false;
  };



  useEffect(() => {
      // 1. Perform initial auto-fit
      const tFit = setTimeout(() => performAutoFit(), 100);

      // 2. Activate Dimming immediately for guidance
      setDimmingActive(true);

      // 3. Activate Tips after 2s
      const tFocus = setTimeout(() => {
          setSmartFocusActive(true);
      }, 2000);

      // 4. Deactivate Dimming after 5s total
      const tDimEnd = setTimeout(() => {
          setDimmingActive(false);
      }, 5000);
      return () => { clearTimeout(tFit); clearTimeout(tFocus); clearTimeout(tDimEnd); };
  }, [performAutoFit]); 

  // Responsive: Close tips and disable autofit on mobile selection
  useEffect(() => {
    if (selectedCardId && window.innerWidth < 1024) {
        setClosedTips({ extremes: true, vertical: true });
        setAutoFitEnabled(false);
    }
  }, [selectedCardId]);

  useEffect(() => { setAutoFitEnabled(true); }, [activePile]);



  useEffect(() => {
     if (!autoFitEnabled) return;
     const t = setTimeout(performAutoFit, 100);
     return () => clearTimeout(t);
  }, [cardDimensions, autoFitEnabled, performAutoFit]);

  // 4. Derived: active statement for the hub
  const selectedCards = [...agreeCards, ...disagreeCards, ...neutralCards];
  const selectedCard = selectedCardId ? selectedCards.find(c => c.id === selectedCardId) : null;

  const renderDeckCards = () => {
    return activeCards.length > 0 ? activeCards.map(card => (
        <motion.div key={card.id} layout initial={{ x: 20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: -20, opacity: 0 }} className="flex-none w-[130px] sm:w-[140px] lg:w-full">
               <SortableCard id={card.id} text={card.text} variant="compact" isSelected={selectedCardId === card.id} onClick={() => onCardClick?.(card.id)} aspectRatio={cardDimensions.width / cardDimensions.height} disableHoverZoom={disableHoverZoom || (typeof window !== 'undefined' && window.innerWidth < 1024)} />
        </motion.div>
    )) : (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center text-slate-300 flex flex-col items-center gap-2">
            <Check size={24} className="text-green-400" />
            <span className="text-sm font-medium">{t('fine.deck.all_placed')}</span>
        </motion.div>
    );
  };

  return (
    <div className="flex flex-col lg:flex-row h-full bg-slate-50 w-full max-w-[1920px] mx-auto overflow-hidden relative">
      
       {/* PANEL: THE GRID (Canvas) */}
      <div className="flex-1 min-h-0 bg-slate-50 relative flex flex-col overflow-hidden transition-all duration-300"
      >
            {/* Desktop-only Instruction */}
            <div className="hidden lg:flex min-h-[60px] flex-none bg-white border-b border-gray-200 items-center justify-center px-4 shadow-sm z-20">
                <span className="text-lg font-bold text-slate-700 text-center leading-tight">
                    {t('fine.toolbar.desktop')}
                </span>
            </div>

            <div className="flex-1 w-full h-full relative overflow-hidden bg-slate-100 cursor-grab active:cursor-grabbing" ref={wrapperRef}>
                <div className="absolute top-4 right-4 z-50 flex flex-col gap-1 bg-white/90 backdrop-blur p-1.5 rounded-lg border border-slate-200 shadow-md">
                        <button onClick={zoomIn} className="p-2 hover:bg-slate-100 rounded text-slate-600" aria-label={t('fine.toolbar.zoom_in')}>
                            <ZoomIn size={20} />
                        </button>
                        <button onClick={zoomOut} className="p-2 hover:bg-slate-100 rounded text-slate-600" aria-label={t('fine.toolbar.zoom_out')}>
                            <ZoomOut size={20} />
                        </button>
                        <div className="h-px bg-slate-200 my-0.5"></div>
                        <button onClick={performAutoFit} className="p-2 hover:bg-slate-100 rounded text-slate-600" aria-label={t('fine.toolbar.fit_screen')}>
                            <RotateCcw size={20} />
                        </button>
                </div>

                {smartFocusActive && (
                    <div className="absolute top-4 left-4 z-40 max-w-[85vw] md:max-w-sm pointer-events-none select-none flex flex-col gap-2">
                        <AnimatePresence mode="popLayout">
                            {!closedTips.extremes && !forcedTipsClosed && (
                                <motion.div 
                                    key="tip-extremes" drag="x" dragConstraints={{ left: 0, right: 0 }} dragElastic={0.8}
                                    onDragEnd={(_, info) => { if (Math.abs(info.offset.x) > 20 || Math.abs(info.velocity.x) > 50) setClosedTips(prev => ({ ...prev, extremes: true })); }}
                                    initial={{ opacity: 0, x: -50 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 500, rotate: 10 }}
                                    className="bg-white/90 backdrop-blur-sm border border-blue-100 shadow-sm rounded-xl p-3 flex gap-2 pr-8 relative pointer-events-auto cursor-grab active:cursor-grabbing dnd-prevent-pan touch-none"
                                >
                                    <span>💡</span>
                                    <p className="text-sm text-slate-600 leading-relaxed font-medium">{t('fine.tips.extremes')}</p>
                                    <button onClick={() => setClosedTips(prev => ({ ...prev, extremes: true }))} className="absolute top-2 right-2 p-1 text-slate-400 hover:text-slate-600"><X size={14} /></button>
                                </motion.div>
                            )}
                            {!closedTips.vertical && !forcedTipsClosed && (
                                <motion.div 
                                    key="tip-vertical" drag="x" dragConstraints={{ left: 0, right: 0 }} dragElastic={0.8}
                                    onDragEnd={(_, info) => { if (Math.abs(info.offset.x) > 20 || Math.abs(info.velocity.x) > 50) setClosedTips(prev => ({ ...prev, vertical: true })); }}
                                    initial={{ opacity: 0, x: -50 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 500, rotate: -10 }}
                                    className="bg-blue-50/90 backdrop-blur-sm border border-blue-100 shadow-sm rounded-xl p-3 flex gap-2 relative pr-8 pointer-events-auto cursor-grab active:cursor-grabbing dnd-prevent-pan touch-none"
                                >
                                    <span>ℹ️</span>
                                    <p className="text-sm text-blue-800 leading-relaxed font-medium">{t('fine.tips.vertical')}</p>
                                    <button onClick={() => setClosedTips(prev => ({ ...prev, vertical: true }))} className="absolute top-2 right-2 p-1 text-blue-300 hover:text-blue-500"><X size={14} /></button>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                )}

                <TransformWrapper
                    ref={transformRef} initialScale={0.8} minScale={0.1} maxScale={3.0}
                    centerOnInit={false} limitToBounds={false} wheel={{ step: 0.1 }}
                    panning={{ excluded: ['dnd-prevent-pan'] }} doubleClick={{ disabled: true }}
                    onTransformed={onTransformed}
                >
                    <TransformComponent wrapperClass="w-full h-full !overflow-hidden">
                        <div data-testid="grid-container" ref={contentRef} className="flex flex-col items-center gap-8 px-4 relative">
                            <div ref={pyramidRef} className="flex flex-row gap-2 items-end flex-nowrap" role="grid">
                                {gridColumns.map((col, colIndex) => (
                                    <div key={col.score} id={`column-${col.score}`} className={`flex flex-col gap-2 items-center flex-shrink-0 transition-opacity duration-1000 ${isColumnDimmed(col.score) ? 'opacity-50 grayscale-[30%]' : 'opacity-100'}`}>
                                        <div className="flex flex-col gap-2" role="row">
                                            {Array.from({ length: col.capacity }).map((_, rowIndex) => (
                                                <DroppableSlot
                                                    key={`${colIndex}-${rowIndex}`} id={`slot_${colIndex}_${rowIndex}`}
                                                    onClick={() => onSlotClick?.(colIndex, rowIndex)}
                                                    style={{ width: cardDimensions.width, height: cardDimensions.height }}
                                                    className={`border-2 border-dashed border-slate-300/80 rounded-2xl flex items-center justify-center ${getColumnTint(col.score)} bg-opacity-40 transition-all duration-300 shadow-sm ${selectedCardId ? 'animate-pulse ring-2 ring-blue-400/30 cursor-pointer hover:bg-blue-50' : ''}`}
                                                >
                                                    {renderSlotContent(colIndex, rowIndex, cardDimensions)}
                                                </DroppableSlot>
                                            ))}
                                        </div>
                                        <div id={`footer-${col.score}`} className="text-slate-400 mt-1">
                                            <span className="text-3xl font-bold leading-none">{col.score > 0 ? `+${col.score}` : col.score}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                            <div className="w-full flex flex-col gap-3 pt-4 border-t border-slate-200/50">
                                 <div className="flex justify-between items-end w-full font-bold uppercase tracking-widest opacity-60 px-2 gap-4">
                                     {(() => {
                                         const l1 = t('fine.legend.disagree');
                                         const l2 = t('fine.legend.neutral');
                                         const l3 = t('fine.legend.agree');
                                         const fs = getLegendFontSize(Math.max(l1.length, l2.length, l3.length));
                                         return (
                                             <>
                                                 <span className={`text-red-600 flex-1 text-left whitespace-nowrap overflow-hidden text-ellipsis ${fs}`}>{l1}</span>
                                                 <span className={`text-slate-400 flex-1 text-center whitespace-nowrap overflow-hidden text-ellipsis ${fs}`}>{l2}</span>
                                                 <span className={`text-green-600 flex-1 text-right whitespace-nowrap overflow-hidden text-ellipsis ${fs}`}>{l3}</span>
                                             </>
                                         );
                                     })()}
                                 </div>
                                 <div className="w-full h-5 bg-gradient-to-r from-red-500/30 via-slate-200 to-green-500/30 rounded-full relative backdrop-blur-sm">
                                     <div className="absolute left-1/2 top-0 bottom-0 w-0.5 bg-slate-400/50 -translate-x-1/2"></div>
                                     <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-red-400/50"></div>
                                     <div className="absolute right-0 top-0 bottom-0 w-0.5 bg-green-400/50"></div>
                                 </div>
                            </div>
                        </div>
                    </TransformComponent>
                </TransformWrapper>
            </div>
      </div>

       {/* PANEL: WORKBENCH STAGE (Bottom Fixed) */}
       <AnimatePresence>
            {selectedCardId && isMobile && (
                <WorkbenchPanel 
                    key="workbench"
                    card={selectedCard || null}
                    onClose={() => onCardClick?.(selectedCardId)}
                    height={deckHeight}
                    cardDimensions={cardDimensions}
                />
            )}
       </AnimatePresence>

       {/* PANEL: SOURCE INVENTORY (Deck) */}
       {/* Only show Deck if Workbench is NOT active (OR show it hidden/collapsed) */}
       {/* To preserve state, we keep it rendered but hidden or minimized? */}
       {/* Actually, for simplicity/performance in this revamp, lets conditionally render or use display:none */}
      <div 
        className={`
          w-full lg:w-[360px] flex-none 
          bg-white lg:border-r border-t lg:border-t-0 border-gray-200 
          z-40 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)] lg:shadow-md 
          flex flex-col lg:h-full transition-all duration-300
          overflow-hidden pb-safe lg:pb-0
          ${selectedCardId && isMobile ? 'hidden' : ''} 
        `}
        style={{ 
            height: isMobile 
                ? (isDeckCollapsed ? 'auto' : `${deckHeight}px`) 
                : 'auto' 
        }}
      >
              <div className="flex-none px-2 lg:px-3 pt-2 lg:pt-4 pb-2 border-b border-gray-100 bg-white z-20">
                  <h3 className={`text-sm font-bold text-slate-400 uppercase tracking-wider mb-2 px-1 hidden lg:block`}>{t('fine.deck.title')}</h3>

                  {!isDeckCollapsed && (
                      <div className="flex gap-3 w-full mb-4 px-2 justify-center" role="tablist">
                       {['disagree', 'neutral', 'agree'].map((pile) => {
                           const isActive = activePile === pile;
                           const cards = pile === 'disagree' ? disagreeCards : pile === 'neutral' ? neutralCards : agreeCards;
                           const Icon = pile === 'disagree' ? Frown : pile === 'neutral' ? Meh : Smile;
                           const col = pile === 'disagree' ? 'red' : pile === 'neutral' ? 'slate' : 'green';
                           return (
                               <button key={pile} onClick={() => { setActivePile(pile as PileType); setHasPerformedZonalFocus(true); }}
                                   role="tab"
                                   aria-selected={isActive}
                                   aria-label={`${t(`common.${pile}`)}: ${cards.length} ${t('common.cards')}`}
                                   className={`relative group flex-1 min-w-[80px] h-14 lg:h-auto lg:aspect-[4/5] rounded-lg border-2 shadow-sm transition-all duration-200 flex flex-col items-center justify-center p-1
                                     ${isActive ? `bg-${col}-50 border-${col}-300 shadow-md scale-105 z-10` : `bg-white border-slate-200 opacity-80`}
                                   `}
                                >
                                  <Icon size={24} className={`lg:hidden text-${col}-500`} />
                                  <span className={`hidden lg:block text-[10px] font-bold uppercase tracking-wider mb-1 ${isActive ? `text-${col}-700` : 'text-slate-400'}`}>{t(`common.${pile}`)}</span>
                                  <div className={`hidden lg:block w-8 h-1 rounded-full mb-1 ${isActive ? `bg-${col}-200` : 'bg-slate-100'}`}></div>
                                  <div className={`hidden lg:block w-6 h-1 rounded-full ${isActive ? `bg-${col}-200` : 'bg-slate-100'}`}></div>
                                  <motion.span key={cards.length} className={`absolute -top-2 -right-2 w-6 h-6 flex items-center justify-center rounded-full text-xs font-bold border-2 shadow-sm z-20 ${isActive ? `bg-${col}-600 text-white border-white` : 'bg-slate-100 text-slate-500 border-white'}`}>
                                      {cards.length}
                                  </motion.span>
                               </button>
                           );
                       })}
                  </div>
                  )}
              </div>

              {!isDeckCollapsed && (
                <motion.div key={activePile} initial={{ backgroundColor: activePile === 'disagree' ? '#fee2e2' : activePile === 'agree' ? '#dcfce7' : '#f1f5f9' }} animate={{ backgroundColor: 'rgba(248, 250, 252, 0.5)' }} transition={{ duration: 0.8 }}
                    className="flex-1 p-2 flex flex-row gap-2 overflow-x-auto lg:overflow-x-hidden lg:overflow-y-auto min-h-0 custom-scrollbar lg:grid lg:grid-cols-2 lg:content-start lg:gap-2"
                >
{renderDeckCards()}
              </motion.div>
              )}
              {(onReset && !isDeckCollapsed) && (
                  <div className="flex-none p-2 border-t border-gray-100 bg-slate-50/50 hidden lg:flex justify-center z-10">
                      <button onClick={onReset} className="text-xs font-bold text-slate-400 hover:text-red-500 px-3 py-1.5 rounded hover:bg-red-50">{t('fine.deck.reset')}</button>
                  </div>
              )}
      </div>
    </div>
  );
};

export default GridSort;
