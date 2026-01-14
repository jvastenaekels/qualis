// biome-ignore lint/suspicious/noExplicitAny: default content is dynamic
export const DEFAULT_STUDY_CONTENT: Record<string, any> = {
    en: {
        instructions: 'Please sort the statements according to your perspective.',
        consent_title: 'Informed Consent',
        consent_description:
            '**Confirmation of Understanding:** By checking the box below, you confirm that you have read the study objectives and process described on the home page. You understand that this task involves sorting statements to model your personal point of view and that there are no right or wrong answers.\n\n**Confidentiality and Data Protection:** Your participation is anonymous. Your responses will be associated with a code and will not be linked to your identity in any report or publication. Collected data will be analyzed collectively to identify shared perspectives (factors). Written comments provided during the post-sort phase may be quoted anonymously to illustrate these viewpoints.\n\n**Voluntary Participation:** Participation is entirely voluntary. You reserve the right to interrupt the sorting process and close the browser at any time without penalty. If you withdraw before submission, your partial data will not be retained.',
        consent_accept: 'I Agree',
        consent_decline: 'I Decline',
        condition_of_instruction:
            'Please rank the following statements from those you most agree with to those you most disagree with',

        process_steps: [
            {
                id: 'profile',
                title: "Let's meet",
                description: 'A few quick questions to better understand your background.',
                icon: 'User',
                color: '#3b82f6',
            },
            {
                id: 'rough',
                title: 'First impressions',
                description:
                    'Discover the statements and give your immediate reaction (agree, neutral, or disagree).',
                icon: 'Zap',
                color: '#f59e0b',
            },
            {
                id: 'fine',
                title: 'Your perspective',
                description:
                    'Place the statements onto the grid to refine your point of view, prioritizing what matters most to you.',
                icon: 'Target',
                color: '#8b5cf6',
            },
            {
                id: 'post',
                title: 'Why',
                description: 'A few words to explain your most significant choices.',
                icon: 'MessageSquare',
                color: '#10b981',
            },
        ],
        methodology_tips: [
            'Tip: Start with what is most obvious to you (the extremes).',
            "In the same column, the order from top to bottom doesn't matter.",
            "You have to fit everything! It can be a puzzle, but that's how we prioritize choices.",
            'Reminder: items are sorted relative to each other (relative agreement).',
            'Feel free to zoom in on different parts of the grid for better visibility.',
            'Nothing is final: you can move cards or put them back in the deck at any time.',
        ],
    },
    fr: {
        instructions: 'Veuillez trier les énoncés selon votre propre point de vue.',
        consent_title: 'Consentement éclairé',
        consent_description:
            "**Confirmation de compréhension :** En cochant la case ci-dessous, vous confirmez avoir lu les objectifs et le déroulement de l'étude décrits sur la page d'accueil. Vous comprenez que cette tâche consiste à trier des énoncés afin de modéliser votre point de vue personnel et qu'il n'y a pas de bonnes ou de mauvaises réponses.\n\n**Confidentialité et protection des données :** Votre participation est anonyme. Vos réponses seront associées à un code et ne seront liées à votre identité dans aucun rapport ou publication. Les données collectées seront analysées collectivement pour identifier des perspectives partagées (facteurs). Les commentaires écrits fournis lors de la phase post-tri pourront être cités anonymement pour illustrer ces points de vue.\n\n**Participation volontaire :** La participation est entièrement volontaire. Vous vous réservez le droit d'interrompre le processus de tri et de fermer le navigateur à tout moment sans pénalité. Si vous vous retirez avant la soumission, vos données partielles ne seront pas conservées.",
        consent_accept: "J'accepte",
        consent_decline: 'Je refuse',
        condition_of_instruction:
            'Veuillez classer les énoncés suivants de celui avec lequel vous êtes le plus d’accord à celui avec lequel vous êtes le plus en désaccord',

        process_steps: [
            {
                id: 'profile',
                title: 'Faisons connaissance',
                description: 'Quelques questions rapides pour mieux comprendre votre parcours.',
                icon: 'User',
                color: '#3b82f6',
            },
            {
                id: 'rough',
                title: 'Premières impressions',
                description:
                    "Découvrez les énoncés et donnez votre réaction immédiate (d'accord, neutre ou pas d'accord).",
                icon: 'Zap',
                color: '#f59e0b',
            },
            {
                id: 'fine',
                title: 'Votre perspective',
                description:
                    'Placez les énoncés sur la grille pour affiner votre point de vue, en priorisant ce qui compte le plus pour vous.',
                icon: 'Target',
                color: '#8b5cf6',
            },
            {
                id: 'post',
                title: 'Pourquoi',
                description: 'Quelques mots pour expliquer vos choix les plus significatifs.',
                icon: 'MessageSquare',
                color: '#10b981',
            },
        ],
        methodology_tips: [
            'Astuce : commencez par ce qui est le plus évident pour vous (les extrêmes).',
            "Dans une même colonne, l'ordre de haut en bas n'a pas d'importance.",
            "Vous devez tout caser ! C'est parfois un casse-tête, mais c'est ainsi qu'on force la priorisation.",
            'Rappel : les énoncés sont classés les uns par rapport aux autres (accord relatif).',
            "N'hésitez pas à zoomer sur différents coins de la grille pour plus de confort (surtout sur mobile).",
            "Rien n'est définitif : vous pouvez déplacer les cartes ou les remettre dans la pile à tout moment.",
        ],
    },
    fi: {
        instructions: 'Lajittele väittämät oman näkemyksesi mukaan.',
        consent_title: 'Tietoon perustuva suostumus',
        consent_description:
            '**Ymmärryksen vahvistus:** Rastittamalla alla olevan ruudun vahvistat lukeneesi etusivulla kuvatut tutkimuksen tavoitteet ja prosessin. Ymmärrät, että tässä tehtävässä lajitellaan väitteitä henkilökohtaisen näkemyksesi mallintamiseksi, eikä oikeita tai vääriä vastauksia ole.\n\n**Luottamuksellisuus ja tietosuoja:** Osallistumisesi on nimetöntä. Vastauksesi yhdistetään koodiin, eikä niitä linkitetä henkilöllisyyteesi missään raportissa tai julkaisussa. Kerätyt tiedot analysoidaan kollektiivisesti jaettujen näkökulmien (tekijöiden) tunnistamiseksi. Lajittelun jälkeisessä vaiheessa annettuja kirjallisia kommentteja voidaan lainata nimettömästi näiden näkökulmien havainnollistamiseksi.\n\n**Vapaaehtoinen osallistuminen:** Osallistuminen on täysin vapaaehtoista. Pidätät oikeuden keskeyttää lajitteluprosessin ja sulkea selaimen milloin tahansa ilman seuraamuksia. Jos vetäydyt ennen lähettämistä, osittaisia tietojasi ei säilytetä.',
        consent_accept: 'Hyväksyn',
        consent_decline: 'En hyväksy',
        condition_of_instruction:
            'Ole hyvä ja järjestä seuraavat väittämät siitä, minkä kanssa olet eniten samaa mieltä, siihen, minkä kanssa olet eniten eri mieltä',

        process_steps: [
            {
                id: 'profile',
                title: 'Tutustutaan',
                description: 'Muutama nopea kysymys taustasi ymmärtämiseksi.',
                icon: 'User',
                color: '#3b82f6',
            },
            {
                id: 'rough',
                title: 'Ensivaikutelmat',
                description:
                    'Tutustu väittämiin ja anna välitön reaktiosi (samaa mieltä, neutraali tai eri mieltä).',
                icon: 'Zap',
                color: '#f59e0b',
            },
            {
                id: 'fine',
                title: 'Näkökulmasi',
                description:
                    'Aseta väittämät ruudukkoon tarkentaaksesi näkökulmaasi ja priorisoidaksesi sinulle tärkeimmät asiat.',
                icon: 'Target',
                color: '#8b5cf6',
            },
            {
                id: 'post',
                title: 'Miksi',
                description: 'Muutama sana merkittävimpien valintojesi selittämiseksi.',
                icon: 'MessageSquare',
                color: '#10b981',
            },
        ],
        methodology_tips: [
            'Vinkki: Aloita siitä, mikä on sinulle selkeintä (ääripäät).',
            'Samassa sarakkeessa järjestyksellä ylhäältä alas ei ole väliä.',
            'Kaikki pitää mahduttaa! Se voi olla palapeliä, mutta tarkoitus on priorisoida.',
            'Muistutus: väitteet lajitellaan suhteessa toisiinsa.',
            'Voit zoomata ruudukon eri osiin nähdäksesi paremmin.',
            'Mikään ei ole lopullista: voit siirtää kortteja tai palauttaa ne pakkaan milloin tahansa.',
        ],
    },
};

export const AVAILABLE_LANGUAGES = [
    { code: 'en', label: 'English', flag: '🇬🇧' },
    { code: 'fr', label: 'Français', flag: '🇫🇷' },
    { code: 'fi', label: 'Suomi', flag: '🇫🇮' },
];
