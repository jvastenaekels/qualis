/*
 * Open-Q - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

import React, { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import i18n from '../i18n';
import { Outlet, useParams, Navigate, useLocation } from 'react-router-dom';
import { useStudyStore } from '../store/useStudyStore';
import { Check, Globe, RefreshCw, X } from 'lucide-react';
import { LayoutProvider, useLayoutAction } from '../contexts/LayoutContext';
import { useStudyConfig } from '../hooks/useStudyConfig';
import CardZoomOverlay from '../components/CardZoomOverlay';

const steps = [
  { id: 1, labelKey: 'layout.steps.welcome' },
  { id: 2, labelKey: 'layout.steps.presort' },
  { id: 3, labelKey: 'layout.steps.rough' },
  { id: 4, labelKey: 'layout.steps.fine' },
  { id: 5, labelKey: 'layout.steps.review' },
];

const StudyLayoutContent: React.FC = () => {
  const { t } = useTranslation();
  const { slug } = useParams<{ slug: string }>();
  const { session, config, configError, configLoading } = useStudyStore();
  const location = useLocation();
  // const navigate = useNavigate(); // Removed as stepper is read-only
  const { headerAction } = useLayoutAction();
  const [isLangMenuOpen, setIsLangMenuOpen] = useState(false);
  const langMenuRef = useRef<HTMLDivElement>(null);

  // Trigger config fetch/re-fetch on slug or language change
  const { retry } = useStudyConfig();

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (langMenuRef.current && !langMenuRef.current.contains(event.target as Node)) {
        setIsLangMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Sync i18n with Store (Persistence Source of Truth) - Atomic update with config
  useEffect(() => {
    if (session.language && session.language !== i18n.language && !configLoading) {
      i18n.changeLanguage(session.language);
    }
  }, [session.language, configLoading]);

  const changeLanguage = (lng: string) => {
      // Sync store (this will trigger config refetch)
      useStudyStore.getState().setLanguage(lng);
      setIsLangMenuOpen(false);
  };

  // Full Page Error State (if we have no config at all)
  if (configError && !config) {
    return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
            <div className="max-w-md w-full bg-white rounded-2xl border border-red-100 shadow-xl p-8 text-center space-y-6">
                <div className="w-20 h-20 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto">
                    <X size={40} />
                </div>
                <div className="space-y-2">
                    <h2 className="text-2xl font-bold text-slate-900">{t('common.error')}</h2>
                    <p className="text-slate-600">{t(configError)}</p>
                </div>
                <button 
                    onClick={retry}
                    className="w-full py-3 px-6 bg-slate-900 text-white rounded-xl font-bold hover:bg-slate-800 transition-colors flex items-center justify-center gap-2"
                >
                    <RefreshCw size={18} /> {t('common.errors.retry')}
                </button>
            </div>
        </div>
    );
  }

  // Hard Loading State (Initial Fetch)
  if (!config && configLoading) {
     return (
        <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-8 space-y-6">
            <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
            <div className="space-y-2 text-center animate-pulse">
                <p className="text-slate-500 font-bold text-xl">{t('common.loading')}</p>
                <p className="text-slate-400 text-sm">Preparing your study session...</p>
            </div>
            {/* Minimal Skeleton */}
            <div className="w-full max-w-md space-y-3 pt-8">
                <div className="h-4 bg-slate-200 rounded w-3/4 mx-auto animate-pulse"></div>
                <div className="h-4 bg-slate-200 rounded w-1/2 mx-auto animate-pulse"></div>
            </div>
        </div>
     );
  }

  // Basic Protection Check
  const isProtected = ['presort', 'sort', 'review'].some(path => location.pathname.includes(path));
  if (isProtected && !session.hasConsented) {
    return <Navigate to={`/study/${slug}/welcome`} replace />;
  }

  // Enforce One-Time Submission
  // If completed, redirect everything to post-sort (Thank You page)
  if (session.isCompleted && !location.pathname.includes('post-sort')) {
      return <Navigate to={`/study/${slug}/post-sort`} replace />;
  }

  // Determine if we should show the mobile footer (only if headerAction exists)
  // This effectively acts as the bottom bar for mobile when an action is present
  const showMobileFooter = !!headerAction;

  return (
    <div className="h-dvh bg-gray-50 flex flex-col overflow-hidden">
      {/* Header */}
      <header className="px-6 h-16 border-b border-slate-200 bg-white sticky top-0 z-50 flex items-center justify-between relative shadow-sm">
        
        {/* Subtle Loading Line (Background Re-validation) */}
        {configLoading && (
            <div className="absolute top-0 left-0 w-full h-[2px] bg-blue-600/20 overflow-hidden">
                <div className="h-full bg-blue-600 w-1/3 animate-loading-line" />
            </div>
        )}

        {/* Mobile Progress Bar (Top Edge) */}
        <div className="md:hidden absolute top-0 left-0 w-full h-1 bg-slate-100">
             <div 
                className="h-full bg-blue-600 transition-all duration-300 ease-in-out" 
                style={{ width: `${(session.currentStep / steps.length) * 100}%` }}
             />
        </div>

        {/* LEFT: Branding / Context */}
        <div className="flex items-center gap-3 min-w-0">
          <div className="font-semibold text-slate-800 text-lg truncate max-w-[200px] md:max-w-md">
             {/* Use config title if available, else static default */}
              {session.currentStep === 1 ? 'Open-Q' : (config?.title || 'Q-Method Study')}
          </div>
          {/* Mobile Step Counter (Next to title) */}
          <span className="md:hidden text-xs font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full whitespace-nowrap">
            {t('layout.mobile_step')} {session.currentStep}/{steps.length}
          </span>
        </div>

        {/* CENTER: Stepper (Desktop Only) */}
        <div className="hidden md:flex absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 items-center">
           <div className="flex items-center gap-1">
              {steps.map((step, index) => {
                 const status = session.currentStep === step.id
                     ? 'current'
                     : session.currentStep > step.id
                     ? 'completed'
                     : 'upcoming';
                 
                 return (
                    <div key={step.id} className="flex items-center">
                       {/* Connection Line */}
                       {index > 0 && (
                           <div className={`w-8 h-0.5 mx-2 transition-colors duration-300 ${status === 'upcoming' ? 'bg-slate-200' : 'bg-blue-600'}`} />
                       )}
                       
                       {/* Step Node */}
                       <div className={`
                           w-8 h-8 rounded-full flex items-center justify-center border-2 transition-all duration-300
                           ${status === 'current' ? 'border-blue-600 text-blue-600 bg-white shadow-sm ring-4 ring-blue-50' : 
                             status === 'completed' ? 'bg-blue-600 border-blue-600 text-white' : 
                             'border-slate-200 bg-slate-50 text-slate-300'}
                       `}>
                           {status === 'completed' ? (
                               <Check size={16} strokeWidth={3} />
                           ) : status === 'current' ? (
                               <div className="w-2.5 h-2.5 bg-blue-600 rounded-full" />
                           ) : (
                               <div className="w-2 h-2 bg-slate-300 rounded-full" />
                           )}
                       </div>

                       {/* Label (Current Only) */}
                       {status === 'current' && (
                           <span className="ml-3 font-bold text-slate-800 text-sm whitespace-nowrap animate-in fade-in slide-in-from-left-2">
                               {t(step.labelKey)}
                           </span>
                       )}
                    </div>
                 );
              })}
           </div>
        </div>

        {/* RIGHT: Actions + Language */}
        <div className="flex items-center gap-3">
           {/* Language Selector (Globe Icon) */}
           <div className="relative" ref={langMenuRef}>
                <button 
                    onClick={() => setIsLangMenuOpen(!isLangMenuOpen)}
                    className="p-2 rounded-full hover:bg-slate-100 text-slate-600 transition-colors"
                    title="Change language"
                >
                    <Globe size={20} />
                </button>

                {/* Dropdown (Simplified) */}
                {isLangMenuOpen && (
                    <div className="absolute right-0 top-full mt-2 w-40 bg-white rounded-lg shadow-xl border border-slate-100 py-1 z-50 animate-in fade-in zoom-in-95">
                        {['en', 'fr', 'fi']
                            .filter(lang => !config?.available_languages || config.available_languages.includes(lang))
                            .map((lang) => (
                            <button 
                                key={lang}
                                onClick={() => changeLanguage(lang)}
                                className={`w-full text-left px-4 py-2 text-sm hover:bg-slate-50 flex items-center justify-between ${i18n.language.startsWith(lang) ? 'text-blue-600 font-semibold' : 'text-slate-700'}`}
                            >
                                <span className="uppercase">{lang}</span>
                                {i18n.language.startsWith(lang) && <Check size={14} />}
                            </button>
                        ))}
                    </div>
                )}
           </div>

           {/* Primary Action (Desktop) */}
           <div className="hidden md:block">
               {headerAction}
           </div>
        </div>
      </header>

      {/* Main Content */}
      <main className={`flex-1 w-full mx-auto relative flex flex-col bg-slate-50 custom-scrollbar ${['/rough-sort', '/sort'].some(path => location.pathname.endsWith(path)) ? 'overflow-hidden' : 'overflow-y-auto'}`}>
        {/* Error Banner (Stale-while-revalidating failure) */}
        {configError && config && (
            <div className="bg-red-600 text-white px-6 py-2 flex items-center justify-between animate-in slide-in-from-top duration-300">
                <div className="flex items-center gap-2 text-sm font-medium">
                    <X size={16} />
                    {t(configError)}
                </div>
                <button 
                    onClick={retry}
                    className="flex items-center gap-1.5 px-3 py-1 bg-white/20 hover:bg-white/30 rounded text-xs font-bold transition-colors"
                >
                    <RefreshCw size={14} /> {t('common.errors.retry')}
                </button>
            </div>
        )}
        {/* Transition Overlay / Dimming */}
        <div className={`flex-1 min-h-0 flex flex-col transition-opacity duration-300 ${configLoading ? 'opacity-50 pointer-events-none' : 'opacity-100'}`}>
            <Outlet />
        </div>
      </main>

      {/* Mobile Footer (Primary Action) */}
      {showMobileFooter && (
          <div className="md:hidden flex-none bg-white border-t border-slate-200 p-4 sticky bottom-0 z-50 pb-safe shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
              {headerAction}
          </div>
      )}
    </div>
  );
};

const StudyLayout: React.FC = () => {
    return (
        <LayoutProvider>
            <StudyLayoutContent />
            <CardZoomOverlay />
        </LayoutProvider>
    );
};

export default StudyLayout;
