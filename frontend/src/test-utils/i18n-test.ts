import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

// Use singleton to ensure compatibility

const resources = {
    en: {
        translation: {
            // Post
            'post.title': 'To conclude',
            'post.description': 'Description',
            'post.extreme.why':
                'Why did you choose to place this statement here? How is it significant to you?',
            // Admin
            'admin.design.postsort.extreme.title': 'Extreme columns',
            'admin.design.postsort.extreme.desc':
                'Select columns that trigger follow-up questions.',
            'admin.design.postsort.extreme.no_columns': 'No columns selected.',
            'admin.design.postsort.extreme.add_label': 'Add column:',
            'admin.design.postsort.extreme.prompt_label': 'Prompt for extreme cards',
            'admin.design.postsort.extreme.prompt_placeholder':
                'Why did you place this statement here?',
            'admin.design.postsort.extreme.add': 'Add',
            'admin.design.postsort.extreme.select_placeholder': 'Select...',

            'admin.design.postsort.random_comments.title': 'Allow random comments',
            'admin.design.postsort.random_comments.desc':
                'Allow participants to add comments to any statement in the grid.',

            'admin.design.postsort.custom.title': 'Custom questions',
            'admin.design.postsort.custom.desc': 'Add custom questions to the post-sort survey.',

            'admin.design.postsort.missing.title': 'Ask about missing statements',
            'admin.design.postsort.missing.desc': 'Ask if topics were missing',

            'admin.design.postsort.general.title': 'Ask for general feedback',
            'admin.design.postsort.general.desc': 'General comments at the end',

            'admin.design.postsort.email.title': 'Participant Follow-up',
            'admin.design.postsort.email.desc':
                'Collect email addresses for follow-up or research results.',
            'admin.design.postsort.email.interview': 'Offer follow-up interview',
            'admin.design.postsort.email.results':
                'Offer to subscribe to a mailing list about study outcomes',

            // PostSortPage Layout
            'layout.default_study_title': 'Open-Q Study',
            'welcome.steps.post.title': 'Post-Sort',

            // Missing keys seen in logs
            'common.optional': '(Optional)',
        },
    },
};

// Check if already initialized (singleton protection)
if (!i18n.isInitialized) {
    i18n.use(initReactI18next).init({
        lng: 'en',
        fallbackLng: 'en',
        ns: ['translation'],
        defaultNS: 'translation',
        debug: false,
        resources,
        interpolation: {
            escapeValue: false,
        },
        react: {
            useSuspense: false,
        },
        initImmediate: true, // Ensure synchronous initialization
    });
}

// Ensure resources are always available (guard against any clearing)
i18n.addResourceBundle('en', 'translation', resources.en.translation, true, true);

export default i18n;
