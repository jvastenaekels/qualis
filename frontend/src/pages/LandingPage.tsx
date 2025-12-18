import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
// import { useTranslation } from 'react-i18next';
import { ArrowRight, Search } from 'lucide-react';

const LandingPage: React.FC = () => {
    const [slug, setSlug] = useState('');
    const navigate = useNavigate();
    // const { t } = useTranslation(); // Unused for now

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (slug.trim()) {
            navigate(`/study/${slug.trim()}/welcome`);
        }
    };

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col justify-center items-center p-4">
            <div className="max-w-md w-full bg-white rounded-xl shadow-lg p-8 space-y-6">
                <div className="text-center space-y-2">
                    <h1 className="text-3xl font-bold text-gray-900">OpenQ</h1>
                    <p className="text-gray-500">Enter your study code to begin.</p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label htmlFor="study-code" className="sr-only">Study Code</label>
                        <div className="relative">
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                <Search className="h-5 w-5 text-gray-400" />
                            </div>
                            <input
                                type="text"
                                id="study-code"
                                value={slug}
                                onChange={(e) => setSlug(e.target.value)}
                                className="block w-full pl-10 pr-3 py-3 border border-gray-300 rounded-lg leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                                placeholder="e.g. complex-study"
                                required
                            />
                        </div>
                    </div>

                    <button
                        type="submit"
                        disabled={!slug.trim()}
                        className="w-full flex justify-center items-center gap-2 py-3 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                        Go to Study <ArrowRight size={16} />
                    </button>
                </form>
            </div>
        </div>
    );
};

export default LandingPage;
