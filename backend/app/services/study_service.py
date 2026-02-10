# Libre-Q - Open-source platform for conducting Q-methodology research
# Copyright (C) 2025 Julien Vastenekels
# Licensed under the GNU Affero General Public License v3.0 or later.

"""Service layer for Study-related operations."""

import logging
from collections import Counter
from datetime import datetime, timezone
from typing import Any, cast
import hashlib
import json
from uuid import UUID
from fastapi import HTTPException
from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ..models import (
    AudioRecording,
    Participant,
    ParticipantStatus,
    QSortEntry,
    Statement,
    Study,
    StudyState,
    StudyTranslation,
)
from ..schemas import SubmissionInput
from .recruitment_service import RecruitmentService
from ..utils.crypto import hash_ip

logger = logging.getLogger(__name__)


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
DEFAULT_TRANSLATION_CONTENT: dict[str, dict[str, Any]] = {
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
                "why": "Beyond standard ethical consent, this ensures you grasp the specific 'condition of instruction'—the precise lens or scenario you must adopt to evaluate the statements—which is essential for data validity.",
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
        "instructions": "Cette étude consiste à exprimer votre point de vue personnel à travers un processus de classement. Il n'y a pas de bonnes ou de mauvaises réponses ; nous sommes simplement intéressés par votre perspective.",
        "consent_title": "Consentement éclairé",
        "consent_description": "### Confirmation de compréhension\nEn cochant la case ci-dessous, vous confirmez avoir lu les objectifs et le déroulement de l'étude décrits sur la page d'accueil. Vous comprenez que :\n* Cette tâche consiste à trier des énoncés afin de modéliser votre point de vue personnel.\n* Il n'y a pas de bonnes ou de mauvaises réponses.\n\n### Confidentialité et protection des données\n* **Anonymat :** Votre participation est anonyme. Vos réponses seront associées à un code et ne seront liées à votre identité dans aucun rapport ou publication.\n* **Usage des données :** Les données collectées seront analysées collectivement pour identifier des perspectives partagées (facteurs).\n* **Citations :** Les commentaires écrits fournis lors de la phase post-tri pourront être cités anonymement pour illustrer ces points de vue.\n\n### Participation volontaire\nLa participation est entièrement volontaire. Vous vous réservez le droit d'interrompre le processus de tri et de fermer le navigateur à tout moment sans pénalité. Si vous vous retirez avant la soumission, vos données partielles ne seront pas conservées.",
        "pre_instruction": "Selon votre point de vue personnel, répartissez les cartes en trois piles : celles avec lesquelles vous êtes d'accord, celles avec lesquelles vous n'êtes pas d'accord, et celles pour lesquelles votre avis est neutre ou vous êtes indécis.",
        "condition_of_instruction": "Veuillez classer les énoncés suivants de celui avec lequel vous êtes le plus d’accord à celui avec lequel vous êtes le plus en désaccord",
        "methodology_tips": [
            "Astuce : commencez par ce qui est le plus évident pour vous (les extrêmes).",
            "Dans une même colonne, l'ordre de haut en bas n'a pas d'importance.",
            "Vous devez tout caser ! C'est parfois un casse-tête, mais c'est ainsi qu'on force la priorisation.",
            "Rappel : les énoncés sont classés les uns par rapport aux autres (accord relatif).",
            "N'hésitez pas à zoomer sur différents coins de la grille pour plus de confort (surtout sur mobile).",
            "Rien n'est définitif : vous pouvez déplacer les cartes ou les remettre dans la pile à tout moment.",
        ],
        "step_help": {
            "welcome": {
                "what": "Lisez les objectifs de l'étude et les instructions spécifiques de participation.",
                "why": "Au-delà du consentement éthique, cela garantit que vous saisissez bien la « consigne spécifique » (l'angle précis sous lequel vous devez évaluer les énoncés), ce qui est essentiel à la validité des données.",
            },
            "presort": {
                "what": "Renseignez les informations d'arrière-plan pour aider à caractériser votre profil.",
                "why": "Ce contexte permet à l'équipe de recherche d'analyser comment des points de vue distincts peuvent être corrélés (ou non) avec certaines variables démographiques ou professionnelles au sein du groupe de participants.",
            },
            "rough": {
                "what": "Triez le jeu d'énoncés en trois piles initiales basées sur votre réaction immédiate.",
                "why": "Cette étape préparatoire vise à réduire la charge cognitive ; elle vous permet de vous familiariser avec l'ensemble du sujet avant d'entamer la tâche plus exigeante du classement comparatif.",
            },
            "fine": {
                "what": "Placez les énoncés sur la grille, en allant des extrêmes vers le centre.",
                "why": "La structure de la grille impose une « distribution forcée » qui vous empêche de tout noter au même niveau ; elle vous oblige à faire des arbitrages, modélisant ainsi l'importance relative de chaque idée dans votre système de pensée.",
            },
            "post": {
                "what": "Confirmez la disposition de votre grille et ajoutez des commentaires expliquant vos choix les plus marqués.",
                "why": "Vos explications qualitatives sont cruciales pour valider l'analyse statistique ; elles aident les chercheurs à interpréter les données selon votre logique propre, plutôt que de plaquer leurs hypothèses sur vos choix.",
            },
        },
    },
    "fi": {
        "instructions": "Tämä tutkimus käsittää oman näkökulmasi ilmaisemisen lajitteluprosessin kautta. Oikeita tai vääriä vastauksia ei ole; olemme kiinnostuneita vain sinun näkökulmastasi.",
        "consent_title": "Tietoon perustuva suostumus",
        "consent_description": "### Ymmärryksen vahvistus\nRastittamalla alla olevan ruudun vahvistat lukeneesi etusivulla kuvatut tutkimuksen tavoitteet ja prosessin. Ymmärrät että:\n* Tässä tehtävässä lajitellaan väitteitä henkilökohtaisen näkemyksesi mallintamiseksi.\n* Oikeita tai vääriä vastauksia ei ole.\n\n### Luottamuksellisuus ja tietosuoja\n* **Nimettömyys:** Osallistumisesi on nimetöntä. Vastauksesi yhdistetään koodiin, eikä niitä linkitetä henkilöllisyyteesi missään raportissa tai julkaisussa.\n* **Tietojen käyttö:** Kerätyt tiedot analysoidaan kollektiivisesti jaettujen näkökulmien (tekijöiden) tunnistamiseksi.\n* **Lainaukset:** Lajittelun jälkeisessä vaiheessa annettuja kirjallisia kommentteja voidaan lainata nimettömästi näiden näkökulmien havainnollistamiseksi.\n\n### Vapaaehtoinen osallistuminen\nOsallistuminen on täysin vapaaehtoista. Pidätät oikeuden keskeyttää lajitteluprosessin ja sulkea selaimen milloin tahansa ilman seuraamuksia. Jos vetäydyt ennen lähettämistä, osittaisia tietojasi ei säilytetä.",
        "pre_instruction": "Lajittele väitteet kolmeen pinoon oman näkemyksesi mukaan: ne, joiden kanssa olet samaa mieltä, ne, joiden kanssa olet eri mieltä, ja ne, joihin suhtaudut neutraalisti tai joista et ole varma.",
        "condition_of_instruction": "Ole hyvä ja järjestä seuraavat väittämät siitä, minkä kanssa olet eniten samaa mieltä, siihen, minkä kanssa olet eniten eri mieltä",
        "methodology_tips": [
            "Vinkki: Aloita siitä, mikä on sinulle selkeintä (ääripäät).",
            "Samassa sarakkeessa järjestyksellä ylhäältä alas ei ole väliä.",
            "Kaikki pitää mahduttaa! Se voi olla palapeliä, mutta tarkoitus on priorisoida.",
            "Muistutus: väitteet lajitellaan suhteessa toisiinsa.",
            "Voit zoomata ruudukon eri osiin nähdäksesi paremmin.",
            "Mikään ei ole lopullista: voit siirtää kortteja tai palauttaa ne pakkaan milloin tahansa.",
        ],
        "step_help": {
            "welcome": {
                "what": "Lue tutkimuksen tavoitteet ja osallistumisohjeet huolellisesti.",
                "why": "Eettisen suostumuksen lisäksi tämä varmistaa, että ymmärrät 'ohjeistuksen ehdon' (tietty näkökulma, jonka kautta väittämiä tulee arvioida), mikä on välttämätöntä tiedon luotettavuuden kannalta.",
            },
            "presort": {
                "what": "Anna taustatietoja profiilisi määrittelemiseksi.",
                "why": "Tämä taustoitus mahdollistaa sen, että tutkijat voivat analysoida, miten erilaiset näkökulmat (faktorits) korreloivat osallistujaryhmän taustamuuttujien kanssa.",
            },
            "rough": {
                "what": "Lajittele väittämät kolmeen alustavaan pinoon välittömän reaktiosi perusteella.",
                "why": "Tämä valmisteleva vaihe on suunniteltu vähentämään kognitiivista kuormitusta; sen avulla voit tutustua aihepiiriin kokonaisuudessaan ennen vaativampaa vertailevaa järjestämistä.",
            },
            "fine": {
                "what": "Asettele väittämät ruudukkoon siirtymällä ääripäistä kohti keskustaa.",
                "why": "Ruudukon rakenne asettaa 'pakotetun jakauman', joka estää pitämästä kaikkia asioita yhtä tärkeinä; se pakottaa tekemään arvovalintoja, mikä mallintaa kunkin idean suhteellista merkitystä ajattelussasi.",
            },
            "post": {
                "what": "Vahvista ruudukon järjestys ja lisää kommentteja, joissa selität vahvimmat valintasi.",
                "why": "Laadulliset selityksesi ovat kriittisiä tilastollisen analyysin validoimiseksi; ne auttavat tutkijoita tulkitsemaan tietoja sinun logiikkasi kautta sen sijaan, että he tekisivät omia oletuksiaan valinnoistasi.",
            },
        },
    },
}


class StudyService:
    """Service handling study logic."""

    @staticmethod
    async def get_study_by_slug(db: AsyncSession, slug: str) -> Study | None:
        """Retrieve a study by its slug with relations loaded."""
        stmt = (
            select(Study)
            .where(Study.slug == slug)
            .options(
                selectinload(Study.translations),
                selectinload(Study.statements).selectinload(Statement.translations),
                selectinload(Study.participants),
            )
        )
        result = await db.execute(stmt)
        return cast(Study | None, result.scalar_one_or_none())

    @staticmethod
    def _generate_session_seed(token: str) -> int:
        """Generate deterministic seed from submission token for reproducible randomization"""
        return int(hashlib.sha256(token.encode()).hexdigest()[:8], 16)

    @staticmethod
    async def record_consent(
        db: AsyncSession,
        study_slug: str,
        session_token: Any,
        language_code: str,
        consent_hash: str | None = None,
        ip_address: str | None = None,
        user_agent: str | None = None,
        is_test_run: bool = False,
    ):
        """Records the exact time and version (hash) of consent."""
        # 1. Get Study
        study = await StudyService.get_study_by_slug(db, study_slug)
        if not study:
            raise HTTPException(status_code=404, detail="Study not found")

        hashed_ip = hash_ip(ip_address or "unknown")

        # 2. Check if participant exists
        stmt = (
            select(Participant)
            .where(Participant.session_token == session_token)
            .with_for_update()
        )
        result = await db.execute(stmt)
        participant = result.scalar_one_or_none()

        if not participant:
            try:
                # Create new participant record immediately upon consent
                participant = Participant(
                    study_id=study.id,
                    session_token=session_token,
                    language_used=language_code,
                    random_seed=str(
                        StudyService._generate_session_seed(str(session_token))
                    )
                    if study.randomize_statement_order
                    else None,
                    consented_at=datetime.now(timezone.utc),
                    consent_hash=consent_hash,
                    ip_address=hashed_ip,
                    user_agent=user_agent,
                    status=ParticipantStatus.started,
                    is_discarded=is_test_run,
                    discard_reason="Test Run" if is_test_run else None,
                )
                db.add(participant)
                await db.flush()
            except IntegrityError:
                # Race condition: Participant created concurrently
                await db.rollback()
                result = await db.execute(stmt)
                participant = result.scalar_one_or_none()
                if not participant:
                    raise HTTPException(
                        status_code=500, detail="Concurrency error during consent."
                    )

        # If we fell through (update existing)
        if participant and participant not in db.new:
            participant.consented_at = datetime.now(timezone.utc)
            participant.consent_hash = consent_hash
            participant.language_used = language_code
            participant.ip_address = hashed_ip
            participant.user_agent = user_agent
            if is_test_run:
                participant.is_discarded = True
                participant.discard_reason = "Test Run"

        await db.commit()
        return {"status": "recorded"}

    @staticmethod
    def resolve_translation(
        study: Study, requested_lang: str | None
    ) -> tuple[str, StudyTranslation | None]:
        """Logic: Requested Lang -> Default (Study) -> English -> First Available."""
        # 1. Requested
        translation = next(
            (t for t in study.translations if t.language_code == requested_lang), None
        )

        # 2. Default (Study)
        if not translation and study.default_language:
            translation = next(
                (
                    t
                    for t in study.translations
                    if t.language_code == study.default_language
                ),
                None,
            )

        # 3. English
        if not translation:
            translation = next(
                (t for t in study.translations if t.language_code == "en"), None
            )

        # 4. First Available
        if not translation and study.translations:
            translation = study.translations[0]

        # Use study.default_language if no translation found at all, fallback to 'en'
        resolved_lang = (
            translation.language_code
            if translation
            else (study.default_language or "en")
        )
        return resolved_lang, translation

    @staticmethod
    def get_basic_metadata(study: Study, lang: str | None = None) -> dict[str, Any]:
        """Returns minimal robust metadata (title, description) for locked screens."""
        resolved_lang, translation = StudyService.resolve_translation(study, lang)

        # Robust title fallback
        title = getattr(translation, "title", "")
        if not title:
            # Fallback to English title, then first available, then slug
            _, eng_trans = StudyService.resolve_translation(study, "en")
            title = getattr(eng_trans, "title", "")
            if not title and study.translations:
                title = getattr(study.translations[0], "title", "")
            if not title:
                title = study.slug

        # Robust description fallback
        description = getattr(translation, "description", "")
        if not description:
            _, eng_trans = StudyService.resolve_translation(study, "en")
            description = getattr(eng_trans, "description", "")

        return {
            "slug": study.slug,
            "title": title,
            "description": description,
            "language": resolved_lang,
        }

    @staticmethod
    async def get_resolved_study_config(
        study: Study,
        lang: str | None = None,
        session_token: UUID | None = None,
    ) -> dict[str, Any]:
        """Resolves study configuration including translations, randomization, and state."""
        resolved_lang, translation = StudyService.resolve_translation(study, lang)

        # Transform to Frontend Format
        # Get defaults for the resolved language (try full code, then base lang, then English)
        base_lang = resolved_lang.split("-")[0]
        lang_defaults = (
            DEFAULT_TRANSLATION_CONTENT.get(resolved_lang)
            or DEFAULT_TRANSLATION_CONTENT.get(base_lang)
            or DEFAULT_TRANSLATION_CONTENT.get("en", {})
        )

        title = getattr(translation, "title", "") or study.slug
        description = getattr(translation, "description", "") or lang_defaults.get(
            "description", ""
        )
        instructions = getattr(translation, "instructions", "") or lang_defaults.get(
            "instructions", ""
        )
        condition_of_instruction = getattr(
            translation, "condition_of_instruction", None
        ) or lang_defaults.get(
            "condition_of_instruction", "What is your stance on this statement?"
        )

        subtitle = getattr(translation, "subtitle", None) or lang_defaults.get(
            "subtitle", None
        )
        objective = getattr(translation, "objective", None) or lang_defaults.get(
            "objective", None
        )

        statements_data = []
        for s in study.statements:
            # Resolve statement translation
            s_trans = next(
                (t for t in s.translations if t.language_code == resolved_lang), None
            )
            if not s_trans:
                s_trans = next(
                    (t for t in s.translations if t.language_code == "en"), None
                )
            if not s_trans and s.translations:
                s_trans = s.translations[0]

            text = s_trans.text if s_trans else s.code
            statements_data.append({"id": s.id, "text": text, "code": s.code})

        # Q Methodology: Randomize statement order if configured
        if study.randomize_statement_order and session_token:
            import random

            local_random = random.Random(
                StudyService._generate_session_seed(str(session_token))
            )
            local_random.shuffle(statements_data)

        # Helper for translation attributes
        def get_t_attr(attr: str, default: Any = None) -> Any:
            return getattr(translation, attr, default) if translation else default

        # Calculate effective state based on dates
        from datetime import datetime, timezone

        now = datetime.now(timezone.utc)
        effective_state = study.state.value

        if study.state == StudyState.active:

            def is_now_before(target_dt: datetime) -> bool:
                if target_dt.tzinfo is None:
                    return now.replace(tzinfo=None) < target_dt
                return now < target_dt

            def is_now_after(target_dt: datetime) -> bool:
                if target_dt.tzinfo is None:
                    return now.replace(tzinfo=None) > target_dt
                return now > target_dt

            if study.start_date and is_now_before(study.start_date):
                effective_state = StudyState.paused.value
            elif study.end_date and is_now_after(study.end_date):
                effective_state = StudyState.closed.value

        return {
            "slug": study.slug,
            "title": title,
            "subtitle": subtitle,
            "description": description,
            "objective": objective,
            "instructions": instructions,
            "presort_config": study.presort_config,
            "postsort_config": study.postsort_config,
            "grid_config": study.grid_config,
            "statements": statements_data,
            "process_steps": (getattr(translation, "process_steps", []) or [])
            or DEFAULT_PROCESS_STEPS.get(resolved_lang)
            or DEFAULT_PROCESS_STEPS.get(base_lang)
            or DEFAULT_PROCESS_STEPS.get("en", []),
            "consent": {
                "title": get_t_attr("consent_title")
                or lang_defaults.get("consent_title"),
                "description": get_t_attr("consent_description")
                or lang_defaults.get("consent_description"),
            },
            "condition_of_instruction": condition_of_instruction,
            "pre_instruction": getattr(translation, "pre_instruction", None)
            or lang_defaults.get("pre_instruction"),
            "available_languages": [t.language_code for t in study.translations],
            "language": resolved_lang,
            "default_language": study.default_language,
            "show_statement_codes": study.show_statement_codes,
            "randomize_statement_order": study.randomize_statement_order,
            "ui_labels": get_t_attr("ui_labels", {}) or {},
            "methodology_tips": (getattr(translation, "methodology_tips", []) or [])
            or lang_defaults.get("methodology_tips", []),
            "state": effective_state,
            "step_help": (getattr(translation, "step_help", {}) or {})
            or lang_defaults.get("step_help", {}),
            "requires_password": False,
            "start_date": study.start_date,
            "end_date": study.end_date,
            "branding": study.branding
            or {"logo_url": None, "accent_color": None, "partners": []},
        }

    @staticmethod
    def validate_for_activation(study: Study) -> list[str]:
        """
        Comprehensive check to see if a study is ready for research.
        Returns a list of human-readable error messages (JSON encoded for i18n).
        """
        errors = []

        def add_error(key: str, **kwargs):
            errors.append(
                json.dumps({"key": f"admin.design.validation.errors.{key}", **kwargs})
            )

        # 1. Statements Exist
        if not study.statements:
            add_error("no_statements")

        # 2. Grid Config exists and matches statements
        if not study.grid_config:
            add_error("no_grid")
        else:
            total_capacity = sum(
                int(col.get("capacity", 0)) for col in study.grid_config
            )
            if len(study.statements) != total_capacity:
                add_error(
                    "capacity_mismatch",
                    total=total_capacity,
                    count=len(study.statements),
                )

        # 3. Minimum Translations
        if not study.translations:
            add_error("no_translations")
        else:
            # Check if default language has a translation
            default_lang = study.default_language or "en"
            has_default = any(
                t.language_code == default_lang for t in study.translations
            )
            if not has_default:
                # If we have other translations, the resolver will fallback to the first available.
                # We only error if there are NO translations at all (handled above).
                # However, it's good practice to have the default language translation.
                # To be flexible, we'll allow activation as long as SOMETHING is there.
                pass

            # Check for missing titles in any translation
            for t in study.translations:
                if not t.title or t.title.strip() == "":
                    add_error("missing_title", lang=t.language_code)

                if not t.consent_title or t.consent_title.strip() == "":
                    add_error("missing_consent_title", lang=t.language_code)

                if not t.consent_description or t.consent_description.strip() == "":
                    add_error("missing_consent_description", lang=t.language_code)

                if (
                    not t.condition_of_instruction
                    or t.condition_of_instruction.strip() == ""
                ):
                    add_error("missing_grid_instructions", lang=t.language_code)

                # Check process steps
                for i, step in enumerate(t.process_steps):
                    title = step.get("title")
                    if not title or title.strip() == "":
                        add_error(
                            "missing_step_title", index=i + 1, lang=t.language_code
                        )

        # 4. Questions (Pre/Post) have labels for all study languages
        def check_questions(config: dict, section: str):
            fields = {}
            if section == "presort":
                if "fields" in config:
                    fields = config["fields"]
                elif "enabled" not in config:
                    fields = config
            else:  # postsort
                fields = config.get("questions", {})

            for q_id, q_config in fields.items():
                label = q_config.get("label")
                for lang in study_langs:
                    lang_label = None
                    if isinstance(label, dict):
                        lang_label = label.get(lang)
                    elif lang == "en":  # Legacy string fallback to en
                        lang_label = label

                    if not lang_label or (
                        isinstance(lang_label, str) and lang_label.strip() == ""
                    ):
                        add_error(
                            "missing_question_label",
                            id=q_id,
                            lang=lang,
                            section=section,
                        )

                    # Check options
                    options = q_config.get("options", [])
                    if options:
                        for i, opt in enumerate(options):
                            opt_label = None
                            if isinstance(opt, dict):
                                opt_label_obj = opt.get("label")
                                if isinstance(opt_label_obj, dict):
                                    opt_label = opt_label_obj.get(lang)
                                elif lang == "en":
                                    opt_label = opt_label_obj
                            elif lang == "en":  # Legacy string
                                opt_label = opt

                            if not opt_label or (
                                isinstance(opt_label, str) and opt_label.strip() == ""
                            ):
                                add_error(
                                    "missing_option_label",
                                    id=q_id,
                                    index=i + 1,
                                    lang=lang,
                                    section=section,
                                )

        study_langs = {t.language_code for t in study.translations}
        if study.presort_config:
            check_questions(study.presort_config, "presort")
        if study.postsort_config:
            check_questions(study.postsort_config, "postsort")

        # 5. Statements have translations for all study languages
        for s in study.statements:
            s_langs = {st.language_code for st in s.translations}
            missing = study_langs - s_langs
            if missing:
                add_error(
                    "missing_statement_translation",
                    code=s.code,
                    missing=", ".join(missing),
                )

            # Check for empty text in translations (only for active languages)
            for st in s.translations:
                if st.language_code in study_langs and (
                    not st.text or st.text.strip() == ""
                ):
                    add_error(
                        "empty_statement_text", code=s.code, lang=st.language_code
                    )

        return errors

    @staticmethod
    def validate_distribution(study: Study, qsort: list[Any]):
        """Validates the Q-sort distribution against the study's grid configuration."""
        # Edge case: Ensure study has statements
        if not study.statements:
            raise HTTPException(
                status_code=500,
                detail="Study configuration error: No statements defined.",
            )

        stmt_count = len(study.statements)
        if len(qsort) != stmt_count:
            raise HTTPException(
                status_code=400,
                detail=f"Submission incomplete. Expected {stmt_count} cards, got {len(qsort)}.",
            )

        # Edge case: Empty qsort should be caught above, but double-check
        if not qsort:
            raise HTTPException(
                status_code=400,
                detail="Cannot validate distribution: Q-sort is empty.",
            )

        submission_counts = Counter(entry.grid_score for entry in qsort)
        target_dist = {}

        # Edge case: Handle None or invalid grid_config
        if study.grid_config is None:
            raise HTTPException(
                status_code=500,
                detail="Study configuration error: grid_config is missing.",
            )

        if isinstance(study.grid_config, list):
            for item in study.grid_config:
                if isinstance(item, dict) and "score" in item and "capacity" in item:
                    try:
                        score = int(item["score"])
                        capacity = int(item["capacity"])
                        target_dist[score] = capacity
                    except (ValueError, TypeError):
                        # Log but continue - malformed grid config item
                        continue
        elif isinstance(study.grid_config, dict):
            for score_str, capacity in study.grid_config.items():
                try:
                    score = int(score_str)
                    cap = int(capacity)
                    target_dist[score] = cap
                except (ValueError, TypeError):
                    continue
        else:
            raise HTTPException(
                status_code=500,
                detail="Study configuration error: grid_config has invalid type.",
            )

        # Edge case: No valid target distribution parsed
        if not target_dist:
            raise HTTPException(
                status_code=500,
                detail="Study configuration error: Could not parse grid_config.",
            )

        for score_val, capacity in target_dist.items():
            count = submission_counts.get(score_val, 0)
            if count != capacity:
                raise HTTPException(
                    status_code=400,
                    detail=f"Column {score_val} has incorrect number of cards. Expected {capacity}, got {count}.",
                )
            if score_val in submission_counts:
                del submission_counts[score_val]

        if submission_counts:
            invalid_scores = list(submission_counts.keys())
            raise HTTPException(
                status_code=400,
                detail=f"Submission contains invalid grid scores: {invalid_scores}",
            )

    @staticmethod
    async def process_submission(
        db: AsyncSession,
        data: SubmissionInput,
        client_ip: str,
        user_agent: str | None = None,
    ):
        """Process and save a participant's submission."""
        # 1. IP Hashing
        hashed_ip = hash_ip(client_ip)
        confirmation_code = str(data.session_token)[:8].upper()

        # 2. Get Study
        study = await StudyService.get_study_by_slug(db, data.study_slug)
        if not study:
            raise HTTPException(status_code=404, detail="Study not found")

        # Edge case: Ensure study has statements loaded
        if not hasattr(study, "statements") or study.statements is None:
            raise HTTPException(
                status_code=500,
                detail="Study configuration error: Statements not loaded.",
            )

        # 2.5 Validation: Study State
        from ..models import StudyState

        if study.state != StudyState.active and not data.is_test_run:
            raise HTTPException(
                status_code=400,
                detail=f"Study is not active (state: {study.state.value}). Submissions are not allowed.",
            )

        # 2.6 Validation: Recruitment Link
        link = None
        if data.link_token:
            link = await RecruitmentService.validate_link_token(
                db, study.id, data.link_token
            )
            if not link:
                raise HTTPException(
                    status_code=403,
                    detail="Invalid, expired, or full recruitment link",
                )

        # Edge case: Ensure qsort is not None
        if data.qsort is None:
            raise HTTPException(
                status_code=400,
                detail="Submission error: Q-sort data is missing.",
            )

        # 3. Validation: Statement Ownership
        valid_statement_ids = {s.id for s in study.statements}

        # Edge case: Handle empty valid_statement_ids
        if not valid_statement_ids:
            raise HTTPException(
                status_code=500,
                detail="Study configuration error: No statements defined.",
            )

        for entry in data.qsort:
            if entry.statement_id not in valid_statement_ids:
                raise HTTPException(
                    status_code=400,
                    detail=f"Statement ID {entry.statement_id} does not belong to study '{data.study_slug}'",
                )

        # 4. Validation: Distribution (only for completed)
        if data.status == ParticipantStatus.completed:
            StudyService.validate_distribution(study, data.qsort)

        # Edge case: Ensure presort_answers and postsort_answers are dicts, not None
        presort_answers = (
            data.presort_answers if data.presort_answers is not None else {}
        )
        postsort_answers = (
            data.postsort_answers if data.postsort_answers is not None else {}
        )

        # 5. Find or Create Participant
        participant_stmt = (
            select(Participant)
            .where(Participant.session_token == data.session_token)
            .with_for_update()
        )
        participant_result = await db.execute(participant_stmt)
        participant = participant_result.scalar_one_or_none()
        is_newly_created = False

        if not participant:
            try:
                participant = Participant(
                    study_id=study.id,
                    session_token=data.session_token,
                    language_used=data.language_used,
                    random_seed=str(
                        StudyService._generate_session_seed(str(data.session_token))
                    )
                    if study.randomize_statement_order
                    else None,
                    presort_answers=presort_answers,
                    postsort_answers=postsort_answers,
                    status=data.status,
                    confirmation_code=confirmation_code,
                    ip_address=hashed_ip,
                    user_agent=user_agent,
                    submitted_at=datetime.now(timezone.utc)
                    if data.status == ParticipantStatus.completed
                    else None,
                    is_test_run=data.is_test_run,
                )
                db.add(participant)
                await db.flush()
                is_newly_created = True

                # Increment link usage if link was used
                if link:
                    # Persist the token in presort_answers for admin tracking
                    # Persist the token in presort_answers for admin tracking
                    # We modify the local 'participant' object's presort_answers so it gets saved on flush?
                    # Actually, we passed 'presort_answers' dict to constructor. We should update it before constructor or update object after.
                    # Since presort_answers is a dict, we can modify it.
                    # Re-fetching participant after flush might be safest, or just relying on reference.
                    # Let's simple add it to the dict passed to constructor if we want it saved.
                    pass

                if link and data.link_token:
                    # We need to make sure this gets saved. The Participant constructor took 'presort_answers'.
                    # If we modify 'presort_answers' *before* constructor, it would be cleaner.
                    # But we allow 'link' to be checked after some validations.
                    # Let's update the object directly.
                    participant.presort_answers = {
                        **participant.presort_answers,
                        "_recruitment_token": data.link_token,
                    }
                    # We also need to increment usage
                    await RecruitmentService.increment_usage(db, link.id)
            except IntegrityError:
                # Race condition: Participant was created by another request in the meantime.
                # Rollback the failed insert and fetch the existing participant.
                await db.rollback()
                participant_result = await db.execute(participant_stmt)
                participant = participant_result.scalar_one_or_none()
                if not participant:
                    # Should not happen if IntegrityError was due to session_token
                    raise HTTPException(
                        status_code=500,
                        detail="Concurrency error: Could not resolve participant.",
                    )
            except Exception as e:
                # Edge case: Catch any unexpected database errors
                await db.rollback()
                raise HTTPException(
                    status_code=500,
                    detail=f"Database error while creating participant: {str(e)}",
                )

        # If we fell through (either from 'else' or after catching exception), participant exists.
        # Ensure we don't treat a newly created participant as an existing one we need to skip/update.
        if participant and participant not in db.new and not is_newly_created:
            # Update existing participant
            if participant.status == ParticipantStatus.completed:
                return {
                    "confirmation_code": str(participant.session_token)[:8].upper(),
                    "id": participant.id,
                }

            participant.language_used = data.language_used
            participant.presort_answers = presort_answers
            participant.postsort_answers = postsort_answers
            if data.status:
                participant.status = data.status
            participant.confirmation_code = confirmation_code
            participant.ip_address = hashed_ip
            participant.user_agent = user_agent
            participant.is_test_run = data.is_test_run
            if data.status == ParticipantStatus.completed:
                participant.submitted_at = datetime.now(timezone.utc)

            await db.flush()

            # Replace Q-Sort entries
            await db.execute(
                delete(QSortEntry).where(QSortEntry.participant_id == participant.id)
            )
            await db.flush()

        # Edge case: Ensure participant.id exists before creating QSortEntry
        if not participant or participant.id is None:
            raise HTTPException(
                status_code=500,
                detail="Database error: Participant ID is missing after save.",
            )

        # 6. Save Q-Sort Entries
        try:
            new_entries = [
                QSortEntry(
                    participant_id=participant.id,
                    statement_id=entry.statement_id,
                    grid_score=entry.grid_score,
                    card_comment=entry.card_comment,
                )
                for entry in data.qsort
            ]
            db.add_all(new_entries)
            await db.flush()
            # await db.commit() -> Handled by router
        except Exception as e:
            # Edge case: Handle commit failures
            await db.rollback()
            raise HTTPException(
                status_code=500,
                detail=f"Database error while saving Q-sort entries: {str(e)}",
            )

        return {"confirmation_code": confirmation_code, "id": participant.id}

    @staticmethod
    async def delete_audio_files_for_study(
        db: AsyncSession,
        study_id: int,
        *,
        test_runs_only: bool = False,
    ) -> None:
        """Delete S3 audio files for participants of a study.

        Must be called BEFORE deleting participants (DB cascade would
        remove AudioRecording rows, orphaning S3 objects).
        """
        from ..services.storage_service import storage_service

        query = (
            select(AudioRecording.s3_key)
            .join(Participant)
            .where(Participant.study_id == study_id)
        )
        if test_runs_only:
            query = query.where(Participant.is_test_run.is_(True))

        result = await db.execute(query)
        s3_keys = result.scalars().all()

        for key in s3_keys:
            await storage_service.delete_audio(key)

    @staticmethod
    async def reset_study_participants(db: AsyncSession, study_id: int):
        """Delete all participants for a specific study."""
        await StudyService.delete_audio_files_for_study(db, study_id)
        stmt = delete(Participant).where(Participant.study_id == study_id)
        await db.execute(stmt)
        await db.commit()

    @staticmethod
    async def get_study_stats(db: AsyncSession, study_id: int) -> dict[str, Any]:
        """Calculates aggregated statistics for a study."""
        # 1. Get all participants for this study (excluding discarded)
        stmt = select(Participant).where(
            Participant.study_id == study_id,
            Participant.is_discarded.is_(False),
            Participant.is_test_run.is_(False),
        )
        result = await db.execute(stmt)
        participants = result.scalars().all()

        started_count = len(participants)
        completed_participants = [
            p for p in participants if p.status == ParticipantStatus.completed
        ]
        completed_count = len(completed_participants)

        # 2. Completion Rate
        completion_rate = completed_count / started_count if started_count > 0 else 0.0

        # 3. Median Duration (Seconds)
        durations = []
        for p in completed_participants:
            if p.submitted_at and p.consented_at:
                duration = (p.submitted_at - p.consented_at).total_seconds()
                if duration > 0:
                    durations.append(duration)

        median_duration = None
        if durations:
            import statistics

            median_duration = statistics.median(durations)

        # 4. Device Breakdown (Simple Heuristic)
        device_breakdown = {"mobile": 0, "desktop": 0}
        for p in participants:
            ua = (p.user_agent or "").lower()
            if any(x in ua for x in ["mobile", "android", "iphone", "ipad"]):
                device_breakdown["mobile"] += 1
            else:
                device_breakdown["desktop"] += 1

        return {
            "started_count": started_count,
            "completed_count": completed_count,
            "completion_rate": completion_rate,
            "median_duration_seconds": median_duration,
            "device_breakdown": device_breakdown,
        }

    @staticmethod
    async def get_study_full_dump(db: AsyncSession, study_id: int) -> dict[str, Any]:
        """Extracts complete study data and valid participant sorts for export."""
        # 1. Get Study with statements (ordered by ID for consistency)
        stmt = (
            select(Study)
            .where(Study.id == study_id)
            .options(
                selectinload(Study.statements).selectinload(Statement.translations),
                selectinload(Study.translations),
            )
        )
        result = await db.execute(stmt)
        study = result.scalar_one_or_none()
        if not study:
            raise HTTPException(status_code=404, detail="Study not found")

        # 2. Get all non-discarded completed participants with their Q-sort entries and audio
        p_stmt = (
            select(Participant)
            .where(
                Participant.study_id == study_id,
            )
            .options(
                selectinload(Participant.qsort_entries),
                selectinload(Participant.audio_recordings),
            )
        )
        p_result = await db.execute(p_stmt)
        participants = p_result.scalars().all()

        # 3. Build Export Structure
        # PQMethod and others need a fixed reference for statement order.
        # We sort by original statement ID.
        sorted_statements = sorted(study.statements, key=lambda s: s.id)
        statement_id_to_index = {s.id: i for i, s in enumerate(sorted_statements)}

        participant_data = []
        for p in participants:
            # Edge case: Handle missing or None qsort_entries
            placements = {}
            if p.qsort_entries:
                placements = {
                    entry.statement_id: entry.grid_score for entry in p.qsort_entries
                }

            # Create a score list in the exact order of sorted_statements
            scores = [placements.get(s.id, None) for s in sorted_statements]

            # Edge case: Ensure presort and postsort are not None
            presort = p.presort_answers if p.presort_answers is not None else {}
            postsort = p.postsort_answers if p.postsort_answers is not None else {}

            # Build audio recordings map with presigned URLs
            audio_recordings = {}
            from ..services.storage_service import storage_service

            for audio_rec in p.audio_recordings:
                try:
                    # Generate fresh presigned URL (24h expiration for exports)
                    presigned_url = storage_service.generate_presigned_url(
                        audio_rec.s3_key, expiration=86400
                    )
                    audio_recordings[audio_rec.question_key] = {
                        "id": audio_rec.id,
                        "duration_seconds": audio_rec.duration_seconds,
                        "file_size_bytes": audio_rec.file_size_bytes,
                        "mime_type": audio_rec.mime_type,
                        "created_at": audio_rec.created_at.isoformat(),
                        "presigned_url": presigned_url,
                    }
                except Exception as e:
                    # Log but don't fail export
                    logger.warning(
                        "Failed to generate presigned URL for %s: %s",
                        audio_rec.s3_key,
                        e,
                    )

            participant_data.append(
                {
                    "id": str(p.session_token)[:8].upper(),
                    "db_id": p.id,
                    "duration_seconds": (
                        p.submitted_at - p.consented_at
                    ).total_seconds()
                    if p.submitted_at and p.consented_at
                    else None,
                    "scores": scores,
                    # For raw CSV/KenQ
                    "placements": placements,
                    "presort": presort,
                    "postsort": postsort,
                    "audio_recordings": audio_recordings,
                    "language": p.language_used,
                    "is_discarded": p.is_discarded,
                    "discard_reason": p.discard_reason,
                    "is_test_run": p.is_test_run,
                    "status": p.status.value,
                    "recruitment_token": getattr(p, "recruitment_token", None),
                }
            )

        return {
            "study": {
                "slug": study.slug,
                "state": study.state.value,
                "grid_config": study.grid_config,
                "postsort_config": study.postsort_config,
                "statements": [
                    {
                        "id": s.id,
                        "code": s.code,
                        "translations": [
                            {"lang": t.language_code, "text": t.text}
                            for t in s.translations
                        ],
                    }
                    for s in sorted_statements
                ],
                "translations": [
                    {"lang": t.language_code, "title": t.title}
                    for t in study.translations
                ],
            },
            "participants": participant_data,
            "statement_id_to_index": statement_id_to_index,
        }
