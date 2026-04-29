# Qualis - Open-source platform for conducting Q-methodology research
# Copyright (C) 2025 Julien Vastenekels
# Licensed under the GNU Affero General Public License v3.0 or later.

"""Admin endpoints for the memo subsystem."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.dependencies import (
    PROJECT_ROLE_HIERARCHY,
    get_current_user,
    get_db,
)
from app.limiter import limiter
from app.models import (
    Concourse,
    MemoEntry,
    MemoParentType,
    ProjectMember,
    ProjectRole,
    Study,
    User,
)
from app.schemas.memos import (
    MemoCommentCreate,
    MemoCommentRead,
    MemoCommentUpdate,
    MemoEntryCreate,
    MemoEntryRead,
    MemoEntryUpdate,
    MemoParentTypeLiteral,
    MemoRead,
    MemoTemplate,
)
from app.services.memo_service import MemoService

# Unlike other admin routers (mounted at /api/admin/<area>), this one
# spans multiple roots — concourses, studies, memo-entries, memo-comments,
# memo/templates — so it carries its own /admin prefix and registers
# at /api in main.py.
router = APIRouter(prefix="/admin", tags=["memos"])


# ---------- helpers ---------------------------------------------------------


async def _resolve_entry_parent(
    db: AsyncSession, entry_id: int
) -> tuple[MemoEntry, int]:
    """Return (entry, project_id) for the entry's parent.

    Raises 404 if the entry or its parent is missing.
    """
    entry = await db.get(MemoEntry, entry_id)
    if entry is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Memo entry not found")
    if entry.parent_type == MemoParentType.concourse:
        c = await db.get(Concourse, entry.parent_id)
        if c is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Parent missing")
        return entry, c.project_id
    s = await db.get(Study, entry.parent_id)
    if s is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Parent missing")
    return entry, s.project_id


async def _check_member(
    db: AsyncSession,
    project_id: int,
    user: User,
    required: ProjectRole,
) -> None:
    """Verify the user is a project member at >= required role."""
    row = (
        await db.execute(
            select(ProjectMember).where(
                ProjectMember.project_id == project_id,
                ProjectMember.user_id == user.id,
            )
        )
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Project access denied")
    if PROJECT_ROLE_HIERARCHY[row.role] < PROJECT_ROLE_HIERARCHY[required]:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            detail=f"Insufficient permissions. Required: {required.value}",
        )


async def _reload_entry(db: AsyncSession, entry_id: int) -> MemoEntryRead:
    """Reload an entry with comments selectinload-ed and serialise."""
    stmt = (
        select(MemoEntry)
        .where(MemoEntry.id == entry_id)
        .options(selectinload(MemoEntry.comments))
    )
    e = (await db.execute(stmt)).scalar_one()
    return MemoEntryRead.model_validate(e, from_attributes=True)


# ---------- read ------------------------------------------------------------


@router.get(
    "/concourses/{cid}/memo",
    response_model=MemoRead,
)
async def get_concourse_memo(
    cid: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> MemoRead:
    c = await db.get(Concourse, cid)
    if c is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Concourse not found")
    await _check_member(db, c.project_id, user, ProjectRole.viewer)
    return await MemoService.get_memo(
        db, parent_type=MemoParentType.concourse, parent_id=cid
    )


@router.get(
    "/studies/{sid}/memo",
    response_model=MemoRead,
)
async def get_study_memo(
    sid: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> MemoRead:
    s = await db.get(Study, sid)
    if s is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Study not found")
    await _check_member(db, s.project_id, user, ProjectRole.viewer)
    return await MemoService.get_memo(
        db, parent_type=MemoParentType.study, parent_id=sid
    )


@router.get("/memo/templates", response_model=list[MemoTemplate])
async def get_templates(
    parent_type: MemoParentTypeLiteral,
    user: User = Depends(get_current_user),
) -> list[MemoTemplate]:
    return MemoService.get_templates(MemoParentType(parent_type))


# ---------- entries (write) -------------------------------------------------


@router.post(
    "/concourses/{cid}/memo/entries",
    response_model=MemoEntryRead,
    status_code=status.HTTP_201_CREATED,
)
@limiter.limit("60/minute")
async def create_concourse_entry(
    request: Request,
    cid: int,
    payload: MemoEntryCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> MemoEntryRead:
    c = await db.get(Concourse, cid)
    if c is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Concourse not found")
    await _check_member(db, c.project_id, user, ProjectRole.researcher)
    e = await MemoService.add_entry(
        db,
        parent_type=MemoParentType.concourse,
        parent_id=cid,
        title=payload.title,
        body=payload.body,
        position=payload.position,
        user_id=user.id,
    )
    return await _reload_entry(db, e.id)


@router.post(
    "/studies/{sid}/memo/entries",
    response_model=MemoEntryRead,
    status_code=status.HTTP_201_CREATED,
)
@limiter.limit("60/minute")
async def create_study_entry(
    request: Request,
    sid: int,
    payload: MemoEntryCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> MemoEntryRead:
    s = await db.get(Study, sid)
    if s is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Study not found")
    await _check_member(db, s.project_id, user, ProjectRole.researcher)
    e = await MemoService.add_entry(
        db,
        parent_type=MemoParentType.study,
        parent_id=sid,
        title=payload.title,
        body=payload.body,
        position=payload.position,
        user_id=user.id,
    )
    return await _reload_entry(db, e.id)


@router.patch("/memo-entries/{eid}", response_model=MemoEntryRead)
@limiter.limit("60/minute")
async def update_entry(
    request: Request,
    eid: int,
    payload: MemoEntryUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> MemoEntryRead:
    _, project_id = await _resolve_entry_parent(db, eid)
    await _check_member(db, project_id, user, ProjectRole.researcher)
    await MemoService.update_entry(
        db,
        entry_id=eid,
        user_id=user.id,
        title=payload.title,
        body=payload.body,
        position=payload.position,
    )
    return await _reload_entry(db, eid)


@router.delete("/memo-entries/{eid}", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("60/minute")
async def delete_entry(
    request: Request,
    eid: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> None:
    _, project_id = await _resolve_entry_parent(db, eid)
    await _check_member(db, project_id, user, ProjectRole.researcher)
    await MemoService.delete_entry(db, entry_id=eid)


# ---------- comments --------------------------------------------------------


@router.post(
    "/memo-entries/{eid}/comments",
    response_model=MemoCommentRead,
    status_code=status.HTTP_201_CREATED,
)
@limiter.limit("30/minute")
async def post_comment(
    request: Request,
    eid: int,
    payload: MemoCommentCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> MemoCommentRead:
    _, project_id = await _resolve_entry_parent(db, eid)
    await _check_member(db, project_id, user, ProjectRole.viewer)
    await MemoService.validate_mentions(
        db, project_id=project_id, user_ids=payload.mentions
    )
    c = await MemoService.add_comment(
        db,
        entry_id=eid,
        user_id=user.id,
        body=payload.body,
        mentions=payload.mentions,
    )
    return MemoCommentRead.model_validate(c, from_attributes=True)


@router.patch("/memo-comments/{cid}", response_model=MemoCommentRead)
@limiter.limit("60/minute")
async def update_comment(
    request: Request,
    cid: int,
    payload: MemoCommentUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> MemoCommentRead:
    c = await MemoService.get_comment(db, comment_id=cid)
    _, project_id = await _resolve_entry_parent(db, c.entry_id)
    if c.user_id != user.id:
        await _check_member(db, project_id, user, ProjectRole.owner)  # moderation
    else:
        await _check_member(db, project_id, user, ProjectRole.viewer)
    updated = await MemoService.update_comment(db, comment_id=cid, body=payload.body)
    return MemoCommentRead.model_validate(updated, from_attributes=True)


@router.delete(
    "/memo-comments/{cid}",
    response_model=MemoCommentRead,
)
@limiter.limit("60/minute")
async def delete_comment(
    request: Request,
    cid: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> MemoCommentRead:
    c = await MemoService.get_comment(db, comment_id=cid)
    _, project_id = await _resolve_entry_parent(db, c.entry_id)
    if c.user_id != user.id:
        await _check_member(db, project_id, user, ProjectRole.owner)
    else:
        await _check_member(db, project_id, user, ProjectRole.viewer)
    soft = await MemoService.soft_delete_comment(db, comment_id=cid)
    return MemoCommentRead.model_validate(soft, from_attributes=True)


@router.post("/memo-comments/{cid}/resolve", response_model=MemoCommentRead)
@limiter.limit("60/minute")
async def resolve_comment(
    request: Request,
    cid: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> MemoCommentRead:
    c = await MemoService.get_comment(db, comment_id=cid)
    entry, project_id = await _resolve_entry_parent(db, c.entry_id)
    is_entry_author = entry.created_by == user.id
    if not is_entry_author:
        await _check_member(db, project_id, user, ProjectRole.owner)
    else:
        await _check_member(db, project_id, user, ProjectRole.researcher)
    resolved = await MemoService.resolve_comment(db, comment_id=cid, user_id=user.id)
    return MemoCommentRead.model_validate(resolved, from_attributes=True)


@router.post("/memo-comments/{cid}/unresolve", response_model=MemoCommentRead)
@limiter.limit("60/minute")
async def unresolve_comment(
    request: Request,
    cid: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> MemoCommentRead:
    c = await MemoService.get_comment(db, comment_id=cid)
    entry, project_id = await _resolve_entry_parent(db, c.entry_id)
    is_entry_author = entry.created_by == user.id
    if not is_entry_author:
        await _check_member(db, project_id, user, ProjectRole.owner)
    else:
        await _check_member(db, project_id, user, ProjectRole.researcher)
    unresolved = await MemoService.unresolve_comment(db, comment_id=cid)
    return MemoCommentRead.model_validate(unresolved, from_attributes=True)
