import pytest
from httpx import AsyncClient
from datetime import datetime, timezone

from app.models import Study, User, StudyState, RecruitmentLinkType


@pytest.mark.asyncio
class TestImportCycle:
    """Test full cycle of export -> import to ensure data integrity."""

    async def test_full_cycle_preserves_all_data(
        self,
        client: AsyncClient,
        test_user: User,
        workspace_factory,
        auth_token_factory,
        db,
    ):
        """
        Creates a 'Golden Study' with every single field populated,
        exports it, imports it as a new study, and verifies exact match.
        """
        # 1. Create Source Study with EVERYTHING
        ws = await workspace_factory(owner=test_user)

        from app.models import (
            StudyTranslation,
            Statement,
            StatementTranslation,
            RecruitmentLink,
        )

        # Branding
        branding = {
            "logo_url": "https://example.com/logo.png",
            "accent_color": "#ff0000",
            "primary_color": "#00ff00",
            "partners": [
                {
                    "id": "p1",
                    "name": "Partner 1",
                    "logo_url": "https://example.com/p1.png",
                    "url": "https://p1.com",
                }
            ],
        }

        # Grid Config
        grid_config = [
            {"score": -1, "capacity": 1},
            {"score": 0, "capacity": 1},  # Total 2 statements for simplicity
        ]

        # Presort/Postsort
        presort = {
            "age": {
                "type": "number",
                "label": {"en": "Age", "fr": "Age"},
                "required": True,
            }
        }
        postsort = {
            "comment": {"type": "text", "label": {"en": "Comment", "fr": "Commentaire"}}
        }

        source_study = Study(
            slug="source-study",
            workspace_id=ws.id,
            state=StudyState.active,  # Should become draft on import
            grid_config=grid_config,
            presort_config=presort,
            postsort_config=postsort,
            default_language="en",
            show_statement_codes=True,
            randomize_statement_order=True,
            symmetry_lock=False,
            branding=branding,
            access_password="secretpassword",
            start_date=datetime(
                2025, 1, 1, tzinfo=timezone.utc
            ),  # Check preservation (optional)
            end_date=datetime(2025, 12, 31, tzinfo=timezone.utc),
        )
        db.add(source_study)
        await db.flush()

        # Recruitment Links (Typically NOT exported currently, checking if they are needed)
        # User said "ALL settings", and recruitment links are part of the setup.
        link1 = RecruitmentLink(
            study_id=source_study.id,
            type=RecruitmentLinkType.public,
            token="token1",
            name="Public Link",
            capacity=100,
        )
        link2 = RecruitmentLink(
            study_id=source_study.id,
            type=RecruitmentLinkType.individual,
            token="token2",
            name="Private Link",
            capacity=1,
        )
        db.add(link1)
        db.add(link2)

        # Translations (EN and FR)
        # Populate EVERY field
        t_en = StudyTranslation(
            study_id=source_study.id,
            language_code="en",
            title="English Title",
            subtitle="English Subtitle",
            description="English Description",
            objective="English Objective",
            instructions="English Instructions",
            condition_of_instruction="English Condition",
            pre_instruction="English Pre-Instruction",
            consent_title="English Consent Title",
            consent_description="English Consent Description",
            methodology_tips=["Tip 1", "Tip 2"],
            ui_labels={"next": "Next Step", "back": "Go Back"},
            step_help={"welcome": {"what": "What", "why": "Why"}},
            process_steps=[
                {
                    "id": "s1",
                    "title": "Step 1",
                    "description": "Desc 1",
                    "icon": "User",
                    "color": "#000",
                }
            ],
        )
        t_fr = StudyTranslation(
            study_id=source_study.id,
            language_code="fr",  # Disabled language checking?
            title="French Title",
            subtitle="French Subtitle",
            description="French Description",
            objective="French Objective",
            instructions="French Instructions",
            condition_of_instruction="French Condition",
            pre_instruction="French Pre-Instruction",
            consent_title="French Consent Title",
            consent_description="French Consent Description",
            methodology_tips=["Conseil 1", "Conseil 2"],
            ui_labels={"next": "Suivant", "back": "Retour"},
            step_help={"welcome": {"what": "Quoi", "why": "Pourquoi"}},
            process_steps=[
                {
                    "id": "s1",
                    "title": "Etape 1",
                    "description": "Desc 1",
                    "icon": "User",
                    "color": "#000",
                }
            ],
        )
        db.add(t_en)
        db.add(t_fr)

        # Statements
        s1 = Statement(study_id=source_study.id, code="S1")
        s2 = Statement(study_id=source_study.id, code="S2")
        db.add(s1)
        db.add(s2)
        await db.flush()

        db.add(
            StatementTranslation(statement_id=s1.id, language_code="en", text="S1 EN")
        )
        db.add(
            StatementTranslation(statement_id=s1.id, language_code="fr", text="S1 FR")
        )
        db.add(
            StatementTranslation(statement_id=s2.id, language_code="en", text="S2 EN")
        )
        db.add(
            StatementTranslation(statement_id=s2.id, language_code="fr", text="S2 FR")
        )

        await db.commit()

        # 2. Export Config
        headers = auth_token_factory(test_user)
        resp_export = await client.get(
            f"/api/admin/studies/{source_study.slug}/export/config", headers=headers
        )
        assert resp_export.status_code == 200
        config = resp_export.json()

        # 3. Import Config
        new_slug = "cloned-study"
        import_payload = {"config": config, "new_slug": new_slug}
        headers = {**headers, "X-Workspace-ID": str(ws.id)}
        resp_import = await client.post(
            "/api/admin/studies/import", json=import_payload, headers=headers
        )
        assert resp_import.status_code == 200, f"Import failed: {resp_import.text}"

        # 4. Verify Cloned Study
        # Force reload from DB to check persistence
        from sqlalchemy import select
        from sqlalchemy.orm import selectinload

        stmt = (
            select(Study)
            .where(Study.slug == new_slug)
            .options(
                selectinload(Study.translations),
                selectinload(Study.statements).selectinload(Statement.translations),
                selectinload(Study.recruitment_links),
            )
        )
        result = await db.execute(stmt)
        cloned = result.scalar_one()

        # ASSERTIONS

        # Basics
        assert cloned.default_language == source_study.default_language
        assert cloned.show_statement_codes == source_study.show_statement_codes
        assert (
            cloned.randomize_statement_order == source_study.randomize_statement_order
        )
        assert cloned.symmetry_lock == source_study.symmetry_lock
        assert cloned.access_password == source_study.access_password

        # JSON Configs
        assert cloned.grid_config == source_study.grid_config
        assert cloned.presort_config == source_study.presort_config
        assert cloned.postsort_config == source_study.postsort_config
        assert cloned.branding == source_study.branding

        # Translations (Check full equality of fields)
        def get_trans(s, lang):
            return next((t for t in s.translations if t.language_code == lang), None)

        for lang in ["en", "fr"]:
            src_t = get_trans(source_study, lang)
            clone_t = get_trans(cloned, lang)
            assert clone_t is not None, f"Missing translation for {lang}"

            fields_to_check = [
                "title",
                "subtitle",
                "description",
                "objective",
                "instructions",
                "condition_of_instruction",
                "pre_instruction",
                "consent_title",
                "consent_description",
                "methodology_tips",
                "ui_labels",
                "step_help",
                "process_steps",
            ]
            for field in fields_to_check:
                val_src = getattr(src_t, field)
                val_clone = getattr(clone_t, field)
                # JSON fields might need careful comparison (lists vs tuples etc)
                # Pydantic/SQLAlchemy should handle dicts as dicts.
                assert (
                    val_clone == val_src
                ), f"Mismatch in {field} for {lang}: {val_clone} != {val_src}"

        # Statements
        assert len(cloned.statements) == len(source_study.statements)
        for s_src in source_study.statements:
            s_clone = next((s for s in cloned.statements if s.code == s_src.code), None)
            assert s_clone is not None
            for st_src in s_src.translations:
                st_clone = next(
                    (
                        t
                        for t in s_clone.translations
                        if t.language_code == st_src.language_code
                    ),
                    None,
                )
                assert st_clone is not None
                assert st_clone.text == st_src.text

        # Recruitment Links
        # Currently expected to FAIL if logic is missing
        # We export/import only CONFIG, so tokens should differ, but name/type/capacity should match
        assert len(cloned.recruitment_links) == len(source_study.recruitment_links)

        # Sort by name to compare
        src_links = sorted(
            source_study.recruitment_links, key=lambda link: link.name or ""
        )
        clone_links = sorted(cloned.recruitment_links, key=lambda link: link.name or "")

        for link_src, link_clone in zip(src_links, clone_links):
            assert link_clone.name == link_src.name
            assert link_clone.type == link_src.type
            assert link_clone.capacity == link_src.capacity
            assert link_clone.token != link_src.token  # Must be new token
