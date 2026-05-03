# Qualis - Open-source platform for conducting Q-methodology research
# Copyright (C) 2025 Julien Vastenekels
# Licensed under the GNU Affero General Public License v3.0 or later.

"""Multi-tenant fixtures for the Wave 3 cross-tenant IDOR harness.

Seeds two parallel projects (A, B) each with the full menagerie of admin-
visible objects (study, participant, concourse, concourse item, concourse
tag, recruitment link, memo entry, memo comment, audio recording, analysis
run). The harness in `test_admin_idor_harness.py` then sends a request as
a project-A member that targets a project-B object id (or X-Project-ID
header) and asserts the response is a denial (403 or 404).

Audio recordings are seeded as DB rows only — no actual S3 object exists.
The presigned-URL generation in admin endpoints will surface a benign
warning during the test run; the harness never asserts on the URL itself
(only on the response status code).
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone

import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    AnalysisRun,
    AudioRecording,
    Concourse,
    ConcourseItem,
    ConcourseItemTranslation,
    ConcourseTag,
    MemoComment,
    MemoEntry,
    MemoParentType,
    Participant,
    Project,
    ProjectMember,
    ProjectRole,
    RecruitmentLink,
    RecruitmentLinkType,
    Study,
    StudyState,
    StudyTranslation,
    User,
)
from app.utils.security import create_access_token, get_password_hash


# -----------------------------------------------------------------------------
# Data container
# -----------------------------------------------------------------------------


@dataclass
class TenancyFixtures:
    """Bundle of seeded objects for the two-project tenancy harness.

    Attribute names match the placeholder suffixes used in path templates:
    `{project_b_id}` resolves to `project_b.id`, `{study_in_b_slug}` to
    `study_in_b.slug`, etc. The `path_substitutions_*` dicts flatten this
    into the str-keyed dict that `route.path_template.format(**subs)` consumes.
    """

    # Projects
    project_a: Project
    project_b: Project

    # Users (six total: each project has owner/member/viewer)
    alice: User
    bob: User
    charlie: User
    dan: User
    eve: User
    frank: User

    # Domain objects in project A (tested-against-A reference; harness uses _b)
    study_in_a: Study
    participant_in_a: Participant
    concourse_in_a: Concourse
    concourse_item_in_a: ConcourseItem
    concourse_tag_in_a: ConcourseTag
    recruitment_link_in_a: RecruitmentLink
    memo_entry_in_a: MemoEntry
    memo_comment_in_a: MemoComment
    audio_in_a: AudioRecording
    analysis_run_in_a: AnalysisRun

    # Domain objects in project B (the cross-tenant targets)
    study_in_b: Study
    participant_in_b: Participant
    concourse_in_b: Concourse
    concourse_item_in_b: ConcourseItem
    concourse_tag_in_b: ConcourseTag
    recruitment_link_in_b: RecruitmentLink
    memo_entry_in_b: MemoEntry
    memo_comment_in_b: MemoComment
    audio_in_b: AudioRecording
    analysis_run_in_b: AnalysisRun

    # JWT bearer headers per user (authoring identity is project-A roles
    # for the harness; project-B identities exist for symmetric tests).
    token_a_owner: str = ""
    token_a_member: str = ""
    token_a_viewer: str = ""
    token_b_owner: str = ""
    token_b_member: str = ""
    token_b_viewer: str = ""

    # Map of placeholder -> str(value) used in path-template substitution.
    path_substitutions_b: dict[str, str] = field(default_factory=dict)

    def header_a(
        self, role: str = "member", with_project_a: bool = False
    ) -> dict[str, str]:
        """Bearer header for project A's owner/member/viewer.

        If ``with_project_a`` is True, also sets X-Project-ID to project A's id
        — for endpoints that legitimately need a header to satisfy the dependency
        but where we still want to see what happens with a path id from B.
        Default is False (we want the cross-tenant case: token from A but
        header (or path) targeting B).
        """
        token_map = {
            "owner": self.token_a_owner,
            "member": self.token_a_member,
            "viewer": self.token_a_viewer,
        }
        headers = {"Authorization": f"Bearer {token_map[role]}"}
        if with_project_a:
            headers["X-Project-ID"] = str(self.project_a.id)
        return headers


# -----------------------------------------------------------------------------
# Seeding helpers
# -----------------------------------------------------------------------------


async def _make_user(db: AsyncSession, label: str) -> User:
    user = User(
        email=f"{label}-{uuid.uuid4().hex[:8]}@example.com",
        hashed_password=get_password_hash("pw"),
        email_verified_at=datetime.now(timezone.utc),
    )
    db.add(user)
    await db.flush()
    return user


async def _make_project(
    db: AsyncSession, suffix: str, owner: User, member: User, viewer: User
) -> Project:
    proj = Project(
        title=f"Project {suffix}", slug=f"project-{suffix}-{uuid.uuid4().hex[:6]}"
    )
    db.add(proj)
    await db.flush()
    db.add_all(
        [
            ProjectMember(project_id=proj.id, user_id=owner.id, role=ProjectRole.owner),
            ProjectMember(
                project_id=proj.id, user_id=member.id, role=ProjectRole.member
            ),
            ProjectMember(
                project_id=proj.id, user_id=viewer.id, role=ProjectRole.viewer
            ),
        ]
    )
    await db.flush()
    return proj


async def _make_study(db: AsyncSession, project: Project, suffix: str) -> Study:
    study = Study(
        slug=f"study-{suffix}-{uuid.uuid4().hex[:6]}",
        project_id=project.id,
        state=StudyState.draft,
        grid_config=[{"score": 0, "capacity": 1}],
        presort_config={},
        postsort_config={},
    )
    db.add(study)
    await db.flush()
    db.add(
        StudyTranslation(
            study_id=study.id,
            language_code="en",
            title=f"Study {suffix}",
            description="d",
            instructions="i",
            consent_title="c",
            consent_description="cd",
        )
    )
    await db.flush()
    return study


async def _make_participant(db: AsyncSession, study: Study) -> Participant:
    p = Participant(
        study_id=study.id,
        language_used="en",
    )
    db.add(p)
    await db.flush()
    return p


async def _make_concourse(db: AsyncSession, project: Project, owner: User) -> Concourse:
    c = Concourse(
        project_id=project.id,
        title=f"Concourse {uuid.uuid4().hex[:6]}",
        description="d",
        created_by=owner.id,
    )
    db.add(c)
    await db.flush()
    return c


async def _make_concourse_item(
    db: AsyncSession, concourse: Concourse, owner: User
) -> ConcourseItem:
    item = ConcourseItem(
        concourse_id=concourse.id,
        code=f"C{uuid.uuid4().hex[:4]}",
        created_by=owner.id,
    )
    db.add(item)
    await db.flush()
    db.add(ConcourseItemTranslation(item_id=item.id, language_code="en", text="text"))
    await db.flush()
    return item


async def _make_concourse_tag(db: AsyncSession, project: Project) -> ConcourseTag:
    tag = ConcourseTag(
        project_id=project.id,
        name=f"tag-{uuid.uuid4().hex[:6]}",
    )
    db.add(tag)
    await db.flush()
    return tag


async def _make_recruitment_link(db: AsyncSession, study: Study) -> RecruitmentLink:
    link = RecruitmentLink(
        study_id=study.id,
        type=RecruitmentLinkType.public,
        token=uuid.uuid4().hex,
        name="link",
        is_active=True,
        expires_at=datetime.now(timezone.utc) + timedelta(days=90),
    )
    db.add(link)
    await db.flush()
    return link


async def _make_memo_entry(
    db: AsyncSession, parent_type: MemoParentType, parent_id: int, owner: User
) -> MemoEntry:
    entry = MemoEntry(
        parent_type=parent_type,
        parent_id=parent_id,
        title="entry",
        body="body",
        position=0,
        created_by=owner.id,
        last_edited_by=owner.id,
    )
    db.add(entry)
    await db.flush()
    return entry


async def _make_memo_comment(
    db: AsyncSession, entry: MemoEntry, owner: User
) -> MemoComment:
    comment = MemoComment(
        entry_id=entry.id,
        user_id=owner.id,
        body="cmt",
        mentions=[],
    )
    db.add(comment)
    await db.flush()
    return comment


async def _make_audio(db: AsyncSession, participant: Participant) -> AudioRecording:
    """Insert an AudioRecording row. No real S3 object — the harness
    only checks the auth/scope decision, not the presigned URL.
    """
    audio = AudioRecording(
        participant_id=participant.id,
        question_key=f"q_{uuid.uuid4().hex[:6]}",
        s3_bucket="test-bucket",
        s3_key=f"audio/{uuid.uuid4().hex}.webm",
        file_size_bytes=1024,
        duration_seconds=1.0,
        mime_type="audio/webm",
    )
    db.add(audio)
    await db.flush()
    return audio


async def _make_analysis_run(
    db: AsyncSession, study: Study, owner: User
) -> AnalysisRun:
    run = AnalysisRun(
        study_id=study.id,
        ran_by_user_id=owner.id,
        extraction_method="pca",
        n_factors=2,
        rotation_method="varimax",
        flagging_mode="auto",
        notes=None,
        factor_notes={},
        result={"placeholder": True},
    )
    db.add(run)
    await db.flush()
    return run


def _token_for(user: User) -> str:
    return create_access_token(subject=user.email, expires_delta=timedelta(minutes=30))


# -----------------------------------------------------------------------------
# Fixture
# -----------------------------------------------------------------------------


@pytest_asyncio.fixture
async def tenancy(db: AsyncSession) -> TenancyFixtures:
    """Seed a two-project tenancy and return the bundle.

    Function-scoped to match the existing `db` fixture (which drops and
    re-creates the schema each test). With 89 parametrised cases this is
    ~89× the seeding cost, which is acceptable for a one-shot security
    harness; the harness can be re-run on demand and is not a hot-path
    suite. If we later want to amortise seeding cost, we'd promote `db`
    to module scope and tear down per-test rows manually.
    """
    # Users — one owner / member / viewer per project.
    alice = await _make_user(db, "alice")
    bob = await _make_user(db, "bob")
    charlie = await _make_user(db, "charlie")
    dan = await _make_user(db, "dan")
    eve = await _make_user(db, "eve")
    frank = await _make_user(db, "frank")

    project_a = await _make_project(db, "a", owner=alice, member=bob, viewer=charlie)
    project_b = await _make_project(db, "b", owner=dan, member=eve, viewer=frank)

    # Project A objects.
    study_in_a = await _make_study(db, project_a, "a")
    participant_in_a = await _make_participant(db, study_in_a)
    concourse_in_a = await _make_concourse(db, project_a, alice)
    concourse_item_in_a = await _make_concourse_item(db, concourse_in_a, alice)
    concourse_tag_in_a = await _make_concourse_tag(db, project_a)
    recruitment_link_in_a = await _make_recruitment_link(db, study_in_a)
    memo_entry_in_a = await _make_memo_entry(
        db, MemoParentType.concourse, concourse_in_a.id, alice
    )
    memo_comment_in_a = await _make_memo_comment(db, memo_entry_in_a, alice)
    audio_in_a = await _make_audio(db, participant_in_a)
    analysis_run_in_a = await _make_analysis_run(db, study_in_a, alice)

    # Project B objects (cross-tenant targets).
    study_in_b = await _make_study(db, project_b, "b")
    participant_in_b = await _make_participant(db, study_in_b)
    concourse_in_b = await _make_concourse(db, project_b, dan)
    concourse_item_in_b = await _make_concourse_item(db, concourse_in_b, dan)
    concourse_tag_in_b = await _make_concourse_tag(db, project_b)
    recruitment_link_in_b = await _make_recruitment_link(db, study_in_b)
    memo_entry_in_b = await _make_memo_entry(
        db, MemoParentType.concourse, concourse_in_b.id, dan
    )
    memo_comment_in_b = await _make_memo_comment(db, memo_entry_in_b, dan)
    audio_in_b = await _make_audio(db, participant_in_b)
    analysis_run_in_b = await _make_analysis_run(db, study_in_b, dan)

    await db.commit()

    fx = TenancyFixtures(
        project_a=project_a,
        project_b=project_b,
        alice=alice,
        bob=bob,
        charlie=charlie,
        dan=dan,
        eve=eve,
        frank=frank,
        study_in_a=study_in_a,
        participant_in_a=participant_in_a,
        concourse_in_a=concourse_in_a,
        concourse_item_in_a=concourse_item_in_a,
        concourse_tag_in_a=concourse_tag_in_a,
        recruitment_link_in_a=recruitment_link_in_a,
        memo_entry_in_a=memo_entry_in_a,
        memo_comment_in_a=memo_comment_in_a,
        audio_in_a=audio_in_a,
        analysis_run_in_a=analysis_run_in_a,
        study_in_b=study_in_b,
        participant_in_b=participant_in_b,
        concourse_in_b=concourse_in_b,
        concourse_item_in_b=concourse_item_in_b,
        concourse_tag_in_b=concourse_tag_in_b,
        recruitment_link_in_b=recruitment_link_in_b,
        memo_entry_in_b=memo_entry_in_b,
        memo_comment_in_b=memo_comment_in_b,
        audio_in_b=audio_in_b,
        analysis_run_in_b=analysis_run_in_b,
        token_a_owner=_token_for(alice),
        token_a_member=_token_for(bob),
        token_a_viewer=_token_for(charlie),
        token_b_owner=_token_for(dan),
        token_b_member=_token_for(eve),
        token_b_viewer=_token_for(frank),
    )

    fx.path_substitutions_b = {
        # Project-B identifiers (path placeholders the harness uses).
        "project_b_id": str(project_b.id),
        "project_b_slug": project_b.slug,
        "study_in_b_id": str(study_in_b.id),
        "study_in_b_slug": study_in_b.slug,
        "participant_in_b_id": str(participant_in_b.id),
        "concourse_in_b_id": str(concourse_in_b.id),
        "concourse_item_in_b_id": str(concourse_item_in_b.id),
        "concourse_tag_in_b_id": str(concourse_tag_in_b.id),
        "recruitment_link_in_b_id": str(recruitment_link_in_b.id),
        "memo_entry_in_b_id": str(memo_entry_in_b.id),
        "memo_comment_in_b_id": str(memo_comment_in_b.id),
        "audio_in_b_id": str(audio_in_b.id),
        "analysis_run_in_b_id": str(analysis_run_in_b.id),
        # User-id targets for endpoints like /projects/{slug}/members/{user_id}.
        "user_in_b_id": str(dan.id),
        # Statement id placeholder (we don't seed a statement; the route
        # only matters for cross-tenant denial which fires before id lookup).
        "statement_id": "999999",
    }

    return fx
