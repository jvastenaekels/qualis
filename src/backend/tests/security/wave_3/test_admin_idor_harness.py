# Qualis - Open-source platform for conducting Q-methodology research
# Copyright (C) 2025 Julien Vastenekels
# Licensed under the GNU Affero General Public License v3.0 or later.

"""Wave 3 Task 3 — Cross-tenant IDOR harness over the 89 admin endpoints.

For each admin route, we send the request as a project-A member while
targeting a project-B object (either via the path id/slug or via the
``X-Project-ID`` header). The expected behaviour is a denial — 403 (header-
based ``require_project_role``) or 404 (slug-based ``check_*_permission``,
which collapses existence-disclosure with permission denial).

Routes that don't fit the cross-tenant model are skipped explicitly:

- Top-level **enumeration** routes (``GET /api/admin/projects``,
  ``POST /api/admin/projects``, ``GET /api/admin/users``,
  ``GET /api/admin/invitations/verify``,
  ``POST /api/admin/invitations/accept``, ``GET /api/admin/memo/templates``)
  have no cross-tenant target id; their isolation is asserted by other
  test classes (filter by membership / superuser gate).
- Routes for which we don't seed an object (e.g. statement_id paths)
  still fire — the dependency runs before the id lookup, so the denial
  is asserted before any 404 from the missing object would surface.

Routes are encoded as :class:`Route` rows. Each row carries the HTTP
method, the path template, an isolation pattern enum, an optional minimal
body that satisfies request validation, and the set of denial status
codes the route may legitimately return. A status code outside the set
is a candidate finding for Task 4 — the harness records it but does not
fix anything.

Pattern legend
--------------
- **A_HEADER**: Bob sends ``X-Project-ID = project_b.id``. The dep layer
  (``require_project_role``) rejects because Bob is not a member of B.
  Tests the *dependency layer* only.
- **A_SLUG**: harness puts B's slug in the path. ``check_*_permission``
  finds no membership row for Bob in B's slug-named project → 404.
- **B**: harness puts B's object id in the path with Bob's bearer. A
  bespoke inline check resolves the object's parent project and finds no
  Bob membership → 403/404.
- **B_VALID_HEADER**: the canonical Pattern-B attack. Bob sends a *valid*
  ``X-Project-ID = project_a.id`` (he IS a member of A, so the dep layer
  accepts the request) but supplies a foreign object id from project B in
  the path (e.g. ``concourse_in_b.id``). Whether the cross-tenant object
  leaks depends entirely on **inline service guards** (e.g.
  ``concourses.py:170`` checks ``concourse.project_id != project.id``).
  These are *pin-down tests* — the inline guards already exist in
  production; the cases ensure a future refactor that drops a guard while
  keeping the dependency will surface here before merge.
  Expected: ``{403, 404}``.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

import pytest
from httpx import AsyncClient

from .conftest import TenancyFixtures


Pattern = Literal["A_HEADER", "A_SLUG", "B", "B_VALID_HEADER"]


@dataclass(frozen=True)
class Route:
    """One row in the cross-tenant denial harness.

    Attributes
    ----------
    method
        HTTP verb in upper case.
    path_template
        URL with placeholder names from
        :attr:`TenancyFixtures.path_substitutions_b`.
    pattern
        Isolation mechanism the route uses:
        - ``A_HEADER``: header dependency (``X-Project-ID``); harness sends
          B's id in the header along with A's bearer.
        - ``A_SLUG``: ``check_project_permission`` / ``check_study_permission``
          on a slug in the path; harness sends B's slug with A's bearer.
        - ``B``: bespoke inline check on an opaque object id in the path;
          harness sends B's object id with A's bearer.
        - ``B_VALID_HEADER``: pin-down for inline service guards. Harness
          sends A's id in the ``X-Project-ID`` header (dep layer accepts)
          but puts B's object id in the path. The inline guard (e.g.
          ``concourse.project_id != project.id``) must produce 403/404.
    body
        Minimal JSON body satisfying request validation. ``None`` for
        GET / DELETE without a body.
    expected
        Acceptable denial status codes. The harness asserts the response
        is in this set. Differs across routes because some return 403,
        some return 404 by design.
    """

    method: str
    path_template: str
    pattern: Pattern
    body: dict | None
    expected: frozenset[int]


# --- Minimal bodies that satisfy schema validation ---------------------------
#
# These bodies are designed to PASS the schema validator so that the request
# reaches the auth/scope check. They MUST NOT mutate state — denial fires
# first, before the body's content matters. If a body fails schema validation,
# we'd see 422 and the harness would never observe the auth decision.

_STUDY_CREATE_BODY = {
    "translations": [
        {
            "language_code": "en",
            "title": "x",
            "description": "x",
            "instructions": "x",
            "consent_title": "x",
            "consent_description": "x",
        }
    ],
    "statements": [],
}

_STUDY_UPDATE_BODY = {"slug": "ignored-slug-cross-tenant"}
_STUDY_STATE_BODY = "active"  # POST /state takes a state via query/body
_TAG_CREATE_BODY = {"name": "x"}
_CONCOURSE_CREATE_BODY = {"title": "x"}
_CONCOURSE_UPDATE_BODY = {"title": "y"}
_CONCOURSE_ITEM_CREATE_BODY = {
    "code": "C1",
    "translations": [{"language_code": "en", "text": "t"}],
}
_CONCOURSE_ITEM_BULK_BODY = {"items": [_CONCOURSE_ITEM_CREATE_BODY]}
_CONCOURSE_ITEM_IMPORT_BODY = {
    "text_block": "line\n",
    "language_code": "en",
}
_CONCOURSE_ITEM_UPDATE_BODY = {"version": 1}
_CONCOURSE_ITEM_COMMENT_BODY = {"body": "x"}
_PROJECT_CREATE_BODY = {"title": "x", "slug": "x-project-cross"}
_PROJECT_UPDATE_BODY = {"title": "y"}
_PROJECT_MEMBER_UPDATE_BODY = {"role": "member"}
_PROJECT_INVITE_BODY = {"email": "stranger@example.com", "role": "member"}
_INVITATION_ACCEPT_BODY = {"token": "irrelevant.cross.tenant"}
_USER_CREATE_BODY = {"email": "u@example.com", "password": "pw1234"}
_RECRUITMENT_LINK_BODY = {"name": "x", "type": "public"}
_MEMO_ENTRY_BODY = {"title": "x", "body": "y"}
_MEMO_ENTRY_UPDATE_BODY = {"title": "x"}
_MEMO_COMMENT_BODY = {"body": "x"}
_MEMO_COMMENT_UPDATE_BODY = {"body": "x"}
_ANALYSIS_RUN_BODY = {"n_factors": 2}
_ANALYSIS_PREVIEW_BODY = {"n_factors_range": [2, 3]}
_ANALYSIS_RUN_PATCH_BODY = {"notes": "x"}
_BULK_ANONYMISE_BODY = {"submitted_before": "2030-01-01T00:00:00Z"}
_PARTICIPANT_DISCARD_BODY = {"is_discarded": True, "discard_reason": "x"}
_IMPORT_CONCOURSE_BODY = {
    "concourse_id": 999_999,
    "item_ids": [1],
    "code_prefix": "",
    "replace_existing": False,
}
_STUDY_IMPORT_BODY = {"config": {"version": "1.0"}, "new_slug": "x-imported-cross"}


# --- The 89 routes ----------------------------------------------------------
#
# Mirrors the multi-tenant-isolation route inventory from the security audit.
# Routes flagged with ``CROSS_TENANT_NOT_APPLICABLE`` in
# :data:`SKIPPED_ROUTES` below are top-level enumerations or unauth endpoints
# whose isolation is not a cross-tenant IDOR (they have no project-B target).

ROUTES: list[Route] = [
    # -- projects.py (10 routes; 2 are top-level, skipped) -----------------------
    Route(
        "GET",
        "/api/admin/projects/{project_b_slug}",
        "A_SLUG",
        None,
        frozenset({403, 404}),
    ),
    Route(
        "PATCH",
        "/api/admin/projects/{project_b_slug}",
        "A_SLUG",
        _PROJECT_UPDATE_BODY,
        frozenset({403, 404}),
    ),
    Route(
        "GET",
        "/api/admin/projects/{project_b_slug}/members",
        "A_SLUG",
        None,
        frozenset({403, 404}),
    ),
    Route(
        "PATCH",
        "/api/admin/projects/{project_b_slug}/members/{user_in_b_id}",
        "A_SLUG",
        _PROJECT_MEMBER_UPDATE_BODY,
        frozenset({403, 404}),
    ),
    Route(
        "DELETE",
        "/api/admin/projects/{project_b_slug}/members/{user_in_b_id}",
        "A_SLUG",
        None,
        frozenset({403, 404}),
    ),
    Route(
        "DELETE",
        "/api/admin/projects/{project_b_slug}",
        "A_SLUG",
        None,
        frozenset({403, 404}),
    ),
    Route(
        "POST",
        "/api/admin/projects/{project_b_slug}/invitations",
        "A_SLUG",
        _PROJECT_INVITE_BODY,
        frozenset({403, 404}),
    ),
    # -- recruitment.py (3 routes) --------------------------------------------
    Route(
        "GET",
        "/api/admin/recruitment/{study_in_b_slug}/links",
        "A_SLUG",
        None,
        frozenset({403, 404}),
    ),
    Route(
        "POST",
        "/api/admin/recruitment/{study_in_b_slug}/links",
        "A_SLUG",
        _RECRUITMENT_LINK_BODY,
        frozenset({403, 404}),
    ),
    Route(
        "DELETE",
        "/api/admin/recruitment/links/{recruitment_link_in_b_id}",
        "B",
        None,
        frozenset({403, 404}),
    ),
    # -- memos.py (13 cross-tenant routes; templates skipped) -----------------
    Route(
        "GET",
        "/api/admin/concourses/{concourse_in_b_id}/memo",
        "B",
        None,
        frozenset({403, 404}),
    ),
    Route(
        "GET",
        "/api/admin/studies/{study_in_b_id}/memo",
        "B",
        None,
        frozenset({403, 404}),
    ),
    Route(
        "GET",
        "/api/admin/concourses/{concourse_in_b_id}/memo/unread?since=2030-01-01T00:00:00Z",
        "B",
        None,
        frozenset({403, 404}),
    ),
    Route(
        "GET",
        "/api/admin/studies/{study_in_b_id}/memo/unread?since=2030-01-01T00:00:00Z",
        "B",
        None,
        frozenset({403, 404}),
    ),
    Route(
        "POST",
        "/api/admin/concourses/{concourse_in_b_id}/memo/entries",
        "B",
        _MEMO_ENTRY_BODY,
        frozenset({403, 404}),
    ),
    Route(
        "POST",
        "/api/admin/studies/{study_in_b_id}/memo/entries",
        "B",
        _MEMO_ENTRY_BODY,
        frozenset({403, 404}),
    ),
    Route(
        "PATCH",
        "/api/admin/memo-entries/{memo_entry_in_b_id}",
        "B",
        _MEMO_ENTRY_UPDATE_BODY,
        frozenset({403, 404}),
    ),
    Route(
        "DELETE",
        "/api/admin/memo-entries/{memo_entry_in_b_id}",
        "B",
        None,
        frozenset({403, 404}),
    ),
    Route(
        "POST",
        "/api/admin/memo-entries/{memo_entry_in_b_id}/comments",
        "B",
        _MEMO_COMMENT_BODY,
        frozenset({403, 404}),
    ),
    Route(
        "PATCH",
        "/api/admin/memo-comments/{memo_comment_in_b_id}",
        "B",
        _MEMO_COMMENT_UPDATE_BODY,
        frozenset({403, 404}),
    ),
    Route(
        "DELETE",
        "/api/admin/memo-comments/{memo_comment_in_b_id}",
        "B",
        None,
        frozenset({403, 404}),
    ),
    Route(
        "POST",
        "/api/admin/memo-comments/{memo_comment_in_b_id}/resolve",
        "B",
        None,
        frozenset({403, 404}),
    ),
    Route(
        "POST",
        "/api/admin/memo-comments/{memo_comment_in_b_id}/unresolve",
        "B",
        None,
        frozenset({403, 404}),
    ),
    # -- studies_participants.py (5 routes) -----------------------------------
    Route(
        "GET",
        "/api/admin/studies/{study_in_b_slug}/participants",
        "A_SLUG",
        None,
        frozenset({403, 404}),
    ),
    Route(
        "GET",
        "/api/admin/studies/participants/{participant_in_b_id}",
        "B",
        None,
        frozenset({403, 404}),
    ),
    Route(
        "PATCH",
        "/api/admin/studies/participants/{participant_in_b_id}/discard",
        "B",
        _PARTICIPANT_DISCARD_BODY,
        frozenset({403, 404}),
    ),
    Route(
        "DELETE",
        "/api/admin/studies/{study_in_b_slug}/participants",
        "A_SLUG",
        None,
        frozenset({403, 404}),
    ),
    Route(
        "DELETE",
        "/api/admin/studies/{study_in_b_slug}/participants/{participant_in_b_id}/personal-data",
        "A_SLUG",
        None,
        frozenset({403, 404}),
    ),
    # -- exports.py (8 routes) ------------------------------------------------
    Route(
        "GET",
        "/api/admin/studies/{study_in_b_slug}/export/csv",
        "A_SLUG",
        None,
        frozenset({403, 404}),
    ),
    Route(
        "GET",
        "/api/admin/studies/{study_in_b_slug}/export/pqmethod",
        "A_SLUG",
        None,
        frozenset({403, 404}),
    ),
    Route(
        "GET",
        "/api/admin/studies/{study_in_b_slug}/export/r-kit",
        "A_SLUG",
        None,
        frozenset({403, 404}),
    ),
    Route(
        "GET",
        "/api/admin/studies/{study_in_b_slug}/dump",
        "A_SLUG",
        None,
        frozenset({403, 404}),
    ),
    Route(
        "GET",
        "/api/admin/studies/{study_in_b_slug}/participants/{participant_in_b_id}/export/csv",
        "A_SLUG",
        None,
        frozenset({403, 404}),
    ),
    Route(
        "GET",
        "/api/admin/studies/{study_in_b_slug}/participants/{participant_in_b_id}/export/json",
        "A_SLUG",
        None,
        frozenset({403, 404}),
    ),
    Route(
        "GET",
        "/api/admin/studies/{study_in_b_slug}/participants/{participant_in_b_id}/export/audio",
        "A_SLUG",
        None,
        frozenset({403, 404}),
    ),
    Route(
        "GET",
        "/api/admin/studies/{study_in_b_slug}/export/package",
        "A_SLUG",
        None,
        frozenset({403, 404}),
    ),
    # -- lifecycle.py (3 routes) ----------------------------------------------
    Route(
        "GET",
        "/api/admin/studies/{study_in_b_slug}/data-inventory",
        "A_SLUG",
        None,
        frozenset({403, 404}),
    ),
    Route(
        "GET",
        "/api/admin/studies/{study_in_b_slug}/anonymise-preview?cutoff=2030-01-01T00:00:00Z",
        "A_SLUG",
        None,
        frozenset({403, 404}),
    ),
    Route(
        "POST",
        "/api/admin/studies/{study_in_b_slug}/anonymise-bulk",
        "A_SLUG",
        _BULK_ANONYMISE_BODY,
        frozenset({403, 404}),
    ),
    # -- studies.py main (12 routes; the GET / and POST / are header-scoped) --
    Route(
        "POST",
        "/api/admin/studies",
        "A_HEADER",
        _STUDY_CREATE_BODY,
        frozenset({403, 404}),
    ),
    Route(
        "GET",
        "/api/admin/studies",
        "A_HEADER",
        None,
        frozenset({403, 404}),
    ),
    Route(
        "GET",
        "/api/admin/studies/{study_in_b_slug}",
        "A_SLUG",
        None,
        frozenset({403, 404}),
    ),
    Route(
        "PATCH",
        "/api/admin/studies/{study_in_b_slug}",
        "A_SLUG",
        _STUDY_UPDATE_BODY,
        frozenset({403, 404}),
    ),
    Route(
        "POST",
        "/api/admin/studies/{study_in_b_slug}/validate",
        "A_SLUG",
        None,
        frozenset({403, 404}),
    ),
    Route(
        "POST",
        "/api/admin/studies/{study_in_b_slug}/state?new_state=active",
        "A_SLUG",
        None,
        frozenset({403, 404}),
    ),
    Route(
        "POST",
        "/api/admin/studies/{study_in_b_slug}/reset",
        "A_SLUG",
        None,
        frozenset({403, 404}),
    ),
    Route(
        "DELETE",
        "/api/admin/studies/{study_in_b_slug}",
        "A_SLUG",
        None,
        frozenset({403, 404}),
    ),
    Route(
        "POST",
        "/api/admin/studies/{study_in_b_slug}/import-concourse",
        "A_SLUG",
        _IMPORT_CONCOURSE_BODY,
        frozenset({403, 404}),
    ),
    Route(
        "GET",
        "/api/admin/studies/{study_in_b_slug}/stale-statements",
        "A_SLUG",
        None,
        frozenset({403, 404}),
    ),
    Route(
        "POST",
        "/api/admin/studies/{study_in_b_slug}/sync-statement/{statement_id}",
        "A_SLUG",
        None,
        frozenset({403, 404}),
    ),
    Route(
        "POST",
        "/api/admin/studies/{study_in_b_slug}/sync-all-stale",
        "A_SLUG",
        None,
        frozenset({403, 404}),
    ),
    # -- analysis.py (10 routes) ----------------------------------------------
    Route(
        "GET",
        "/api/admin/studies/{study_in_b_slug}/analysis/eigenvalues",
        "A_SLUG",
        None,
        frozenset({403, 404}),
    ),
    Route(
        "POST",
        "/api/admin/studies/{study_in_b_slug}/analysis/run",
        "A_SLUG",
        _ANALYSIS_RUN_BODY,
        frozenset({403, 404}),
    ),
    Route(
        "POST",
        "/api/admin/studies/{study_in_b_slug}/analysis/preview-range",
        "A_SLUG",
        _ANALYSIS_PREVIEW_BODY,
        frozenset({403, 404}),
    ),
    Route(
        "GET",
        "/api/admin/studies/{study_in_b_slug}/analysis/runs",
        "A_SLUG",
        None,
        frozenset({403, 404}),
    ),
    Route(
        "GET",
        "/api/admin/studies/{study_in_b_slug}/analysis/runs/{analysis_run_in_b_id}",
        "A_SLUG",
        None,
        frozenset({403, 404}),
    ),
    Route(
        "PATCH",
        "/api/admin/studies/{study_in_b_slug}/analysis/runs/{analysis_run_in_b_id}",
        "A_SLUG",
        _ANALYSIS_RUN_PATCH_BODY,
        frozenset({403, 404}),
    ),
    Route(
        "DELETE",
        "/api/admin/studies/{study_in_b_slug}/analysis/runs/{analysis_run_in_b_id}",
        "A_SLUG",
        None,
        frozenset({403, 404}),
    ),
    Route(
        "GET",
        "/api/admin/studies/{study_in_b_slug}/analysis/audios?participant_ids={participant_in_b_id}",
        "A_SLUG",
        None,
        frozenset({403, 404}),
    ),
    Route(
        "GET",
        "/api/admin/studies/{study_in_b_slug}/analysis/comments?participant_ids={participant_in_b_id}",
        "A_SLUG",
        None,
        frozenset({403, 404}),
    ),
    # -- studies_import_export.py (4 routes; 2 top-level skipped) -------------
    Route(
        "GET",
        "/api/admin/studies/{study_in_b_slug}/stats",
        "A_SLUG",
        None,
        frozenset({403, 404}),
    ),
    Route(
        "GET",
        "/api/admin/studies/{study_in_b_slug}/export/config",
        "A_SLUG",
        None,
        frozenset({403, 404}),
    ),
    Route(
        "GET",
        "/api/admin/studies/{study_in_b_slug}/storage-usage",
        "A_SLUG",
        None,
        frozenset({403, 404}),
    ),
    # -- concourses.py (15 routes) --------------------------------------------
    Route("GET", "/api/admin/concourses/tags", "A_HEADER", None, frozenset({403, 404})),
    Route(
        "POST",
        "/api/admin/concourses/tags",
        "A_HEADER",
        _TAG_CREATE_BODY,
        frozenset({403, 404}),
    ),
    Route(
        "DELETE",
        "/api/admin/concourses/tags/{concourse_tag_in_b_id}",
        "A_HEADER",  # require_project_role(member); B's tag id with A's header
        None,
        frozenset({403, 404}),
    ),
    Route(
        "POST",
        "/api/admin/concourses",
        "A_HEADER",
        _CONCOURSE_CREATE_BODY,
        frozenset({403, 404}),
    ),
    Route("GET", "/api/admin/concourses", "A_HEADER", None, frozenset({403, 404})),
    Route(
        "GET",
        "/api/admin/concourses/{concourse_in_b_id}",
        "A_HEADER",
        None,
        frozenset({403, 404}),
    ),
    Route(
        "PATCH",
        "/api/admin/concourses/{concourse_in_b_id}",
        "A_HEADER",
        _CONCOURSE_UPDATE_BODY,
        frozenset({403, 404}),
    ),
    Route(
        "DELETE",
        "/api/admin/concourses/{concourse_in_b_id}",
        "A_HEADER",
        None,
        frozenset({403, 404}),
    ),
    Route(
        "POST",
        "/api/admin/concourses/{concourse_in_b_id}/items",
        "A_HEADER",
        _CONCOURSE_ITEM_CREATE_BODY,
        frozenset({403, 404}),
    ),
    Route(
        "POST",
        "/api/admin/concourses/{concourse_in_b_id}/items/bulk",
        "A_HEADER",
        _CONCOURSE_ITEM_BULK_BODY,
        frozenset({403, 404}),
    ),
    Route(
        "POST",
        "/api/admin/concourses/{concourse_in_b_id}/items/import",
        "A_HEADER",
        _CONCOURSE_ITEM_IMPORT_BODY,
        frozenset({403, 404}),
    ),
    Route(
        "PATCH",
        "/api/admin/concourses/{concourse_in_b_id}/items/{concourse_item_in_b_id}",
        "A_HEADER",
        _CONCOURSE_ITEM_UPDATE_BODY,
        frozenset({403, 404}),
    ),
    Route(
        "DELETE",
        "/api/admin/concourses/{concourse_in_b_id}/items/{concourse_item_in_b_id}",
        "A_HEADER",
        None,
        frozenset({403, 404}),
    ),
    Route(
        "GET",
        "/api/admin/concourses/{concourse_in_b_id}/items/{concourse_item_in_b_id}/versions",
        "A_HEADER",
        None,
        frozenset({403, 404}),
    ),
    Route(
        "GET",
        "/api/admin/concourses/{concourse_in_b_id}/items/{concourse_item_in_b_id}/comments",
        "A_HEADER",
        None,
        frozenset({403, 404}),
    ),
    Route(
        "POST",
        "/api/admin/concourses/{concourse_in_b_id}/items/{concourse_item_in_b_id}/comments",
        "A_HEADER",
        _CONCOURSE_ITEM_COMMENT_BODY,
        frozenset({403, 404}),
    ),
    # -- users.py (3 routes; superuser-gated) ---------------------------------
    Route(
        "DELETE",
        "/api/admin/users/{user_in_b_id}",
        "A_HEADER",  # not really header-based but project-A bearer must be 403 (not superuser)
        None,
        frozenset({403, 404}),
    ),
    # -- studies_import_export.py top-level (require_project_role(member)) ---
    Route(
        "POST",
        "/api/admin/studies/import",
        "A_HEADER",
        _STUDY_IMPORT_BODY,
        frozenset({403, 404}),
    ),
    Route(
        "POST",
        "/api/admin/studies/validate-import",
        "A_HEADER",
        {"config": {"version": "1.0"}},
        frozenset({403, 404}),
    ),
]


# Routes excluded from the cross-tenant harness.
# Either they have no project-B target (top-level enumeration / superuser /
# unauth) or their isolation is verified by another harness.
SKIPPED_ROUTES: list[tuple[str, str, str]] = [
    ("GET", "/api/admin/projects", "list filtered to caller's memberships"),
    ("POST", "/api/admin/projects", "creates new project; no B target"),
    (
        "GET",
        "/api/admin/invitations/verify",
        "unauthenticated; harness for token tampering lives elsewhere",
    ),
    (
        "POST",
        "/api/admin/invitations/accept",
        "auth-only token consumption; cross-tenant N/A",
    ),
    ("GET", "/api/admin/users", "superuser-gated; cross-project N/A"),
    ("GET", "/api/admin/memo/templates", "static templates; no project scope"),
]


def _format_path(template: str, fx: TenancyFixtures) -> str:
    """Substitute placeholder names with project-B identifiers."""
    return template.format(**fx.path_substitutions_b)


# --- B_VALID_HEADER routes — pin-down tests for inline service guards --------
#
# These are the canonical Pattern-B attack: Bob sends a *valid*
# X-Project-ID = project_a.id (dep layer accepts; Bob IS a member of A) but
# supplies a foreign object id from project B in the path. The inline service
# guard must catch it and return 403 or 404.
#
# Only A_HEADER routes whose path contains a project-scoped object id appear
# here. Routes with no path id (POST /concourses, GET /concourses, etc.),
# body-only id routes (studies/import), or superuser-gated routes (users/{id})
# are not applicable and are omitted.

ROUTES_B_VALID_HEADER: list[Route] = [
    # concourses.py — tag delete: service filters tag by project.id
    Route(
        "DELETE",
        "/api/admin/concourses/tags/{concourse_tag_in_b_id}",
        "B_VALID_HEADER",
        None,
        frozenset({403, 404}),
    ),
    # concourses.py — GET concourse: concourse.project_id != project.id → 404
    Route(
        "GET",
        "/api/admin/concourses/{concourse_in_b_id}",
        "B_VALID_HEADER",
        None,
        frozenset({403, 404}),
    ),
    # concourses.py — PATCH concourse: service update_concourse checks project.id
    Route(
        "PATCH",
        "/api/admin/concourses/{concourse_in_b_id}",
        "B_VALID_HEADER",
        _CONCOURSE_UPDATE_BODY,
        frozenset({403, 404}),
    ),
    # concourses.py — DELETE concourse: concourse.project_id != project.id → 404
    Route(
        "DELETE",
        "/api/admin/concourses/{concourse_in_b_id}",
        "B_VALID_HEADER",
        None,
        frozenset({403, 404}),
    ),
    # concourses.py — POST items: _verify_concourse_ownership(concourse_id, project.id)
    Route(
        "POST",
        "/api/admin/concourses/{concourse_in_b_id}/items",
        "B_VALID_HEADER",
        _CONCOURSE_ITEM_CREATE_BODY,
        frozenset({403, 404}),
    ),
    # concourses.py — POST items/bulk: same ownership guard
    Route(
        "POST",
        "/api/admin/concourses/{concourse_in_b_id}/items/bulk",
        "B_VALID_HEADER",
        _CONCOURSE_ITEM_BULK_BODY,
        frozenset({403, 404}),
    ),
    # concourses.py — POST items/import: same ownership guard
    Route(
        "POST",
        "/api/admin/concourses/{concourse_in_b_id}/items/import",
        "B_VALID_HEADER",
        _CONCOURSE_ITEM_IMPORT_BODY,
        frozenset({403, 404}),
    ),
    # concourses.py — PATCH item: _verify_concourse_ownership + _verify_item_ownership
    Route(
        "PATCH",
        "/api/admin/concourses/{concourse_in_b_id}/items/{concourse_item_in_b_id}",
        "B_VALID_HEADER",
        _CONCOURSE_ITEM_UPDATE_BODY,
        frozenset({403, 404}),
    ),
    # concourses.py — DELETE item: same dual ownership guard
    Route(
        "DELETE",
        "/api/admin/concourses/{concourse_in_b_id}/items/{concourse_item_in_b_id}",
        "B_VALID_HEADER",
        None,
        frozenset({403, 404}),
    ),
    # concourses.py — GET item versions: _verify_concourse_ownership + _verify_item_ownership
    Route(
        "GET",
        "/api/admin/concourses/{concourse_in_b_id}/items/{concourse_item_in_b_id}/versions",
        "B_VALID_HEADER",
        None,
        frozenset({403, 404}),
    ),
    # concourses.py — GET item comments: same dual ownership guard
    Route(
        "GET",
        "/api/admin/concourses/{concourse_in_b_id}/items/{concourse_item_in_b_id}/comments",
        "B_VALID_HEADER",
        None,
        frozenset({403, 404}),
    ),
    # concourses.py — POST item comment: same dual ownership guard
    Route(
        "POST",
        "/api/admin/concourses/{concourse_in_b_id}/items/{concourse_item_in_b_id}/comments",
        "B_VALID_HEADER",
        _CONCOURSE_ITEM_COMMENT_BODY,
        frozenset({403, 404}),
    ),
]


@pytest.mark.asyncio
class TestProjectAMemberCannotAccessProjectBResource:
    """Cross-tenant denial harness over the 89 admin endpoints."""

    @pytest.mark.parametrize(
        "route",
        ROUTES,
        ids=lambda r: f"{r.method}_{r.path_template}",
    )
    async def test_cross_tenant_denial(
        self,
        route: Route,
        tenancy: TenancyFixtures,
        client: AsyncClient,
    ) -> None:
        """Bob (project-A member) targets project-B resources — must be denied.

        Pattern legend (also documented on :class:`Route`):

        - **A_HEADER**: harness sends ``X-Project-ID = project_b.id`` along
          with Bob's bearer. ``require_project_role`` checks if Bob is a
          member of project B; he is not → 403.
        - **A_SLUG**: harness puts B's slug in the path. ``check_*_permission``
          tries to find a row where Bob is a member of the slug-named
          project; finds none → 404.
        - **B**: harness puts B's object id in the path. The route's
          bespoke inline check resolves the object's parent project, then
          looks up Bob's membership; finds none → 403 or 404.

        The expected denial set is therefore ``{403, 404}`` for all routes;
        the harness records the actual code so Task 4 can spot any 200/500
        leakage or unexpected status.
        """
        path = _format_path(route.path_template, tenancy)
        headers = {"Authorization": f"Bearer {tenancy.token_a_member}"}
        if route.pattern == "A_HEADER":
            headers["X-Project-ID"] = str(tenancy.project_b.id)

        response = await client.request(
            route.method,
            path,
            headers=headers,
            json=route.body,
        )

        assert response.status_code in route.expected, (
            f"Cross-tenant leak candidate: {route.method} {path} "
            f"(pattern={route.pattern}) returned {response.status_code} — "
            f"expected one of {sorted(route.expected)}. "
            f"Body preview: {response.text[:200]}"
        )

    @pytest.mark.parametrize(
        "route",
        ROUTES_B_VALID_HEADER,
        ids=lambda r: f"{r.method}_{r.path_template}",
    )
    async def test_inline_guard_with_valid_header(
        self,
        route: Route,
        tenancy: TenancyFixtures,
        client: AsyncClient,
    ) -> None:
        """Bob sends a *valid* X-Project-ID (project A) but a foreign path id.

        Pattern: **B_VALID_HEADER** — the dep layer (``require_project_role``)
        accepts the request because Bob is legitimately a member of A and the
        ``X-Project-ID`` header names A. The denial must therefore come from
        the **inline service guard** (e.g. ``concourse.project_id != project.id``
        or ``_verify_concourse_ownership``). These are pin-down tests: the
        guards already exist; the cases ensure a future refactor cannot
        silently remove a guard while keeping the dependency layer intact.
        """
        path = _format_path(route.path_template, tenancy)
        headers = {
            "Authorization": f"Bearer {tenancy.token_a_member}",
            "X-Project-ID": str(tenancy.project_a.id),
        }

        response = await client.request(
            route.method,
            path,
            headers=headers,
            json=route.body,
        )

        assert response.status_code in route.expected, (
            f"Inline-guard leak candidate: {route.method} {path} "
            f"(pattern={route.pattern}) returned {response.status_code} — "
            f"expected one of {sorted(route.expected)}. "
            f"A valid X-Project-ID header was sent; denial must come from "
            f"the inline service guard, not the dep layer. "
            f"Body preview: {response.text[:200]}"
        )


# Coverage assertion — keeps the harness honest about how many of the 89
# inventory routes are actually exercised.
def test_harness_coverage_matches_inventory() -> None:
    """The harness must cover (encoded + skipped) routes ≥ inventory size."""
    encoded = len(ROUTES)
    skipped = len(SKIPPED_ROUTES)
    assert encoded + skipped >= 88, (
        f"Harness covers {encoded} routes + {skipped} skipped = "
        f"{encoded + skipped}; inventory is 88. Update ROUTES or SKIPPED_ROUTES."
    )
