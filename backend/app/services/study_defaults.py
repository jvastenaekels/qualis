"""Default translations and process steps for new studies.

These constants provide sensible defaults in English, French, and Finnish
for consent text, methodology tips, step descriptions, etc.

The :func:`build_process_steps` and :func:`build_step_help` helpers filter
out the rough-sort entries when ``rough_sort_enabled`` is False (a study
that skips the 3-pile triage step).
"""

from ..types.wire import TranslationDefaults

DEFAULT_PROCESS_STEPS: dict[str, list[dict[str, str]]] = {
    "en": [
        {
            "id": "profile",
            "icon": "User",
            "title": "Let's meet",
            "description": "A few quick questions to better understand your background.",
            "color": "#3b82f6",
        },
        {
            "id": "rough",
            "icon": "Zap",
            "title": "First impressions",
            "description": "Discover the statements and give your immediate reaction (agree, neutral, or disagree).",
            "color": "#f59e0b",
        },
        {
            "id": "fine",
            "icon": "Target",
            "title": "Your perspective",
            "description": "Place the statements onto the grid to refine your point of view, prioritizing what matters most to you.",
            "color": "#8b5cf6",
        },
        {
            "id": "post",
            "icon": "MessageSquare",
            "title": "Why",
            "description": "A few words to explain your most significant choices.",
            "color": "#10b981",
        },
    ],
    "fr": [
        {
            "id": "profile",
            "icon": "User",
            "title": "Faisons connaissance",
            "description": "Quelques questions rapides pour mieux comprendre votre parcours.",
            "color": "#3b82f6",
        },
        {
            "id": "rough",
            "icon": "Zap",
            "title": "Premières impressions",
            "description": "Découvrez les affirmations et donnez votre réaction immédiate (d'accord, neutre ou pas d'accord).",
            "color": "#f59e0b",
        },
        {
            "id": "fine",
            "icon": "Target",
            "title": "Votre perspective",
            "description": "Placez les affirmations sur la grille pour affiner votre point de vue, en donnant la priorité à ce qui compte le plus pour vous.",
            "color": "#8b5cf6",
        },
        {
            "id": "post",
            "icon": "MessageSquare",
            "title": "Pourquoi",
            "description": "Quelques mots pour expliquer vos choix les plus significatifs.",
            "color": "#10b981",
        },
    ],
    "fi": [
        {
            "id": "profile",
            "icon": "User",
            "title": "Tutustutaan",
            "description": "Muutama nopea kysymys taustasi ymmärtämiseksi.",
            "color": "#3b82f6",
        },
        {
            "id": "rough",
            "icon": "Zap",
            "title": "Ensivaikutelma",
            "description": "Tutustu väittämiin ja anna välitön reaktiosi (samaa mieltä, neutraali tai eri mieltä).",
            "color": "#f59e0b",
        },
        {
            "id": "fine",
            "icon": "Target",
            "title": "Näkökulmasi",
            "description": "Aseta väittämät ruudukkoon tarkentaaksesi näkökulmaasi, priorisoimalla itsellesi tärkeimmät asiat.",
            "color": "#8b5cf6",
        },
        {
            "id": "post",
            "icon": "MessageSquare",
            "title": "Miksi",
            "description": "Muutama sana perustellaksesi merkittävimmät valintasi.",
            "color": "#10b981",
        },
    ],
}
DEFAULT_TRANSLATION_CONTENT: dict[str, TranslationDefaults] = {
    "en": {
        "instructions": "This study involves expressing your personal viewpoint through a sorting process. There are no right or wrong answers; we are simply interested in your perspective.",
        "consent_title": "Informed Consent",
        "consent_description": '### 1. Nature of the study and participant understanding\nBy checking the box below, you acknowledge that you have reviewed the study objectives outlined on the home page. You understand that this exercise employs Q-methodology, a research technique designed to model subjective viewpoints. The task requires you to sort statements according to their significance relative to your personal perspective; consequently, there are no objective "right" or "wrong" answers.\n\n### 2. Data processing and pseudonymization (GDPR compliance)\n**Data collection:** Your responses (the Q-sort configuration and post-sort explanations) will be assigned a unique alphanumeric code upon submission.\n\n**De-identification and retention:**\n* **Standard procedure:** Direct identifiers (such as IP addresses) are immediately converted into an anonymous code and are never stored in their original format. This technical process ensures that your digital footprint cannot be used to re-identify you once the session ends.\n* **Exception for follow-up:** If you voluntarily provide your contact details at the end of the study for a follow-up contact, the link between your identity (email) and your response will be maintained strictly for the duration of that specific follow-up phase.\n\n**Reporting:** The final results will be presented in an anonymized format. Data will be aggregated to reveal shared social perspectives (factors). Qualitative comments may be quoted to contextualize these factors but will be screened to remove revealing details.\n\n### 3. Voluntary participation and right to withdraw\nYour participation is strictly voluntary. You maintain the right to discontinue the sorting process and close your browser at any time prior to submission without penalty.\n\n**Pre-submission:** If you withdraw before finalizing your sort, no partial data will be retained.',
        "pre_instruction": "Based on your personal point of view; divide the cards into three piles: those you agree with, those you disagree with, and those about which you are neutral or undecided.",
        "condition_of_instruction": "Please rank the following statements from those you most agree with to those you most disagree with",
        "methodology_tips": [
            "Tip: Start with what is most obvious to you (the extremes).",
            "In the same column, the order from top to bottom doesn't matter.",
            "You have to fit everything! It can be a puzzle, but that's how we prioritize choices.",
            "Reminder: items are sorted relative to each other (relative agreement).",
            "Feel free to zoom in on different parts of the grid for better visibility.",
            "Nothing is final: you can move cards or put them back in the deck at any time.",
        ],
        "step_help": {
            "welcome": {
                "what": "Read the research objectives and the specific instructions for participation.",
                "why": "Beyond standard ethical consent, this ensures you grasp the specific 'condition of instruction'\u2014the precise lens or scenario you must adopt to evaluate the statements\u2014which is essential for data validity.",
            },
            "presort": {
                "what": "Provide background information to help characterize your participant profile.",
                "why": "This context allows the research team to analyze how distinct viewpoints (factors) may or may not correlate with specific demographic variables or professional backgrounds within the participant group.",
            },
            "rough": {
                "what": "Sort the deck of statements into three initial piles based on your immediate reaction.",
                "why": "This preparatory step is designed to reduce cognitive load; it allows you to familiarize yourself with the full range of the topic (the Q-set) before the more demanding task of comparative ranking begins.",
            },
            "fine": {
                "what": "Place the statements on the grid by ranking them relative to one another, from those you most agree with (to the right) to those you most disagree with (to the left). Starting with the extremes might help you in this task.",
                "why": "The grid's structure imposes a 'forced distribution' that prevents you from rating everything as equally important; it compels you to make trade-offs, thereby modelling the relative significance of each idea in your specific belief system.",
            },
            "post": {
                "what": "Confirm your grid arrangement and add comments explaining your strongest choices.",
                "why": "Your qualitative explanations are critical for validating the statistical analysis; they help the researchers interpret the data through your logic rather than imposing their own assumptions on your choices.",
            },
        },
    },
    "fr": {
        "instructions": "Cette \u00e9tude consiste \u00e0 exprimer votre point de vue personnel \u00e0 travers un processus de classement. Il n'y a pas de bonnes ou de mauvaises r\u00e9ponses ; nous sommes simplement int\u00e9ress\u00e9s par votre perspective.",
        "consent_title": "Consentement \u00e9clair\u00e9",
        "consent_description": "### Confirmation de compr\u00e9hension\nEn cochant la case ci-dessous, vous confirmez avoir lu les objectifs et le d\u00e9roulement de l'\u00e9tude d\u00e9crits sur la page d'accueil. Vous comprenez que :\n* Cette t\u00e2che consiste \u00e0 trier des \u00e9nonc\u00e9s afin de mod\u00e9liser votre point de vue personnel.\n* Il n'y a pas de bonnes ou de mauvaises r\u00e9ponses.\n\n### Confidentialit\u00e9 et protection des donn\u00e9es\n* **Anonymat :** Votre participation est anonyme. Vos r\u00e9ponses seront associ\u00e9es \u00e0 un code et ne seront li\u00e9es \u00e0 votre identit\u00e9 dans aucun rapport ou publication.\n* **Usage des donn\u00e9es :** Les donn\u00e9es collect\u00e9es seront analys\u00e9es collectivement pour identifier des perspectives partag\u00e9es (facteurs).\n* **Citations :** Les commentaires \u00e9crits fournis lors de la phase post-tri pourront \u00eatre cit\u00e9s anonymement pour illustrer ces points de vue.\n\n### Participation volontaire\nLa participation est enti\u00e8rement volontaire. Vous vous r\u00e9servez le droit d'interrompre le processus de tri et de fermer le navigateur \u00e0 tout moment sans p\u00e9nalit\u00e9. Si vous vous retirez avant la soumission, vos donn\u00e9es partielles ne seront pas conserv\u00e9es.",
        "pre_instruction": "Selon votre point de vue personnel, r\u00e9partissez les cartes en trois piles : celles avec lesquelles vous \u00eates d'accord, celles avec lesquelles vous n'\u00eates pas d'accord, et celles pour lesquelles votre avis est neutre ou vous \u00eates ind\u00e9cis.",
        "condition_of_instruction": "Veuillez classer les \u00e9nonc\u00e9s suivants de celui avec lequel vous \u00eates le plus d'accord \u00e0 celui avec lequel vous \u00eates le plus en d\u00e9saccord",
        "methodology_tips": [
            "Astuce : commencez par ce qui est le plus \u00e9vident pour vous (les extr\u00eames).",
            "Dans une m\u00eame colonne, l'ordre de haut en bas n'a pas d'importance.",
            "Vous devez tout caser ! C'est parfois un casse-t\u00eate, mais c'est ainsi qu'on force la priorisation.",
            "Rappel : les \u00e9nonc\u00e9s sont class\u00e9s les uns par rapport aux autres (accord relatif).",
            "N'h\u00e9sitez pas \u00e0 zoomer sur diff\u00e9rents coins de la grille pour plus de confort (surtout sur mobile).",
            "Rien n'est d\u00e9finitif : vous pouvez d\u00e9placer les cartes ou les remettre dans la pile \u00e0 tout moment.",
        ],
        "step_help": {
            "welcome": {
                "what": "Lisez les objectifs de l'\u00e9tude et les instructions sp\u00e9cifiques de participation.",
                "why": "Au-del\u00e0 du consentement \u00e9thique, cela garantit que vous saisissez bien la \u00ab consigne sp\u00e9cifique \u00bb (l'angle pr\u00e9cis sous lequel vous devez \u00e9valuer les \u00e9nonc\u00e9s), ce qui est essentiel \u00e0 la validit\u00e9 des donn\u00e9es.",
            },
            "presort": {
                "what": "Renseignez les informations d'arri\u00e8re-plan pour aider \u00e0 caract\u00e9riser votre profil.",
                "why": "Ce contexte permet \u00e0 l'\u00e9quipe de recherche d'analyser comment des points de vue distincts peuvent \u00eatre corr\u00e9l\u00e9s (ou non) avec certaines variables d\u00e9mographiques ou professionnelles au sein du groupe de participants.",
            },
            "rough": {
                "what": "Triez le jeu d'\u00e9nonc\u00e9s en trois piles initiales bas\u00e9es sur votre r\u00e9action imm\u00e9diate.",
                "why": "Cette \u00e9tape pr\u00e9paratoire vise \u00e0 r\u00e9duire la charge cognitive ; elle vous permet de vous familiariser avec l'ensemble du sujet avant d'entamer la t\u00e2che plus exigeante du classement comparatif.",
            },
            "fine": {
                "what": "Placez les \u00e9nonc\u00e9s sur la grille, en allant des extr\u00eames vers le centre.",
                "why": "La structure de la grille impose une \u00ab distribution forc\u00e9e \u00bb qui vous emp\u00eache de tout noter au m\u00eame niveau ; elle vous oblige \u00e0 faire des arbitrages, mod\u00e9lisant ainsi l'importance relative de chaque id\u00e9e dans votre syst\u00e8me de pens\u00e9e.",
            },
            "post": {
                "what": "Confirmez la disposition de votre grille et ajoutez des commentaires expliquant vos choix les plus marqu\u00e9s.",
                "why": "Vos explications qualitatives sont cruciales pour valider l'analyse statistique ; elles aident les chercheurs \u00e0 interpr\u00e9ter les donn\u00e9es selon votre logique propre, plut\u00f4t que de plaquer leurs hypoth\u00e8ses sur vos choix.",
            },
        },
    },
    "fi": {
        "instructions": "T\u00e4m\u00e4 tutkimus k\u00e4sitt\u00e4\u00e4 oman n\u00e4k\u00f6kulmasi ilmaisemisen lajitteluprosessin kautta. Oikeita tai v\u00e4\u00e4ri\u00e4 vastauksia ei ole; olemme kiinnostuneita vain sinun n\u00e4k\u00f6kulmastasi.",
        "consent_title": "Tietoon perustuva suostumus",
        "consent_description": "### Ymm\u00e4rryksen vahvistus\nRastittamalla alla olevan ruudun vahvistat lukeneesi etusivulla kuvatut tutkimuksen tavoitteet ja prosessin. Ymm\u00e4rr\u00e4t ett\u00e4:\n* T\u00e4ss\u00e4 teht\u00e4v\u00e4ss\u00e4 lajitellaan v\u00e4itteit\u00e4 henkil\u00f6kohtaisen n\u00e4kemyksesi mallintamiseksi.\n* Oikeita tai v\u00e4\u00e4ri\u00e4 vastauksia ei ole.\n\n### Luottamuksellisuus ja tietosuoja\n* **Nimett\u00f6myys:** Osallistumisesi on nimet\u00f6nt\u00e4. Vastauksesi yhdistet\u00e4\u00e4n koodiin, eik\u00e4 niit\u00e4 linkitet\u00e4 henkil\u00f6llisyytesi miss\u00e4\u00e4n raportissa tai julkaisussa.\n* **Tietojen k\u00e4ytt\u00f6:** Ker\u00e4tyt tiedot analysoidaan kollektiivisesti jaettujen n\u00e4k\u00f6kulmien (tekij\u00f6iden) tunnistamiseksi.\n* **Lainaukset:** Lajittelun j\u00e4lkeisess\u00e4 vaiheessa annettuja kirjallisia kommentteja voidaan lainata nimett\u00f6m\u00e4sti n\u00e4iden n\u00e4k\u00f6kulmien havainnollistamiseksi.\n\n### Vapaaehtoinen osallistuminen\nOsallistuminen on t\u00e4ysin vapaaehtoista. Pid\u00e4t\u00e4t oikeuden keskeyttää lajitteluprosessin ja sulkea selaimen milloin tahansa ilman seuraamuksia. Jos vetäydyt ennen lähettämistä, osittaisia tietojasi ei säilytetä.",
        "pre_instruction": "Lajittele v\u00e4itteet kolmeen pinoon oman n\u00e4kemyksesi mukaan: ne, joiden kanssa olet samaa mielt\u00e4, ne, joiden kanssa olet eri mielt\u00e4, ja ne, joihin suhtaudut neutraalisti tai joista et ole varma.",
        "condition_of_instruction": "Ole hyv\u00e4 ja j\u00e4rjest\u00e4 seuraavat v\u00e4itt\u00e4m\u00e4t siit\u00e4, mink\u00e4 kanssa olet eniten samaa mielt\u00e4, siihen, mink\u00e4 kanssa olet eniten eri mielt\u00e4",
        "methodology_tips": [
            "Vinkki: Aloita siit\u00e4, mik\u00e4 on sinulle selkeint\u00e4 (\u00e4\u00e4rip\u00e4\u00e4t).",
            "Samassa sarakkeessa j\u00e4rjestyksell\u00e4 ylh\u00e4\u00e4lt\u00e4 alas ei ole v\u00e4li\u00e4.",
            "Kaikki pit\u00e4\u00e4 mahduttaa! Se voi olla palapeli\u00e4, mutta tarkoitus on priorisoida.",
            "Muistutus: v\u00e4itteet lajitellaan suhteessa toisiinsa.",
            "Voit zoomata ruudukon eri osiin n\u00e4hd\u00e4ksesi paremmin.",
            "Mik\u00e4\u00e4n ei ole lopullista: voit siirt\u00e4\u00e4 kortteja tai palauttaa ne pakkaan milloin tahansa.",
        ],
        "step_help": {
            "welcome": {
                "what": "Lue tutkimuksen tavoitteet ja osallistumisohjeet huolellisesti.",
                "why": "Eettisen suostumuksen lis\u00e4ksi t\u00e4m\u00e4 varmistaa, ett\u00e4 ymm\u00e4rr\u00e4t 'ohjeistuksen ehdon' (tietty n\u00e4k\u00f6kulma, jonka kautta v\u00e4itt\u00e4mi\u00e4 tulee arvioida), mik\u00e4 on v\u00e4ltt\u00e4m\u00e4t\u00f6nt\u00e4 tiedon luotettavuuden kannalta.",
            },
            "presort": {
                "what": "Anna taustatietoja profiilisi m\u00e4\u00e4rittelemiseksi.",
                "why": "T\u00e4m\u00e4 taustoitus mahdollistaa sen, ett\u00e4 tutkijat voivat analysoida, miten erilaiset n\u00e4k\u00f6kulmat (faktorits) korreloivat osallistujaryhmän taustamuuttujien kanssa.",
            },
            "rough": {
                "what": "Lajittele v\u00e4itt\u00e4m\u00e4t kolmeen alustavaan pinoon v\u00e4litt\u00f6m\u00e4n reaktiosi perusteella.",
                "why": "T\u00e4m\u00e4 valmisteleva vaihe on suunniteltu v\u00e4hent\u00e4m\u00e4\u00e4n kognitiivista kuormitusta; sen avulla voit tutustua aihepiiriin kokonaisuudessaan ennen vaativampaa vertailevaa j\u00e4rjest\u00e4mist\u00e4.",
            },
            "fine": {
                "what": "Asettele v\u00e4itt\u00e4m\u00e4t ruudukkoon siirtym\u00e4ll\u00e4 \u00e4\u00e4rip\u00e4ist\u00e4 kohti keskustaa.",
                "why": "Ruudukon rakenne asettaa 'pakotetun jakauman', joka est\u00e4\u00e4 pit\u00e4m\u00e4st\u00e4 kaikkia asioita yht\u00e4 t\u00e4rkein\u00e4; se pakottaa tekemään arvovalintoja, mik\u00e4 mallintaa kunkin idean suhteellista merkityst\u00e4 ajattelussasi.",
            },
            "post": {
                "what": "Vahvista ruudukon j\u00e4rjestys ja lis\u00e4\u00e4 kommentteja, joissa selit\u00e4t vahvimmat valintasi.",
                "why": "Laadulliset selityksesi ovat kriittisi\u00e4 tilastollisen analyysin validoimiseksi; ne auttavat tutkijoita tulkitsemaan tietoja sinun logiikkasi kautta sen sijaan, ett\u00e4 he tekisiv\u00e4t omia oletuksiaan valinnoistasi.",
            },
        },
    },
}


def _resolve_locale(locale: str, table: dict[str, object]) -> str:
    return locale if locale in table else "en"


def build_process_steps(
    *, rough_sort_enabled: bool, locale: str
) -> list[dict[str, str]]:
    """Return the default ``process_steps`` for ``locale``, filtering out
    the rough-sort entry when the study has the rough step disabled.
    """
    key = _resolve_locale(locale, DEFAULT_PROCESS_STEPS)  # type: ignore[arg-type]
    steps = DEFAULT_PROCESS_STEPS[key]
    if rough_sort_enabled:
        return [dict(s) for s in steps]
    return [dict(s) for s in steps if s.get("id") != "rough"]


def build_step_help(
    *, rough_sort_enabled: bool, locale: str
) -> dict[str, dict[str, str]]:
    """Return the default ``step_help`` for ``locale``, dropping the
    ``rough`` key when the study has the rough step disabled.
    """
    key = _resolve_locale(locale, DEFAULT_TRANSLATION_CONTENT)  # type: ignore[arg-type]
    defaults = DEFAULT_TRANSLATION_CONTENT[key]
    help_dict = defaults["step_help"]
    if rough_sort_enabled:
        return {k: {"what": v["what"], "why": v["why"]} for k, v in help_dict.items()}
    return {
        k: {"what": v["what"], "why": v["why"]}
        for k, v in help_dict.items()
        if k != "rough"
    }
