# Qualis - Open-source platform for conducting Q-methodology research
# Copyright (C) 2025 Julien Vastenekels
# Licensed under the GNU Affero General Public License v3.0 or later.

"""Service layer for core Study operations (config, translations, validation).

Submission and data-export logic live in dedicated services:
- ``submission_service.SubmissionService``
- ``study_data_service.StudyDataService``

For backward compatibility, ``StudyService`` delegates to those services so
that existing ``StudyService.process_submission(...)`` calls keep working.
"""

import hashlib
import json
import logging
from typing import Any, cast
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ..exceptions import ConflictError, NotFoundError, ValidationError
from ..models import (
    DistributionMode,
    Participant,
    Statement,
    StatementTranslation,
    Study,
    StudyState,
    StudyTranslation,
)
from ..schemas import StudyCreate, StudyUpdate
from .study_defaults import (
    DEFAULT_PROCESS_STEPS,
    DEFAULT_TRANSLATION_CONTENT,
    build_process_steps,
    build_step_help,
)

logger = logging.getLogger(__name__)

# Re-export constants so ``from app.services.study_service import DEFAULT_PROCESS_STEPS`` keeps working.
__all__ = [
    "StudyService",
    "DEFAULT_PROCESS_STEPS",
    "DEFAULT_TRANSLATION_CONTENT",
]


class StudyService:
    """Core study operations: lookup, translation resolution, config, validation."""

    # ------------------------------------------------------------------
    # Lookup
    # ------------------------------------------------------------------

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

    # ------------------------------------------------------------------
    # Create / Update
    # ------------------------------------------------------------------

    @staticmethod
    async def create_study(
        db: AsyncSession, study_in: StudyCreate, project_id: int
    ) -> Study:
        """Create a new study with translations and statements.

        Raises ConflictError if slug already exists.
        """
        # Check slug uniqueness
        existing = await db.execute(select(Study).where(Study.slug == study_in.slug))
        if existing.scalar_one_or_none():
            raise ConflictError("Study with this slug already exists")

        try:
            db_study = Study(
                slug=study_in.slug,
                project_id=project_id,
                state=StudyState.draft,
                grid_config=[col.model_dump() for col in study_in.grid_config],
                presort_config=study_in.presort_config,
                postsort_config=study_in.postsort_config,
                default_language=study_in.default_language
                or (
                    study_in.translations[0].language_code
                    if study_in.translations
                    else "en"
                ),
                show_statement_codes=study_in.show_statement_codes,
                distribution_mode=study_in.distribution_mode,
                rough_sort_enabled=study_in.rough_sort_enabled,
                branding=study_in.branding.model_dump() if study_in.branding else None,
                start_date=study_in.start_date,
                end_date=study_in.end_date,
            )
            db.add(db_study)
            await db.flush()

            logger.debug(
                "Creating study with %d translations", len(study_in.translations)
            )
            for t_in in study_in.translations:
                t_data = t_in.model_dump()
                lang = t_data.get("language_code", "en")
                defaults = DEFAULT_TRANSLATION_CONTENT.get(
                    lang, DEFAULT_TRANSLATION_CONTENT["en"]
                )
                if not t_data.get("process_steps"):
                    t_data["process_steps"] = build_process_steps(
                        rough_sort_enabled=study_in.rough_sort_enabled,
                        locale=lang,
                    )
                for field, value in defaults.items():
                    if not t_data.get(field):
                        if field == "step_help":
                            t_data[field] = build_step_help(
                                rough_sort_enabled=study_in.rough_sort_enabled,
                                locale=lang,
                            )
                        else:
                            t_data[field] = value
                db.add(StudyTranslation(study_id=db_study.id, **t_data))

            for idx, s_in in enumerate(study_in.statements):
                stmt = Statement(
                    study_id=db_study.id, code=s_in.code, display_order=idx
                )
                db.add(stmt)
                await db.flush()
                for st_in in s_in.translations:
                    db.add(
                        StatementTranslation(
                            statement_id=stmt.id,
                            language_code=st_in.language_code,
                            text=st_in.text,
                        )
                    )

            await db.commit()
        except IntegrityError as e:
            await db.rollback()
            logger.error("Integrity check failed during study creation: %s", e)
            raise ConflictError(f"Database integrity check failed: {e}")

        return await StudyService._get_study_or_raise(db, db_study.slug)

    @staticmethod
    async def update_study(
        db: AsyncSession, study: Study, study_update: StudyUpdate
    ) -> Study:
        """Update study configuration (draft only).

        Expects ``study`` to be loaded with translations, statements
        (including Statement.translations), and participants.

        Raises ValidationError, ConflictError as appropriate.
        """
        # Grid config change guard
        if study_update.grid_config is not None:
            new_grid = [col.model_dump() for col in study_update.grid_config]
            if new_grid != study.grid_config:
                if await StudyService._has_real_participants(db, study.id):
                    raise ValidationError(
                        "Cannot modify grid configuration because participants "
                        "have already started the study."
                    )

        # Rough-sort toggle lock: once any participant has gone past consent
        # (last_step_reached > 1) the flow is materialised in their session;
        # flipping the toggle would create inconsistent state.
        if (
            study_update.rough_sort_enabled is not None
            and study_update.rough_sort_enabled != study.rough_sort_enabled
        ):
            count = await StudyService._count_participants_past_consent(db, study.id)
            if count > 0:
                raise ValidationError(
                    f"Cannot change rough_sort_enabled — {count} participant(s) "
                    "have started the survey. Archive or delete those sessions "
                    "before changing this setting."
                )

        # Draft-only updates
        if study.state != StudyState.draft:
            raise ValidationError(
                f"Cannot update study in {study.state.value} state. "
                "Switch it back to draft first."
            )

        # Optimistic locking
        if study_update.last_updated_at and study.updated_at:
            if (
                study.updated_at > study_update.last_updated_at
                and study.state != StudyState.draft
            ):
                raise ConflictError("Study has been modified by another user.")

        try:
            # Basic fields
            update_data = study_update.model_dump(exclude_unset=True)
            for field, value in update_data.items():
                if field in ["translations", "statements", "grid_config"]:
                    continue
                if field == "access_password" and value is not None:
                    from ..utils.security import get_password_hash

                    value = get_password_hash(value)
                setattr(study, field, value)

            # Grid config
            if study_update.grid_config is not None:
                study.grid_config = [
                    col.model_dump() for col in study_update.grid_config
                ]

            # Translations sync
            if study_update.translations is not None:
                StudyService._sync_translations(study, study_update.translations)

            # Statements sync
            if study_update.statements is not None:
                await StudyService._sync_statements(db, study, study_update.statements)

            await db.commit()
        except IntegrityError as e:
            await db.rollback()
            logger.error("Integrity check failed during study update: %s", e)
            raise ConflictError(
                "Database integrity check failed (possibly duplicate statement codes)"
            )

        return await StudyService._get_study_or_raise(db, study.slug)

    @staticmethod
    def _sync_translations(study: Study, translations_in: list[Any]) -> None:
        """Sync study translations: update existing, add new."""
        current_trans = {t.language_code: t for t in study.translations}
        new_trans_list = []
        for t_in in translations_in:
            if t_in.language_code in current_trans:
                t_obj = current_trans[t_in.language_code]
                for k, v in t_in.model_dump().items():
                    setattr(t_obj, k, v)
                new_trans_list.append(t_obj)
            else:
                new_trans_list.append(StudyTranslation(**t_in.model_dump()))
        study.translations = new_trans_list

    @staticmethod
    async def _sync_statements(
        db: AsyncSession, study: Study, statements_in: list[Any]
    ) -> None:
        """Sync study statements: add, update, remove."""
        current_statements = {s.code: s for s in study.statements}
        updated_codes = {s.code for s in statements_in}
        can_sync_structure = not await StudyService._has_real_participants(db, study.id)

        if not can_sync_structure:
            current_codes = {s.code for s in study.statements}
            if updated_codes != current_codes:
                raise ValidationError(
                    "Cannot modify statement structure because participants "
                    "have already started the study."
                )

        # Remove statements not in the update
        if can_sync_structure:
            for code, s_obj in list(current_statements.items()):
                if code not in updated_codes:
                    study.statements.remove(s_obj)
                    await db.delete(s_obj)
                    del current_statements[code]

        # Sync existing and add new
        for idx, s_up in enumerate(statements_in):
            if s_up.code in current_statements:
                target_s = current_statements[s_up.code]
                target_s.display_order = idx
                curr_s_trans = {t.language_code: t for t in target_s.translations}
                new_s_trans_list = []
                for st_in in s_up.translations:
                    if st_in.language_code in curr_s_trans:
                        st_obj = curr_s_trans[st_in.language_code]
                        st_obj.text = st_in.text
                        new_s_trans_list.append(st_obj)
                    else:
                        new_s_trans_list.append(
                            StatementTranslation(
                                statement_id=target_s.id, **st_in.model_dump()
                            )
                        )
                target_s.translations = new_s_trans_list
            elif can_sync_structure:
                new_s = Statement(study_id=study.id, code=s_up.code, display_order=idx)
                db.add(new_s)
                study.statements.append(new_s)
                await db.flush()
                for st_in in s_up.translations:
                    db.add(
                        StatementTranslation(
                            statement_id=new_s.id,
                            language_code=st_in.language_code,
                            text=st_in.text,
                        )
                    )

    @staticmethod
    async def _has_real_participants(db: AsyncSession, study_id: int) -> bool:
        """Check if a study has any participants."""
        result = await db.execute(
            select(func.count(Participant.id)).where(
                Participant.study_id == study_id,
            )
        )
        return (result.scalar() or 0) > 0

    @staticmethod
    async def _count_participants_past_consent(db: AsyncSession, study_id: int) -> int:
        """Count participants whose ``last_step_reached`` is beyond consent.

        Used to lock structural toggles (rough_sort_enabled) once a session
        has been materialised in the participant's flow.
        """
        result = await db.execute(
            select(func.count(Participant.id)).where(
                Participant.study_id == study_id,
                Participant.last_step_reached > 1,
            )
        )
        return result.scalar() or 0

    @staticmethod
    async def _get_study_or_raise(db: AsyncSession, slug: str) -> Study:
        """Fetch study with relationships or raise NotFoundError."""
        study = await StudyService.get_study_by_slug(db, slug)
        if study is None:
            raise NotFoundError("Study")
        return study

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _generate_session_seed(token: str) -> int:
        """Generate deterministic seed from submission token for reproducible randomization"""
        return int(hashlib.sha256(token.encode()).hexdigest()[:8], 16)

    # ------------------------------------------------------------------
    # Translation resolution
    # ------------------------------------------------------------------

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

    # ------------------------------------------------------------------
    # Full config resolution (participant-facing)
    # ------------------------------------------------------------------

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
            or DEFAULT_TRANSLATION_CONTENT["en"]
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
            "rough_sort_enabled": study.rough_sort_enabled,
            "distribution_mode": study.distribution_mode.value
            if hasattr(study.distribution_mode, "value")
            else study.distribution_mode,
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

    # ------------------------------------------------------------------
    # Activation validation
    # ------------------------------------------------------------------

    @staticmethod
    def validate_for_activation(study: Study) -> list[str]:
        """
        Comprehensive check to see if a study is ready for research.
        Returns a list of human-readable error messages (JSON encoded for i18n).
        """
        errors = []

        def add_error(key: str, **kwargs: Any) -> None:
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
            stmt_count = len(study.statements)
            # Distribution-mode-aware capacity rule:
            #   forced/flexible — total capacity must equal the Q-set size
            #     (Brown 1980; Watts & Stenner 2012). Forced enforces per-column
            #     too at submission; flexible relaxes per-column to a soft hint.
            #   free — the grid must fit every statement (sum >= len). Columns
            #     may declare extra capacity that absorbs overflow at sort time.
            mode = getattr(study, "distribution_mode", DistributionMode.forced)
            if mode is None:
                mode = DistributionMode.forced
            if mode == DistributionMode.free:
                capacity_ok = total_capacity >= stmt_count
            else:
                capacity_ok = total_capacity == stmt_count
            if not capacity_ok:
                add_error(
                    "capacity_mismatch",
                    total=total_capacity,
                    count=stmt_count,
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
        def check_questions(config: dict[str, Any], section: str) -> None:
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

    # ------------------------------------------------------------------
    # Backward-compatible delegates
    # ------------------------------------------------------------------
    # These static methods forward to the new dedicated services so that
    # existing callers (``StudyService.process_submission(…)``, etc.)
    # continue to work without changes.

    @staticmethod
    async def record_consent(*args: Any, **kwargs: Any) -> Any:
        from .submission_service import SubmissionService

        return await SubmissionService.record_consent(*args, **kwargs)

    @staticmethod
    def validate_distribution(*args: Any, **kwargs: Any) -> Any:
        from .submission_service import SubmissionService

        return SubmissionService.validate_distribution(*args, **kwargs)

    @staticmethod
    async def process_submission(*args: Any, **kwargs: Any) -> Any:
        from .submission_service import SubmissionService

        return await SubmissionService.process_submission(*args, **kwargs)

    @staticmethod
    async def delete_audio_files_for_study(*args: Any, **kwargs: Any) -> Any:
        from .study_data_service import StudyDataService

        return await StudyDataService.delete_audio_files_for_study(*args, **kwargs)

    @staticmethod
    async def reset_study_participants(*args: Any, **kwargs: Any) -> Any:
        from .study_data_service import StudyDataService

        return await StudyDataService.reset_study_participants(*args, **kwargs)

    @staticmethod
    async def get_study_stats(*args: Any, **kwargs: Any) -> Any:
        from .study_data_service import StudyDataService

        return await StudyDataService.get_study_stats(*args, **kwargs)

    @staticmethod
    async def get_study_full_dump(*args: Any, **kwargs: Any) -> Any:
        from .study_data_service import StudyDataService

        return await StudyDataService.get_study_full_dump(*args, **kwargs)

    @staticmethod
    async def get_study_sort_data(*args: Any, **kwargs: Any) -> Any:
        from .study_data_service import StudyDataService

        return await StudyDataService.get_study_sort_data(*args, **kwargs)
