/* eslint-disable @typescript-eslint/no-explicit-any */
export const exampleStudyData = {
    slug: 'example-study',
    state: 'active',
    default_language: 'en',
    grid_config: [
        { score: -5, capacity: 1 },
        { score: -4, capacity: 2 },
        { score: -3, capacity: 3 },
        { score: -2, capacity: 4 },
        { score: -1, capacity: 5 },
        { score: 0, capacity: 4 },
        { score: 1, capacity: 5 },
        { score: 2, capacity: 4 },
        { score: 3, capacity: 3 },
        { score: 4, capacity: 2 },
        { score: 5, capacity: 1 },
    ],
    presort_config: {
        enabled: true,
        fields: {
            age: {
                type: 'number',
                label: {
                    en: 'Age',
                    fr: 'Âge',
                    fi: 'Ikä',
                },
                required: true,
                min: 18,
                max: 99,
            },
            gender: {
                type: 'select',
                options: [
                    {
                        value: 'Male',
                        label: {
                            en: 'Male',
                            fr: 'Homme',
                            fi: 'Mies',
                        },
                    },
                    {
                        value: 'Female',
                        label: {
                            en: 'Female',
                            fr: 'Femme',
                            fi: 'Nainen',
                        },
                    },
                    {
                        value: 'Non-binary',
                        label: {
                            en: 'Non-binary',
                            fr: 'Non-binaire',
                            fi: 'Muunsukupuolinen',
                        },
                    },
                    {
                        value: 'Prefer not to say',
                        label: {
                            en: 'Prefer not to answer',
                            fr: 'Je préfère ne pas répondre',
                            fi: 'En halua vastata',
                        },
                    },
                ],
                label: {
                    en: 'Gender',
                    fr: 'Genre',
                    fi: 'Sukupuoli',
                },
                required: true,
            },
            education: {
                type: 'select',
                options: [
                    {
                        value: 'High School',
                        label: {
                            en: 'High School / Secondary',
                            fr: 'Études secondaires',
                            fi: 'Toisen asteen koulutus',
                        },
                    },
                    {
                        value: 'Bachelor',
                        label: {
                            en: "Bachelor's Degree",
                            fr: 'Licence / Bachelor',
                            fi: 'Kandidaatti (Bachelor)',
                        },
                    },
                    {
                        value: 'Master',
                        label: {
                            en: "Master's Degree",
                            fr: 'Master / Maîtrise',
                            fi: 'Maisteri (Master)',
                        },
                    },
                    {
                        value: 'PhD',
                        label: {
                            en: 'PhD / Doctorate',
                            fr: 'Doctorat',
                            fi: 'Tohtori',
                        },
                    },
                    {
                        value: 'Other',
                        label: {
                            en: 'Other',
                            fr: 'Autre',
                            fi: 'Muu',
                        },
                    },
                ],
                label: {
                    en: 'Education Level',
                    fr: "Niveau d'études",
                    fi: 'Koulutustaso',
                },
                required: true,
            },
        },
    },
    postsort_config: {
        extreme_columns: [-5, 5],
        ask_missing: true,
        ask_general_comment: true,
        allow_random_comments: true,
        email_collection_enabled: true,
        interview_consent_enabled: true,
        newsletter_consent_enabled: true,
        questions: {
            pilot_feeback: {
                type: 'textarea',
                label: {
                    en: 'How clear were the instructions?',
                    fr: 'Les instructions étaient-elles claires ?',
                    fi: 'Olivatko ohjeet selkeät?',
                },
                required: false,
            },
        },
    },
    translations: {
        en: {
            title: 'Discover Open-Q',
            subtitle: 'Experience Q-Methodology Simple and Easy',
            objective:
                'Welcome!\n\nThe goal of this study is to capture the nuance of your opinion, going beyond simple "yes" or "no" answers.\n\nBy ranking statements relative to one another, you allow us to map your unique perspective in detail. This approach is designed to respect the complexity of your point of view, rather than forcing it into rigid boxes.',
            condition_of_instruction: 'What is your stance on this statement?',

            instructions: null,
            ui_labels: {
                start_button: 'Start Study',
            },
            process_steps: [
                {
                    id: 'profile',
                    icon: 'Contact',
                    title: "Let's meet",
                    description: 'A few quick questions to better understand your background.',
                    color: '#3b82f6',
                },
                {
                    id: 'rough',
                    icon: 'Zap',
                    title: 'First impressions',
                    description:
                        'Discover the statements and give your immediate reaction (agree, neutral, or disagree).',
                    color: '#f59e0b',
                },
                {
                    id: 'fine',
                    icon: 'Target',
                    title: 'Your perspective',
                    description:
                        'Place the statements onto the grid to refine your point of view, prioritizing what matters most to you.',
                    color: '#8b5cf6',
                },
                {
                    id: 'post',
                    icon: 'MessageSquareQuote',
                    title: 'Why',
                    description: 'A few words to explain your most significant choices.',
                    color: '#10b981',
                },
            ],
            step_help: {},
        },
        fr: {
            title: "Découverte d'Open-Q",
            subtitle: 'La méthodologie Q en toute simplicité',
            objective:
                'Bienvenue !\n\nL\'objectif de cette étude est de saisir toute la nuance de votre opinion, au-delà des simples réponses "oui" ou "non".\n\nEn classant les énoncés les uns par rapport aux autres, vous nous permettez de cartographier votre perspective unique. Cette approche est conçue pour respecter la complexité de votre point de vue, plutôt que de le forcer dans des cases rigides.',
            condition_of_instruction: 'Quel est votre avis sur cet énoncé ?',

            instructions: null,
            ui_labels: {
                start_button: "Commencer l'étude",
            },
            process_steps: [
                {
                    id: 'profile',
                    icon: 'Contact',
                    title: 'Faisons connaissance',
                    description: 'Quelques questions rapides pour mieux comprendre votre parcours.',
                    color: '#3b82f6',
                },
                {
                    id: 'rough',
                    icon: 'Zap',
                    title: 'Premières impressions',
                    description:
                        "Découvrez les affirmations et donnez votre réaction immédiate (d'accord, neutre ou pas d'accord).",
                    color: '#f59e0b',
                },
                {
                    id: 'fine',
                    icon: 'Target',
                    title: 'Votre perspective',
                    description:
                        'Placez les affirmations sur la grille pour affiner votre point de vue, en donnant la priorité à ce qui compte le plus pour vous.',
                    color: '#8b5cf6',
                },
                {
                    id: 'post',
                    icon: 'MessageSquareQuote',
                    title: 'Pourquoi',
                    description: 'Quelques mots pour expliquer vos choix les plus significatifs.',
                    color: '#10b981',
                },
            ],
            step_help: {},
        },
        fi: {
            title: 'Tutustu Open-Q-alustaan',
            subtitle: 'Q-metodologia helposti ja sujuvasti',
            objective:
                'Tervetuloa!\n\nTämän tutkimuksen tavoitteena on tavoittaa mielipiteesi vivahteet, ylittäen pelkät "kyllä" tai "ei" -vastaukset.\n\nJärjestämällä väittämät suhteessa toisiinsa autat meitä kartoittamaan ainutlaatuisen näkökulmasi. Tämä menetelmä on suunniteltu kunnioittamaan näkemyksesi monimuotoisuutta sen sijaan, että se pakotettaisiin valmiisiin raameihin.',
            condition_of_instruction: 'Mikä on näkemyksesi tästä väittämästä?',

            instructions: null,
            ui_labels: {
                start_button: 'Aloita tutkimus',
            },
            process_steps: [
                {
                    id: 'profile',
                    icon: 'Contact',
                    title: 'Tutustutaan',
                    description: 'Muutama nopea kysymys taustasi ymmärtämiseksi.',
                    color: '#3b82f6',
                },
                {
                    id: 'rough',
                    icon: 'Zap',
                    title: 'Ensivaikutelma',
                    description:
                        'Tutustu väittämiin ja anna välitön reaktiosi (samaa mieltä, neutraali tai eri mieltä).',
                    color: '#f59e0b',
                },
                {
                    id: 'fine',
                    icon: 'Target',
                    title: 'Näkökulmasi',
                    description:
                        'Aseta väittämät ruudukkoon tarkentaaksesi näkökulmaasi, priorisoimalla itsellesi tärkeimmät asiat.',
                    color: '#8b5cf6',
                },
                {
                    id: 'post',
                    icon: 'MessageSquareQuote',
                    title: 'Miksi',
                    description: 'Muutama sana perustellaksesi merkittävimmät valintasi.',
                    color: '#10b981',
                },
            ],
            step_help: {},
        },
    },
    statements: [
        {
            code: 'S1',
            translations: {
                en: 'Statement S1:',
                fr: 'Énoncé S1:',
                fi: 'Väittämä S1:',
            },
        },
        {
            code: 'S2',
            translations: {
                en: 'Statement S2: Lorem ipsum dolor sit amet.',
                fr: 'Énoncé S2: Lorem ipsum dolor sit amet.',
                fi: 'Väittämä S2: Lorem ipsum dolor sit amet.',
            },
        },
        {
            code: 'S3',
            translations: {
                en: 'Statement S3: Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.',
                fr: 'Énoncé S3: Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.',
                fi: 'Väittämä S3: Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.',
            },
        },
        {
            code: 'S4',
            translations: {
                en: 'Statement S4: Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.',
                fr: 'Énoncé S4: Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.',
                fi: 'Väittämä S4: Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.',
            },
        },
        {
            code: 'S5',
            translations: {
                en: 'Statement S5:',
                fr: 'Énoncé S5:',
                fi: 'Väittämä S5:',
            },
        },
        {
            code: 'S6',
            translations: {
                en: 'Statement S6: Lorem ipsum dolor sit amet.',
                fr: 'Énoncé S6: Lorem ipsum dolor sit amet.',
                fi: 'Väittämä S6: Lorem ipsum dolor sit amet.',
            },
        },
        {
            code: 'S7',
            translations: {
                en: 'Statement S7: Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.',
                fr: 'Énoncé S7: Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.',
                fi: 'Väittämä S7: Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.',
            },
        },
        {
            code: 'S8',
            translations: {
                en: 'Statement S8: Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.',
                fr: 'Énoncé S8: Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.',
                fi: 'Väittämä S8: Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.',
            },
        },
        {
            code: 'S9',
            translations: {
                en: 'Statement S9:',
                fr: 'Énoncé S9:',
                fi: 'Väittämä S9:',
            },
        },
        {
            code: 'S10',
            translations: {
                en: 'Statement S10: Lorem ipsum dolor sit amet.',
                fr: 'Énoncé S10: Lorem ipsum dolor sit amet.',
                fi: 'Väittämä S10: Lorem ipsum dolor sit amet.',
            },
        },
        {
            code: 'S11',
            translations: {
                en: 'Statement S11: Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.',
                fr: 'Énoncé S11: Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.',
                fi: 'Väittämä S11: Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.',
            },
        },
        {
            code: 'S12',
            translations: {
                en: 'Statement S12: Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.',
                fr: 'Énoncé S12: Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.',
                fi: 'Väittämä S12: Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.',
            },
        },
        {
            code: 'S13',
            translations: {
                en: 'Statement S13:',
                fr: 'Énoncé S13:',
                fi: 'Väittämä S13:',
            },
        },
        {
            code: 'S14',
            translations: {
                en: 'Statement S14: Lorem ipsum dolor sit amet.',
                fr: 'Énoncé S14: Lorem ipsum dolor sit amet.',
                fi: 'Väittämä S14: Lorem ipsum dolor sit amet.',
            },
        },
        {
            code: 'S15',
            translations: {
                en: 'Statement S15: Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.',
                fr: 'Énoncé S15: Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.',
                fi: 'Väittämä S15: Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.',
            },
        },
        {
            code: 'S16',
            translations: {
                en: 'Statement S16: Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.',
                fr: 'Énoncé S16: Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.',
                fi: 'Väittämä S16: Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.',
            },
        },
        {
            code: 'S17',
            translations: {
                en: 'Statement S17:',
                fr: 'Énoncé S17:',
                fi: 'Väittämä S17:',
            },
        },
        {
            code: 'S18',
            translations: {
                en: 'Statement S18: Lorem ipsum dolor sit amet.',
                fr: 'Énoncé S18: Lorem ipsum dolor sit amet.',
                fi: 'Väittämä S18: Lorem ipsum dolor sit amet.',
            },
        },
        {
            code: 'S19',
            translations: {
                en: 'Statement S19: Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.',
                fr: 'Énoncé S19: Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.',
                fi: 'Väittämä S19: Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.',
            },
        },
        {
            code: 'S20',
            translations: {
                en: 'Statement S20: Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.',
                fr: 'Énoncé S20: Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.',
                fi: 'Väittämä S20: Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.',
            },
        },
        {
            code: 'S21',
            translations: {
                en: 'Statement S21:',
                fr: 'Énoncé S21:',
                fi: 'Väittämä S21:',
            },
        },
        {
            code: 'S22',
            translations: {
                en: 'Statement S22: Lorem ipsum dolor sit amet.',
                fr: 'Énoncé S22: Lorem ipsum dolor sit amet.',
                fi: 'Väittämä S22: Lorem ipsum dolor sit amet.',
            },
        },
        {
            code: 'S23',
            translations: {
                en: 'Statement S23: Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.',
                fr: 'Énoncé S23: Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.',
                fi: 'Väittämä S23: Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.',
            },
        },
        {
            code: 'S24',
            translations: {
                en: 'Statement S24: Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.',
                fr: 'Énoncé S24: Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.',
                fi: 'Väittämä S24: Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.',
            },
        },
        {
            code: 'S25',
            translations: {
                en: 'Statement S25:',
                fr: 'Énoncé S25:',
                fi: 'Väittämä S25:',
            },
        },
        {
            code: 'S26',
            translations: {
                en: 'Statement S26: Lorem ipsum dolor sit amet.',
                fr: 'Énoncé S26: Lorem ipsum dolor sit amet.',
                fi: 'Väittämä S26: Lorem ipsum dolor sit amet.',
            },
        },
        {
            code: 'S27',
            translations: {
                en: 'Statement S27: Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.',
                fr: 'Énoncé S27: Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.',
                fi: 'Väittämä S27: Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.',
            },
        },
        {
            code: 'S28',
            translations: {
                en: 'Statement S28: Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.',
                fr: 'Énoncé S28: Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.',
                fi: 'Väittämä S28: Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.',
            },
        },
        {
            code: 'S29',
            translations: {
                en: 'Statement S29:',
                fr: 'Énoncé S29:',
                fi: 'Väittämä S29:',
            },
        },
        {
            code: 'S30',
            translations: {
                en: 'Statement S30: Lorem ipsum dolor sit amet.',
                fr: 'Énoncé S30: Lorem ipsum dolor sit amet.',
                fi: 'Väittämä S30: Lorem ipsum dolor sit amet.',
            },
        },
        {
            code: 'S31',
            translations: {
                en: 'Statement S31: Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.',
                fr: 'Énoncé S31: Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.',
                fi: 'Väittämä S31: Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.',
            },
        },
        {
            code: 'S32',
            translations: {
                en: 'Statement S32: Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.',
                fr: 'Énoncé S32: Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.',
                fi: 'Väittämä S32: Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.',
            },
        },
        {
            code: 'S33',
            translations: {
                en: 'Statement S33:',
                fr: 'Énoncé S33:',
                fi: 'Väittämä S33:',
            },
        },
        {
            code: 'S34',
            translations: {
                en: 'Statement S34: Lorem ipsum dolor sit amet.',
                fr: 'Énoncé S34: Lorem ipsum dolor sit amet.',
                fi: 'Väittämä S34: Lorem ipsum dolor sit amet.',
            },
        },
    ],
};
