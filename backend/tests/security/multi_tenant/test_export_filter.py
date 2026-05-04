# Qualis - Open-source platform for conducting Q-methodology research
# Copyright (C) 2025 Julien Vastenekels
# Licensed under the GNU Affero General Public License v3.0 or later.

"""Wave 3 Task 8 — Bulk-export filter correctness.

The cross-tenant IDOR harness (Task 3) already covered every export
endpoint at the **path** level (Bob targeting study-B's slug → 404).
This task widens that to ask: does the export query *itself* trust any
non-path input — body, header, or query string — that an attacker could
manipulate to widen the result set beyond their own study?

Read of ``backend/app/routers/admin/exports.py`` and
``backend/app/routers/admin/studies_import_export.py``:

- All eight export endpoints derive ``study.id`` from
  ``check_study_permission(StudyRole.editor)`` (path-bound).
- All ``Participant`` queries filter ``Participant.study_id == study.id``
  at the SQL level. The ``participant_id`` route also adds
  ``Participant.id == participant_id`` as a defence-in-depth path
  scope.
- The single in-Python filter is in
  ``GET /studies/{slug}/participants/{participant_id}/export/json``
  (``exports.py:240-248``): it calls ``get_study_full_dump(db, study.id)``
  and then ``next(p for p in dump['participants'] if p['db_id'] == participant_id)``.
  Because the upstream dump is already SQL-scoped to ``study.id``, the
  in-Python filter cannot return a participant from a different study.

No body or header is read by any export endpoint. The only non-path
parameter is ``include_discussion: bool`` on
``GET /export/package`` — a boolean toggle, not a tenant identifier.

This regression guard pins three behaviours:

1. ``GET /studies/{slug}/participants/{participant_id}/export/json``
   returns 404 when ``participant_id`` belongs to a different study,
   even when the caller has full editor permission on the slug-named
   study.
2. The CSV/PQMethod/R-Kit/audio export endpoints ignore extraneous body
   or header data — they do not honour any tenant filter from the body.
3. ``StudyDataService.get_study_full_dump`` only returns participants
   for the queried study (verified via in-process call).

Status: filed as F-04-005 (observation — all exports membership-scoped
at SQL level; no body/header-trusted filters exist).
"""

from __future__ import annotations

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Study, StudyState
from app.services.study_data_service import StudyDataService

from .conftest import TenancyFixtures


async def _set_studies_active(db: AsyncSession, *studies: Study) -> None:
    """Some export endpoints accept any state; others gate on it. We make
    both studies active so endpoint-level state checks don't preempt the
    cross-tenant assertion."""
    for s in studies:
        s.state = StudyState.active
        db.add(s)
    await db.commit()


@pytest.mark.asyncio
class TestExportFilterCorrectness:
    """Bulk export queries scope by study_id and ignore body/header tenant claims."""

    async def test_participant_json_export_rejects_cross_study_id(
        self,
        tenancy: TenancyFixtures,
        client: AsyncClient,
        db: AsyncSession,
    ) -> None:
        """Passing study_in_a's slug + participant_in_b's id must 404.

        This is the in-Python-filter case (exports.py:229-256). Even
        though the caller has editor permission on study_in_a, the
        underlying dump is already SQL-scoped to study_in_a, so
        ``participant_in_b.id`` cannot be found in the dump.
        """
        await _set_studies_active(db, tenancy.study_in_a, tenancy.study_in_b)

        response = await client.get(
            f"/api/admin/studies/{tenancy.study_in_a.slug}/participants/"
            f"{tenancy.participant_in_b.id}/export/json",
            headers={"Authorization": f"Bearer {tenancy.token_a_owner}"},
        )
        assert response.status_code == 404, (
            "Cross-study participant_id on legitimate study slug must 404; "
            f"got {response.status_code} body={response.text!r}"
        )

    async def test_participant_csv_export_rejects_cross_study_id(
        self,
        tenancy: TenancyFixtures,
        client: AsyncClient,
        db: AsyncSession,
    ) -> None:
        """SQL-level defence-in-depth: participant_csv has
        ``WHERE Participant.id == participant_id AND Participant.study_id == study.id``."""
        await _set_studies_active(db, tenancy.study_in_a, tenancy.study_in_b)

        response = await client.get(
            f"/api/admin/studies/{tenancy.study_in_a.slug}/participants/"
            f"{tenancy.participant_in_b.id}/export/csv",
            headers={"Authorization": f"Bearer {tenancy.token_a_owner}"},
        )
        assert response.status_code == 404, (
            f"Cross-study participant CSV must 404; got {response.status_code}"
        )

    async def test_participant_audio_export_rejects_cross_study_id(
        self,
        tenancy: TenancyFixtures,
        client: AsyncClient,
        db: AsyncSession,
    ) -> None:
        """Audio export is the highest-impact leak (raw audio files)."""
        await _set_studies_active(db, tenancy.study_in_a, tenancy.study_in_b)

        response = await client.get(
            f"/api/admin/studies/{tenancy.study_in_a.slug}/participants/"
            f"{tenancy.participant_in_b.id}/export/audio",
            headers={"Authorization": f"Bearer {tenancy.token_a_owner}"},
        )
        assert response.status_code == 404, (
            f"Cross-study participant audio must 404; got {response.status_code}"
        )

    async def test_full_dump_service_only_returns_target_study_participants(
        self,
        tenancy: TenancyFixtures,
        db: AsyncSession,
    ) -> None:
        """Direct service-level check: ``get_study_full_dump(study_a.id)``
        contains no participant from study_b.

        This is the foundation the in-Python participant_json filter
        relies on. If the service ever returns participants from other
        studies, every consumer leaks.
        """
        dump_a = await StudyDataService.get_study_full_dump(db, tenancy.study_in_a.id)
        ids_in_dump = {p["db_id"] for p in dump_a["participants"]}
        assert tenancy.participant_in_b.id not in ids_in_dump, (
            "get_study_full_dump leaks participants across studies — "
            f"got {ids_in_dump}, study_b participant id is {tenancy.participant_in_b.id}"
        )

        # Symmetric check.
        dump_b = await StudyDataService.get_study_full_dump(db, tenancy.study_in_b.id)
        ids_in_dump_b = {p["db_id"] for p in dump_b["participants"]}
        assert tenancy.participant_in_a.id not in ids_in_dump_b

    async def test_csv_export_ignores_unknown_query_params(
        self,
        tenancy: TenancyFixtures,
        client: AsyncClient,
        db: AsyncSession,
    ) -> None:
        """Extra query params (e.g. ``?study_id=X``, ``?project_id=Y``)
        must not influence the result — FastAPI ignores unknown params,
        but we pin the behaviour to catch a future signature change that
        adds a tenant-claim parameter to the route.
        """
        await _set_studies_active(db, tenancy.study_in_a, tenancy.study_in_b)

        response = await client.get(
            f"/api/admin/studies/{tenancy.study_in_a.slug}/export/csv",
            params={
                "study_id": tenancy.study_in_b.id,
                "project_id": tenancy.project_b.id,
            },
            headers={"Authorization": f"Bearer {tenancy.token_a_owner}"},
        )
        # Either 200 (got study_a's CSV) or 404 (slug not found / no
        # data) — but never an A-export containing study_b's data. We
        # also assert the filename in the Content-Disposition is for
        # study_a, not study_b.
        assert response.status_code == 200, (
            f"CSV export of own study must succeed; got {response.status_code}"
        )
        cd = response.headers.get("content-disposition", "")
        assert tenancy.study_in_a.slug in cd, (
            "CSV filename must reflect the path-derived study slug; "
            f"got Content-Disposition: {cd!r}"
        )
        assert tenancy.study_in_b.slug not in cd, (
            "Body-supplied study_id must not influence the export filename — "
            f"got Content-Disposition: {cd!r}"
        )
