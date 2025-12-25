/*
 * Open-Q - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Markdown from 'react-markdown';
import { useConfigStore } from '../store/useConfigStore';
import { useSessionStore } from '../store/useSessionStore';
import { useResponseStore } from '../store/useResponseStore';
import { ArrowRight, Target } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import SortingAnimation from '../components/SortingAnimation';

const WelcomePage: React.FC = () => {
    const { slug } = useParams();
    const navigate = useNavigate();
    const { t } = useTranslation();
    
    const config = useConfigStore((state) => state.config);
    const setStep = useSessionStore((state) => state.setStep);

    const hasConsented = useSessionStore((state) => state.hasConsented);
    const maxReachedStep = useSessionStore((state) => state.maxReachedStep);
    
    // Set Step 1 on mount
    React.useEffect(() => {
        setStep(1);
    }, [setStep]);

    if (!config) return null; 
    
    const study = config;

    const handleContinue = () => {
        navigate(`/study/${slug}/consent`);
    };

    return (
        <div className="max-w-5xl mx-auto py-12 px-4 animate-in fade-in duration-500">
            
            {/* 1. Context Section (The "Why") */}
            <div className="text-center max-w-3xl mx-auto mb-16 space-y-6">
                <div>
                     <h1 className="text-4xl font-bold text-gray-900 tracking-tight">{study.title}</h1>
                     {study.subtitle && (
                        <h2 className="text-xl text-slate-600 font-normal mt-3">{study.subtitle}</h2>
                     )}
                </div>
                
                <p className="text-xl text-gray-800 leading-relaxed font-medium">{study.description}</p>

                {/* Objective Frame */}
                {study.objective && (
                    <div className="bg-white border border-slate-200 rounded-xl p-6 max-w-2xl mx-auto mt-8 text-left shadow-md relative overflow-hidden">
                        <div className="absolute top-0 left-0 w-1 h-full bg-blue-500"></div>
                        <h4 className="text-xs uppercase font-bold text-slate-500 mb-4 tracking-wider flex items-center gap-2">
                             <Target size={16} className="text-blue-500" />
                            {t('welcome.objective_label', 'Objective of the study')}
                        </h4>
                        <div className="prose prose-slate prose-base max-w-none text-slate-800 leading-relaxed">
                            <Markdown>{study.objective}</Markdown>
                        </div>
                    </div>
                )}
            </div>

            {/* 2. Process Section (The "How") */}
            <div className="bg-white rounded-2xl shadow-md border border-slate-200 overflow-hidden mb-8">
                <div className="grid md:grid-cols-12 divide-y md:divide-y-0 md:divide-x divide-slate-200">
                    
                    {/* Instructions Column */}
                    <div className="md:col-span-7 p-8 md:px-10 md:pt-10 md:pb-6 bg-blue-50 flex flex-col justify-start">
                        <div className="uppercase tracking-wider text-xs font-bold text-blue-700 mb-4 bg-blue-100 w-fit px-3 py-1.5 rounded-md border border-blue-200">
                            {t('welcome.instructions_label', 'Instructions')}
                        </div>
                        <div className="prose prose-blue prose-base max-w-none text-slate-800 font-medium rec-steps">
                            <Markdown
                                components={{
                                    ol: ({node: _node, ...props}) => <ol className="space-y-5" {...props} />,
                                    li: ({node: _node, ...props}) => (
                                        <li className="flex gap-4 items-start group">
                                            <span className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold text-sm border border-blue-200 group-hover:bg-blue-600 group-hover:text-white transition-all duration-300 shadow-sm mt-0.5 step-badge">
                                                {/* Number injected via CSS */}
                                            </span>
                                            <div className="pt-1 text-slate-600 group-hover:text-slate-900 transition-colors leading-relaxed">
                                                {props.children}
                                            </div>
                                        </li>
                                    ),
                                    strong: ({node: _node, ...props}) => <strong className="text-slate-900 font-bold" {...props} />
                                }}
                            >
                                {study.instructions || t('welcome.default_instructions')}
                            </Markdown>
                            <style>{`
                                .rec-steps ol { counter-reset: step-counter; list-style: none; padding: 0; margin: 0; }
                                .rec-steps li { counter-increment: step-counter; padding: 0; margin: 0; }
                                .rec-steps .step-badge::before { content: counter(step-counter); }
                            `}</style>
                        </div>
                        </div>

                    {/* Visual Column */}
                    <div className="md:col-span-5 p-8 md:px-10 md:pt-10 md:pb-6 bg-slate-100 flex flex-col items-start min-h-[350px] md:min-h-[500px] relative overflow-hidden">
                         <div className="relative z-10 uppercase tracking-wider text-xs font-bold text-slate-600 mb-4 bg-slate-200 w-fit px-3 py-1.5 rounded-md border border-slate-300">
                            {t('welcome.preview_title', "It's child's play!")}
                        </div>
                        
                        <div className="w-full flex-1 flex items-center justify-center relative">
                            {/* Anchor Shape */}
                            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-slate-200/50 rounded-full blur-2xl opacity-60 pointer-events-none" />
                            
                            {/* Animation */}
                            <div className="transform origin-center grayscale-[0.2] contrast-125 z-10 w-full flex justify-center">
                                <SortingAnimation />
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Continue Button */}
            <div className="flex justify-center">
                 <button
                    onClick={handleContinue}
                    className="group w-full sm:w-auto px-10 py-4 bg-blue-600 text-white rounded-full font-bold text-lg hover:bg-blue-700 shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all flex items-center justify-center gap-3"
                >
                    {t('common.continue', 'Continue')} 
                    <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" />
                </button>
            </div>
            
            {/* Reset Session Link - Only if session in progress */}
            {(hasConsented || maxReachedStep > 1) && (
                <div className="mt-6 flex justify-center">
                     <button 
                        onClick={() => {
                            if (window.confirm(t('welcome.reset_confirm'))) {
                                useSessionStore.getState().resetSession();
                                useResponseStore.getState().resetResponses();
                                window.location.reload();
                            }
                        }}
                        className="text-sm text-slate-400 hover:text-slate-600 underline decoration-slate-300 underline-offset-4 transition-colors"
                    >
                        {t('welcome.restart', 'Start a new session')}
                    </button>
                </div>
            )}
    </div>
);
};

export default WelcomePage;
