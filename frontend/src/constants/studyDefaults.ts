// biome-ignore lint/suspicious/noExplicitAny: default content is dynamic
export const DEFAULT_STUDY_CONTENT: Record<string, any> = {
    en: {
        instructions:
            'This study involves expressing your personal viewpoint through a sorting process. There are no right or wrong answers; we are simply interested in your perspective.',
        consent_title: 'Informed consent and data processing agreement',
        consent_description:
            '### 1. Nature of the study and participant understanding\\nBy checking the box below, you acknowledge that you have reviewed the study objectives outlined on the home page. You understand that this exercise employs **Q-methodology**, a research technique designed to model subjective viewpoints.\\n\\n* **Subjectivity:** The task requires you to sort statements according to their significance relative to your personal perspective.\\n* **No right or wrong:** Consequently, there are no objective "correct" answers, only your unique point of view.\\n\\n### 2. Data processing and pseudonymization (GDPR compliance)\\n**Data collection**\\nYour responses (the Q-sort configuration and post-sort explanations) will be assigned a unique alphanumeric code upon submission.\\n\\n**De-identification and retention**\\n* **Standard procedure:** Direct identifiers (such as IP addresses) are immediately converted into an anonymous code and are never stored in their original format. This technical process ensures that your digital footprint cannot be used to re-identify you once the session ends.\\n* **Exception for follow-up:** If you voluntarily provide your contact details at the end of the study for a follow-up contact, the link between your identity (email) and your response will be maintained for the duration of that specific follow-up phase.\\n\\n**Reporting**\\nThe final results will be presented in an anonymized format. Data will be aggregated to reveal shared social perspectives (factors). Qualitative comments may be quoted to contextualize these factors but will be screened to remove revealing details.\\n\\n### 3. Voluntary participation and right to withdraw\\nYour participation is strictly voluntary. You maintain the right to discontinue the sorting process and close your browser at any time prior to submission without penalty.\\n\\n* **Pre-submission:** If you withdraw before finalizing your sort, no partial data will be retained.\\n* **Post-submission:** Due to the statistical nature of Q-methodology (factor analysis), once your data has been submitted and aggregated into the dataset, individual withdrawal may not be feasible.\\n\\n### 4. Data retention and rights\\nIn accordance with the General Data Protection Regulation (GDPR), you retain the right to request access to, or rectification of, your personal data as long as it remains identifiable (i.e., prior to final anonymization).',
        pre_instruction:
            'Based on your personal point of view; divide the cards into three piles: those you agree with, those you disagree with, and those about which you are neutral or undecided.',
        condition_of_instruction:
            'Please rank the following statements from those you most agree with to those you most disagree with',

        process_steps: [
            {
                id: 'profile',
                title: "Let's meet",
                description: 'First, you will be asked a few short, preliminary questions.',
                icon: 'User',
                color: '#3b82f6',
            },
            {
                id: 'rough',
                title: 'First impressions',
                description:
                    'You will read through the different statements and roughly sort them according to your personal viewpoint: whether you tend to agree, feel neutral, or disagree with them. It will make the next task easier.',
                icon: 'Zap',
                color: '#f59e0b',
            },
            {
                id: 'fine',
                title: 'Your perspective',
                description:
                    'During the sorting stage, you will place the statements on a grid to refine your viewpoint. You will sort and rank the statements from “most agree” to “most disagree” by placing each statement in the corresponding box. There are no right or wrong answers. The best answer is the one that reflects your opinion, or beliefs.',
                icon: 'Target',
                color: '#8b5cf6',
            },
            {
                id: 'post',
                title: 'Why',
                description:
                    'Before the session ends, you will be asked a few clarifying questions to help us better understand your most significant choices, as well as a few questions about your background.',
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
        instructions:
            "Cette étude consiste à exprimer votre point de vue personnel à travers un processus de classement. Il n'y a pas de bonnes ou de mauvaises réponses ; nous sommes simplement intéressés par votre perspective.",
        consent_title: 'Consentement éclairé et accord de traitement des données',
        consent_description:
            "### 1. Nature de l'étude et compréhension du participant\\nEn cochant la case ci-dessous, vous confirmez avoir pris connaissance des objectifs de l'étude décrits sur la page d'accueil. Vous comprenez que cet exercice utilise la **méthodologie Q**, une technique de recherche conçue pour modéliser les points de vue subjectifs.\\n\\n* **Subjectivité :** La tâche consiste à trier des énoncés selon leur importance relative à votre perspective personnelle.\\n* **Pas de bonne ou mauvaise réponse :** Par conséquent, il n'y a pas de réponses \"correctes\" objectives, seulement votre point de vue unique.\\n\\n### 2. Traitement des données et pseudonymisation (conformité RGPD)\\n**Collecte des données**\\nVos réponses (la configuration du Q-sort et les explications post-tri) se verront attribuer un code alphanumérique unique lors de la soumission.\\n\\n**Désidentification et conservation**\\n* **Procédure standard :** Les identifiants directs (tels que les adresses IP) sont immédiatement convertis en code anonyme et ne sont jamais conservés sous leur format d'origine. Ce processus technique garantit que votre empreinte numérique ne peut être utilisée pour vous réidentifier une fois la session terminée.\\n* **Exception pour le suivi :** Si vous fournissez volontairement vos coordonnées à la fin de l'étude pour un contact de suivi, le lien entre votre identité (e-mail) et votre réponse sera maintenu pour la durée de cette phase de suivi spécifique.\\n\\n**Diffusion des résultats**\\nLes résultats finaux seront présentés sous forme anonymisée. Les données seront agrégées pour révéler des perspectives sociales partagées (facteurs). Les commentaires qualitatifs pourront être cités pour contextualiser ces facteurs, mais seront filtrés pour supprimer tout détail révélateur.\\n\\n### 3. Participation volontaire et droit de retrait\\nVotre participation est strictement volontaire. Vous conservez le droit d'interrompre le processus de tri et de fermer votre navigateur à tout moment avant la soumission, sans pénalité.\\n\\n* **Avant soumission :** Si vous vous retirez avant de finaliser votre tri, aucune donnée partielle ne sera conservée.\\n* **Après soumission :** En raison de la nature statistique de la méthodologie Q (analyse factorielle), une fois vos données soumises et agrégées dans le jeu de données, le retrait individuel pourrait ne plus être réalisable.\\n\\n### 4. Conservation des données et droits\\nConformément au Règlement général sur la protection des données (RGPD), vous conservez le droit de demander l'accès ou la rectification de vos données personnelles tant qu'elles restent identifiables (c'est-à-dire avant l'anonymisation finale).",
        pre_instruction:
            "Selon votre point de vue personnel, répartissez les cartes en trois piles : celles avec lesquelles vous êtes d'accord, celles avec lesquelles vous n'êtes pas d'accord, et celles pour lesquelles votre avis est neutre ou vous êtes indécis.",
        condition_of_instruction:
            "Veuillez classer les énoncés suivants de celui avec lequel vous êtes le plus d'accord à celui avec lequel vous êtes le plus en désaccord",

        process_steps: [
            {
                id: 'profile',
                title: 'Faisons connaissance',
                description:
                    'Tout d’abord, vous devrez répondre à quelques questions préliminaires courtes.',
                icon: 'User',
                color: '#3b82f6',
            },
            {
                id: 'rough',
                title: 'Premières impressions',
                description:
                    'Vous allez lire les différents énoncés et les classer approximativement selon votre point de vue personnel : si vous avez tendance à être d’accord, neutre ou en désaccord avec eux. Cela facilitera la tâche suivante.',
                icon: 'Zap',
                color: '#f59e0b',
            },
            {
                id: 'fine',
                title: 'Votre perspective',
                description:
                    'Lors de l’étape du classement, vous placerez les énoncés sur une grille pour affiner votre point de vue. Vous classerez et rangerez les énoncés de « tout à fait d’accord » à « pas du tout d’accord » en plaçant chaque énoncé dans la case correspondante. Il n’y a pas de bonnes ou de mauvaises réponses. La meilleure réponse est celle qui reflète votre opinion ou vos convictions.',
                icon: 'Target',
                color: '#8b5cf6',
            },
            {
                id: 'post',
                title: 'Pourquoi',
                description:
                    'Avant la fin de la session, vous devrez répondre à quelques questions de clarification pour nous aider à mieux comprendre vos choix les plus significatifs, ainsi qu’à quelques questions sur votre parcours.',
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
        instructions:
            'Tämä tutkimus käsittää oman näkökulmasi ilmaisemisen lajitteluprosessin kautta. Oikeita tai vääriä vastauksia ei ole; olemme kiinnostuneita vain sinun näkökulmastasi.',
        consent_title: 'Tietoon perustuva suostumus ja tietojenkäsittelysopimus',
        consent_description:
            '### 1. Tutkimuksen luonne ja osallistujan ymmärrys\\nRastittamalla alla olevan ruudun vahvistat tutustuneesi etusivulla kuvattuihin tutkimuksen tavoitteisiin. Ymmärrät, että tässä harjoituksessa käytetään **Q-metodologiaa**, joka on subjektiivisten näkökulmien mallintamiseen suunniteltu tutkimusmenetelmä.\\n\\n* **Subjektiivisuus:** Tehtävänäsi on lajitella väitteitä sen perusteella, kuinka merkityksellisiä ne ovat oman näkökulmasi kannalta.\\n* **Ei oikeita tai vääriä vastauksia:** Näin ollen objektiivisesti "oikeita" tai "vääriä" vastauksia ei ole, vain sinun ainutlaatuinen näkökulmasi.\\n\\n### 2. Tietojenkäsittely ja pseudonymisointi (GDPR:n noudattaminen)\\n**Tietojen keruu**\\nVastauksillesi (Q-lajittelu ja selitykset) annetaan yksilöllinen aakkosnumeerinen koodi lähettämisen yhteydessä.\\n\\n**Tunnisteiden poistaminen ja säilytys**\\n* **Vakiomenettely:** Suorat tunnisteet (kuten IP-osoitteet) muutetaan välittömästi tunnistamattomaksi koodiksi, eikä niitä koskaan tallenneta alkuperäisessä asussaan. Tämä tekninen prosessi varmistaa, ettei digitaalista jalanjälkeäsi voida käyttää tunnistamiseesi istunnon päätyttyä.\\n* **Poikkeus jatkotutkimusta varten:** Jos annat vapaaehtoisesti yhteystietosi tutkimuksen lopussa jatkoyhteydenottoa varten, yhteys henkilöllisyytesi (sähköposti) ja vastauksesi välillä säilytetään kyseisen seurantavaiheen keston ajan.\\n\\n**Raportointi**\\nLopulliset tulokset esitetään anonymisoidussa muodossa. Tiedot yhdistetään jaettujen sosiaalisten näkökulmien (faktorien) tunnistamiseksi. Laadullisia kommentteja voidaan lainata näiden faktorien havainnollistamiseksi, mutta ne tarkistetaan tunnistetietojen poistamiseksi.\\n\\n### 3. Vapaaehtoinen osallistuminen ja peruuttamisoikeus\\nOsallistumisesi on täysin vapaaehtoista. Sinulla on oikeus keskeyttää lajitteluprosessi ja sulkea selain milloin tahansa ennen vastausten lähettämistä ilman seuraamuksia.\\n\\n* **Ennen lähettämistä:** Jos keskeytät ennen lajittelun viimeistelyä, osittaisia tietoja ei tallenneta.\\n* **Lähettämisen jälkeen:** Q-metodologian tilastollisen luonteen (faktorianalyysi) vuoksi yksittäisen vastauksen poistaminen ei välttämättä ole mahdollista sen jälkeen, kun tiedot on lähetetty ja yhdistetty aineistoon.\\n\\n### 4. Tutkimusaineiston säilytys ja oikeudet\\nYleisen tietosuoja-asetuksen (GDPR) mukaisesti sinulla on oikeus pyytää pääsyä henkilötietoihisi tai niiden oikaisemista niin kauan kuin ne ovat tunnistettavissa (ts. ennen lopullista anonymisointia).',
        pre_instruction:
            'Lajittele väitteet kolmeen pinoon oman näkemyksesi mukaan: ne, joiden kanssa olet samaa mieltä, ne, joiden kanssa olet eri mieltä, ja ne, joihin suhtaudut neutraalisti tai joista et ole varma.',
        condition_of_instruction:
            'Ole hyvä ja järjestä seuraavat väittämät siitä, minkä kanssa olet eniten samaa mieltä, siihen, minkä kanssa olet eniten eri mieltä',

        process_steps: [
            {
                id: 'profile',
                title: 'Tutustutaan',
                description: 'Ensin sinulta kysytään muutamia lyhyitä taustakysymyksiä.',
                icon: 'User',
                color: '#3b82f6',
            },
            {
                id: 'rough',
                title: 'Ensivaikutelmat',
                description:
                    'Luet läpi erilaisia väittämiä ja lajittelet ne karkeasti oman näkemyksesi mukaan: oletko niiden kanssa samaa mieltä, neutraali vai eri mieltä. Tämä helpottaa seuraavaa tehtävää.',
                icon: 'Zap',
                color: '#f59e0b',
            },
            {
                id: 'fine',
                title: 'Näkökulmasi',
                description:
                    'Lajitteluvaiheen aikana asetat väittämät ruudukkoon tarkentaaksesi näkökulmaasi. Järjestät väittämät "eniten samaa mieltä" -vaihtoehdosta "eniten eri mieltä" -vaihtoehtoon asettamalla kunkin väittämän vastaavaan ruutuun. Oikeita tai vääriä vastauksia ei ole. Paras vastaus on se, joka heijastaa omaa mielipidettäsi tai uskomuksiasi.',
                icon: 'Target',
                color: '#8b5cf6',
            },
            {
                id: 'post',
                title: 'Miksi',
                description:
                    'Ennen istunnon päättymistä sinulta kysytään muutamia tarkentavia kysymyksiä, jotka auttavat meitä ymmärtämään paremmin merkittävimmät valintasi, sekä muutamia kysymyksiä taustastasi.',
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
