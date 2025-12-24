/*
 * Open-Q - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

// Imports
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
    ZoomIn, ZoomOut, RotateCcw,
    Check, X, Eye,
    Smile, Meh, Frown, HelpCircle,
    Lightbulb, Sparkles, Target
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';
import SortableCard from './SortableCard';
import DroppableSlot from './DroppableSlot';
import { useGridZoom } from '../hooks/useGridZoom';
import { useGridCalculations } from '../hooks/useGridCalculations';
import { useDeckManagement } from '../hooks/useDeckManagement';
import { useUIStore } from '../store/useUIStore';
import { useResponseStore } from '../store/useResponseStore';
import type { InteractionUtils } from '../hooks/useFineSortDrag';


interface GridSortProps {
  agreeCards: { id: number; text: string }[];
  disagreeCards: { id: number; text: string }[];
  neutralCards: { id: number; text: string }[];
  gridColumns: { score: number; capacity: number }[];
  renderSlotContent: (col: number, row: number, dimensions: { width: number, height: number }) => React.ReactNode;
  onReset?: () => void;
  selectedCardId?: number | null;
  selectedCard?: { id: number, text: string } | null;
  activeCard?: { id: number; text: string } | null;
  onCardClick?: (id: number) => void;
  onSlotClick?: (col: number, row: number) => void;
  onDimensionsChange?: (dimensions: { width: number, height: number }) => void;
  disableHoverZoom?: boolean;
  onZoomChange?: (zoom: number) => void;
  onTransformChange?: () => void;
  onInteractionUtils?: (utils: InteractionUtils) => void;
  isAllPlaced?: boolean;
  onValidate?: () => void;
}

type PileType = 'disagree' | 'neutral' | 'agree';

const GridSort: React.FC<GridSortProps> = React.memo(({
  agreeCards,
  disagreeCards,
  neutralCards,
  gridColumns,
  renderSlotContent,
  onReset,
  selectedCardId,
  selectedCard: selectedCardProp,
  onCardClick,
  onSlotClick,
  onDimensionsChange,
  disableHoverZoom = false,
  onZoomChange,
  onTransformChange,
  onInteractionUtils,
  isAllPlaced = false,
  onValidate,
  activeCard
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
  
  const qsortResponses = useResponseStore((state) => state.qsort);
  const selectedCard = selectedCardProp;

  const hoveredCard = useUIStore((state) => state.hoveredCard);
  const [autoFitEnabled, setAutoFitEnabled] = useState(true); 
 

  const [showHelpModal, setShowHelpModal] = useState(false);
  const [methodologyStep, setMethodologyStep] = useState(0);
  const methodologyTips = [
      t('fine.workbench.methodology.extremes'),
      t('fine.workbench.methodology.vertical'),
      t('fine.workbench.methodology.interaction')
  ];

  useEffect(() => {
      if (activeCard || hoveredCard || selectedCard) return;
      const interval = setInterval(() => {
          setMethodologyStep(prev => (prev + 1) % methodologyTips.length);
      }, 6000);
      return () => clearInterval(interval);
  }, [activeCard, hoveredCard, selectedCard, methodologyTips.length]);

  // Grid Calculations Hook
  const { wrapperRef, cardDimensions } = useGridCalculations({
      gridColumns,
      selectedCardId,
      onDimensionsChange
  });

  const [isMobile, setIsMobile] = useState(typeof window !== 'undefined' ? window.innerWidth < 1024 : false);

  useEffect(() => {
      const checkMobile = () => setIsMobile(window.innerWidth < 1024);
      checkMobile();
      window.addEventListener('resize', checkMobile);
      return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const isDeckCollapsed = false; // Never collapse deck anymore as per user request

  // Refs for Zoom Hook (wrapperRef is now provided by useGridCalculations)
  const contentRef = useRef<HTMLDivElement>(null);
  const pyramidRef = useRef<HTMLDivElement>(null);

  // Zoom Hook
  const { 
    zoomIn, 
    zoomOut, 
    performAutoFit, 
    transformRef, 
    onTransformed 
  } = useGridZoom({
      wrapperRef,
      contentRef,
      pyramidRef,
      gridColumns,
      activePile,
      activePileCount: activeCards.length,
      hasPerformedZonalFocus,
      onZoomChange,
      onTransformChange
  });

  // Pass interaction utils up to parent
  useEffect(() => {
    if (onInteractionUtils) {
        onInteractionUtils({
            zoomIn,
            zoomOut,
            performAutoFit,
            transformRef: transformRef as any,
            wrapperRef,
            contentRef
        });
    }
  }, [onInteractionUtils, zoomIn, zoomOut, performAutoFit, transformRef, wrapperRef, contentRef]);

  const getColumnTint = useCallback((score: number) => {
      if (score <= -3) return 'bg-red-50/50';
      if (score < 0) return 'bg-orange-50/30';
      if (score === 0) return 'bg-slate-50/50';
      if (score < 3) return 'bg-green-50/30';
      if (score <= 4) return 'bg-green-50/50';
      return 'bg-transparent';
  }, []);
  
  const getLegendFontSize = useCallback((maxLen: number) => {
    if (maxLen < 12) return 'text-xl sm:text-2xl'; 
    if (maxLen < 25) return 'text-lg sm:text-xl';
    return 'text-base sm:text-lg';
  }, []);
  

  useEffect(() => {
      // Perform initial auto-fit
      const tFit = setTimeout(() => performAutoFit(), 100);
      return () => clearTimeout(tFit);
  }, [performAutoFit]); 

  // Responsive: Disable autofit on mobile selection
  useEffect(() => {
    if (selectedCardId && window.innerWidth < 1024) {
        setAutoFitEnabled(false);
    }
  }, [selectedCardId]);

  useEffect(() => { setAutoFitEnabled(true); }, [activePile]);

  useEffect(() => {
     if (!autoFitEnabled) return;
     const t = setTimeout(performAutoFit, 100);
     return () => clearTimeout(t);
  }, [cardDimensions, autoFitEnabled, performAutoFit]);

  // Derived: active statement for the hub
  // const selectedCard = selectedCardProp; (already moved up)

  const renderDeckCards = useCallback(() => {
    return activeCards.length > 0 ? activeCards.map(card => (
        <motion.div key={card.id} layout initial={{ x: 20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: -20, opacity: 0 }} className="flex-none w-[130px] sm:w-[140px] lg:w-full lg:flex-none">
               <SortableCard 
                id={card.id} 
                text={card.text} 
                variant="compact" 
                isSelected={selectedCardId === card.id} 
                onClick={() => onCardClick?.(card.id)} 
                aspectRatio={isMobile ? 1.5 : cardDimensions.width / cardDimensions.height} 
                disableHoverZoom={disableHoverZoom || isMobile} 
               />
        </motion.div>
    )) : (
        <motion.div 
            initial={{ opacity: 0 }} 
            animate={{ opacity: 1 }} 
            className="w-full h-full flex flex-col items-center justify-center text-center text-slate-400 py-8 lg:col-span-2 lg:h-full lg:place-self-center"
        >
            <div className="flex flex-col items-center gap-2">
                <Check size={24} className="text-green-400" />
                <span className="text-sm font-medium">{t('fine.deck.all_placed')}</span>
            </div>
        </motion.div>
    );
  }, [activeCards, selectedCardId, onCardClick, isMobile, cardDimensions, disableHoverZoom, t]);

  return (
    <div className="flex flex-col lg:flex-row h-full bg-slate-50 w-full max-w-[1920px] mx-auto overflow-hidden relative">
      
       {/* PANEL: THE GRID (Canvas) */}
      <div className="flex-1 min-h-0 bg-slate-50 relative flex flex-col overflow-hidden transition-all duration-300"
      >
            {/* Condition of Instruction - Persistent Research Question */}
            <div className="flex-none bg-white/60 backdrop-blur-sm border-b border-slate-100 flex items-center justify-center py-2 px-4 z-20 gap-3">
                <Target size={14} className="text-indigo-400 opacity-60 flex-none" />
                <p className="text-[11px] sm:text-[13px] font-medium text-slate-600 text-center leading-relaxed max-w-2xl px-2">
                    {t('fine.header.title')}
                </p>
            </div>

            {/* Reading Zone - Responsive Placement */}
            {isMobile && (
                /* Mobile: Sticky Reading Zone at the top (Fixed height to prevent layout shifts) */
                <div className="sticky top-0 z-30 flex-none bg-indigo-50/50 backdrop-blur-md border-b border-indigo-100 shadow-sm">
                    <div className="p-3 h-20 overflow-y-auto custom-scrollbar">
                        {activeCard || hoveredCard || selectedCard ? (
                            <div className="animate-in fade-in slide-in-from-top-1 duration-300">
                                <div className="text-[10px] font-bold text-indigo-400 mb-0.5 uppercase tracking-wider flex items-center gap-1.5">
                                    <Eye size={12} strokeWidth={2.5} />
                                    {activeCard ? t('fine.workbench.active_card') : hoveredCard ? t('fine.toolbar.preview') : t('fine.workbench.active_card')}
                                </div>
                                <div className="flex flex-col gap-0.5">
                                    <p className="text-slate-800 text-sm font-medium leading-relaxed line-clamp-2">
                                        {activeCard?.text || hoveredCard?.text || selectedCard?.text}
                                    </p>
                                    {selectedCard && !activeCard && (!hoveredCard || hoveredCard.id === selectedCard.id) && (
                                        <p className="text-[10px] text-indigo-500 font-semibold italic animate-pulse">
                                            {t('fine.workbench.place_on_grid')}
                                        </p>
                                    )}
                                </div>
                            </div>
                        ) : (
                            <div className="h-full flex flex-col items-center justify-center gap-1.5 text-indigo-400">
                                <AnimatePresence mode="wait">
                                    <motion.div 
                                        key={methodologyStep}
                                        initial={{ opacity: 0, y: 5 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: -5 }}
                                        className="text-center flex flex-col items-center"
                                    >
                                        <div className="flex items-center gap-1.5 opacity-60 mb-0.5">
                                            <Lightbulb size={10} className="text-amber-400 fill-amber-400/20" />
                                            <p className="text-[10px] font-bold uppercase tracking-widest">
                                                {t('fine.workbench.help')}
                                            </p>
                                        </div>
                                        <p className="text-xs font-semibold leading-relaxed px-4 italic text-indigo-600/80">
                                            {methodologyTips[methodologyStep]}
                                        </p>
                                    </motion.div>
                                </AnimatePresence>
                            </div>
                        )}
                    </div>
                </div>
            )}

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
                                    <div key={col.score} id={`column-${col.score}`} className="flex flex-col gap-2 items-center flex-shrink-0">
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
                                 <div className="w-full h-5 bg-gradient-to-r from-red-500/30 via-slate-200 to-green-500/30 rounded-md relative backdrop-blur-sm overflow-hidden ring-1 ring-slate-200/50">
                                     <div className="absolute left-1/2 top-0 bottom-0 w-0.5 bg-slate-400/50 -translate-x-1/2"></div>
                                     {/* Removed side dividers to prevent glitches at corners */}
                                 </div>
                            </div>
                        </div>
                    </TransformComponent>
                </TransformWrapper>
            </div>
      </div>

       {/* PANEL: SOURCE INVENTORY (Deck) */}
      <div 
        className={`
          w-full lg:w-[360px] flex-none 
          bg-white lg:border-r border-t lg:border-t-0 border-gray-200 
          z-40 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)] lg:shadow-md 
          flex flex-col lg:h-full transition-all duration-300
          overflow-hidden pb-safe lg:pb-0
        `}
        style={{ 
          height: isMobile 
                ? (isDeckCollapsed ? 'auto' : `${deckHeight}px`) 
                : '100%' 
        }}
      >
              {/* Reading Zone (L'Oeil du Tri) - Desktop Sidebar version */}
              {!isMobile && (
              <div className="flex-none p-4 pb-0">
                  <div className="w-full bg-indigo-50/50 border border-indigo-100 rounded-xl p-4 h-40 overflow-y-auto relative transition-all duration-300 custom-scrollbar group">
                       {activeCard || hoveredCard || selectedCard ? (
                          <div className="animate-in fade-in zoom-in-95 duration-200">
                              <div className="text-xs font-bold text-indigo-400 mb-1.5 uppercase tracking-wider flex items-center gap-2">
                                  <Eye size={14} strokeWidth={2.5} />
                                  {activeCard ? t('fine.workbench.active_card') : hoveredCard ? t('fine.toolbar.preview') : t('fine.workbench.active_card')}
                              </div>
                              <p className="text-slate-800 text-base sm:text-lg font-medium leading-relaxed">
                                  {activeCard?.text || hoveredCard?.text || selectedCard?.text}
                              </p>
                          </div>
                       ) : (
                         <div className="flex flex-col items-center justify-center h-full text-center text-indigo-400 py-2">
                             <AnimatePresence mode="wait">
                                 <motion.div 
                                    key={methodologyStep}
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -10 }}
                                    className="flex flex-col items-center gap-3 px-6"
                                 >
                                     <div className="p-2 bg-amber-50 rounded-full text-amber-500 relative">
                                        <Lightbulb size={24} strokeWidth={1.5} className="fill-amber-500/10" />
                                        <motion.div 
                                            animate={{ opacity: [0.4, 0.8, 0.4], scale: [1, 1.2, 1] }}
                                            transition={{ duration: 2, repeat: Infinity }}
                                            className="absolute -top-1 -right-1 text-amber-400"
                                        >
                                            <Sparkles size={12} />
                                        </motion.div>
                                     </div>
                                     <p className="text-sm font-medium leading-relaxed italic text-indigo-600/70">
                                         {methodologyTips[methodologyStep]}
                                     </p>
                                 </motion.div>
                             </AnimatePresence>
                         </div>
                      )}
                  </div>
              </div>
              )}

               {/* Category selector (Piles) */}
               <div className="flex-none p-4 pb-2">
                  {!isDeckCollapsed && (
                  <div className="flex lg:grid lg:grid-cols-3 gap-2" role="tablist">
                      {(['disagree', 'neutral', 'agree'] as const).map((pile) => {
                            const isActive = activePile === pile;
                            const cards = pile === 'disagree' ? disagreeCards : pile === 'agree' ? agreeCards : neutralCards;
                            const Icon = pile === 'disagree' ? Frown : pile === 'agree' ? Smile : Meh;
                            
                            const pileStyles = {
                                disagree: {
                                    icon: 'text-red-500',
                                    activeBg: 'bg-red-50 border-red-300',
                                    activeText: 'text-red-700',
                                    activeBadge: 'bg-red-600 text-white border-white',
                                    activeBar: 'bg-red-200'
                                },
                                neutral: {
                                    icon: 'text-gray-500',
                                    activeBg: 'bg-gray-100 border-gray-300',
                                    activeText: 'text-gray-700',
                                    activeBadge: 'bg-gray-600 text-white border-white',
                                    activeBar: 'bg-gray-200'
                                },
                                agree: {
                                    icon: 'text-green-500',
                                    activeBg: 'bg-green-50 border-green-300',
                                    activeText: 'text-green-700',
                                    activeBadge: 'bg-green-600 text-white border-white',
                                    activeBar: 'bg-green-200'
                                }
                            };
                            const style = pileStyles[pile];
                            
                            return (
                                <button key={pile} onClick={() => { 
                                    setActivePile(pile as PileType); 
                                    // Only trigger zonal focus/zoom on mobile
                                    if (isMobile) {
                                        setHasPerformedZonalFocus(true); 
                                    }
                                }}
                                    role="tab"
                                    aria-selected={isActive}
                                    aria-label={`${t(`common.${pile}`)}: ${cards.length} ${t('common.cards')}`}
                                    className={`relative group flex-1 min-w-[70px] h-12 lg:h-auto lg:aspect-[4/5] rounded-lg border-2 shadow-sm transition-all duration-200 flex flex-col items-center justify-center p-1
                                      ${isActive ? `${style.activeBg} shadow-md scale-105 z-10` : 'bg-white border-slate-200 opacity-80'}
                                    `}
                                 >
                                   <Icon size={24} className={`lg:hidden ${style.icon}`} />
                                   <span className={`hidden lg:block text-[10px] font-bold uppercase tracking-wider mb-1 ${isActive ? style.activeText : 'text-slate-600'}`}>{t(`common.${pile}`)}</span>
                                   <div className={`hidden lg:block w-8 h-1 rounded-full mb-1 ${isActive ? style.activeBar : 'bg-slate-100'}`}></div>
                                   <div className={`hidden lg:block w-6 h-1 rounded-full ${isActive ? style.activeBar : 'bg-slate-100'}`}></div>
                                   <motion.span key={cards.length} className={`absolute -top-2 -right-2 w-6 h-6 flex items-center justify-center rounded-full text-xs font-bold border-2 shadow-sm z-20 ${isActive ? style.activeBadge : 'bg-slate-200 text-slate-700 border-white'}`}>
                                       {cards.length}
                                   </motion.span>
                                </button>
                            );
                        })}
                  </div>
                  )}
              </div>

              {!isDeckCollapsed && (
                <motion.div 
                    key={activePile} 
                    initial={{ backgroundColor: activePile === 'disagree' ? '#fee2e2' : activePile === 'agree' ? '#dcfce7' : '#f1f5f9' }} 
                    animate={{ backgroundColor: 'rgba(248, 250, 252, 0.5)' }} 
                    transition={{ duration: 0.8 }}
                    className={`
                        flex-1 p-1 px-2 flex flex-row gap-2 overflow-x-auto overflow-y-hidden min-h-0 items-center justify-start custom-scrollbar 
                        ${activeCards.length === 0 ? 'justify-center' : ''}
                        lg:grid lg:grid-cols-2 lg:gap-2 lg:overflow-y-auto lg:overflow-x-hidden lg:p-2
                        ${activeCards.length === 0 ? 'lg:place-content-center' : 'lg:content-start'}
                    `}
                    data-testid="deck-cards-container"
                >
                    {renderDeckCards()}
              </motion.div>
              )}
              {/* PANEL FOOTER: Guidance or Validation */}
              <div className="flex-none p-4 border-t border-indigo-100 bg-white shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] z-20">
                  {isAllPlaced && !selectedCardId ? (
                      <button 
                        onClick={onValidate}
                        className="w-full flex items-center justify-center gap-2 py-3 bg-green-600 text-white rounded-xl font-bold text-sm shadow-md hover:bg-green-700 transition-all active:scale-95 animate-in fade-in zoom-in-95 duration-500"
                      >
                          {t('fine.actions.validate')} <Check size={18} strokeWidth={3} />
                      </button>
                  ) : (
                      <div className="flex items-center justify-center min-h-[48px] bg-slate-50 border border-slate-100 rounded-xl px-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                           <div className="flex items-center gap-3 text-slate-500">
                               {selectedCardId ? (
                                   <>
                                       <span className="flex h-5 w-5 flex-none items-center justify-center rounded-full bg-indigo-500 text-[10px] text-white font-black">2</span>
                                       <span className="text-xs font-bold uppercase tracking-wide animate-pulse">
                                           {t('fine.workbench.place_on_grid')}
                                       </span>
                                   </>
                               ) : (
                                   <>
                                       <span className="flex h-5 w-5 flex-none items-center justify-center rounded-full bg-slate-200 text-[10px] text-slate-500 font-black">1</span>
                                       <span className="text-xs font-bold uppercase tracking-wide">
                                           {qsortResponses.length === 0 
                                              ? t('fine.workbench.initial_instruction') 
                                              : t('common.select_card')}
                                       </span>
                                   </>
                               )}
                           </div>
                           <button 
                                onClick={() => setShowHelpModal(true)}
                                className="p-1.5 text-slate-400 hover:text-indigo-500 hover:bg-indigo-50 rounded-full transition-colors flex-none ml-2"
                                title={t('fine.workbench.help')}
                           >
                               <HelpCircle size={18} />
                           </button>
                      </div>
                  )}

                  {/* Desktop-only Reset link */}
                  {onReset && (
                    <div className="mt-3 hidden lg:flex justify-center">
                        <button onClick={onReset} className="text-[10px] font-bold text-slate-400 hover:text-red-500 px-2 py-1 rounded transition-colors">{t('fine.deck.reset')}</button>
                    </div>
                  )}
              </div>
      </div>

      {/* Help Modal */}
      <AnimatePresence>
          {showHelpModal && (
              <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                  <motion.div 
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      onClick={() => setShowHelpModal(false)}
                      className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
                  />
                  <motion.div 
                      initial={{ opacity: 0, scale: 0.95, y: 20 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95, y: 20 }}
                      className="relative w-full max-w-lg bg-white rounded-3xl shadow-2xl overflow-hidden"
                  >
                      <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-indigo-50/30">
                          <div className="flex items-center gap-3">
                              <div className="p-2 bg-indigo-500 text-white rounded-xl">
                                  <HelpCircle size={24} />
                              </div>
                              <h2 className="text-xl font-extrabold text-slate-800">{t('fine.workbench.help')}</h2>
                          </div>
                          <button 
                              onClick={() => setShowHelpModal(false)}
                              className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-all"
                          >
                              <X size={24} />
                          </button>
                      </div>
                      
                      <div className="p-8 space-y-6 max-h-[70vh] overflow-y-auto custom-scrollbar">
                          <section className="space-y-3">
                              <h3 className="text-sm font-bold uppercase tracking-widest text-indigo-500 flex items-center gap-2">
                                  <span className="w-2 h-2 rounded-full bg-indigo-500" />
                                  {t('fine.workbench.methodology.extremes_title')}
                              </h3>
                              <p className="text-slate-600 leading-relaxed font-medium">
                                  {t('fine.workbench.methodology.extremes')}
                              </p>
                          </section>

                          <section className="space-y-3">
                              <h3 className="text-sm font-bold uppercase tracking-widest text-indigo-500 flex items-center gap-2">
                                  <span className="w-2 h-2 rounded-full bg-indigo-500" />
                                  {t('fine.workbench.methodology.vertical_title')}
                              </h3>
                              <p className="text-slate-600 leading-relaxed font-medium">
                                  {t('fine.workbench.methodology.vertical')}
                              </p>
                          </section>

                          <section className="space-y-3">
                              <h3 className="text-sm font-bold uppercase tracking-widest text-indigo-500 flex items-center gap-2">
                                  <span className="w-2 h-2 rounded-full bg-indigo-500" />
                                  {t('fine.workbench.methodology.interaction_title')}
                              </h3>
                              <p className="text-slate-600 leading-relaxed font-medium">
                                  {t('fine.workbench.methodology.interaction')}
                              </p>
                          </section>

                          <div className="pt-4 p-4 bg-slate-50 rounded-2xl border border-slate-100 italic text-sm text-slate-500 text-center">
                              {t('fine.workbench.methodology.footer_note')}
                          </div>
                      </div>

                      <div className="p-6 bg-slate-50 border-t border-slate-100 flex justify-center">
                          <button 
                              onClick={() => setShowHelpModal(false)}
                              className="px-10 py-3 bg-indigo-600 text-white rounded-xl font-bold shadow-md hover:bg-indigo-700 transition-all active:scale-95"
                          >
                              {t('fine.workbench.methodology.close')}
                          </button>
                      </div>
                  </motion.div>
              </div>
          )}
      </AnimatePresence>
    </div>
  );
});

export default GridSort;
