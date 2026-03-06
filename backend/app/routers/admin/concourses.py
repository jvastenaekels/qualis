"""Admin routes for concourse management."""

import logging

from fastapi import APIRouter, Depends, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import (
    PaginationParams,
    get_current_user,
    get_current_workspace,
    require_workspace_role,
)
from app.limiter import limiter
from app.models import User, Workspace, WorkspaceMember, WorkspaceRole
from app.schemas.common import PaginatedResponse
from app.schemas.concourses import (
    ConcourseCreate,
    ConcourseDetailRead,
    ConcourseItemBulkCreate,
    ConcourseItemBulkImport,
    ConcourseItemCommentCreate,
    ConcourseItemCommentRead,
    ConcourseItemCreate,
    ConcourseItemRead,
    ConcourseItemUpdate,
    ConcourseItemVersionRead,
    ConcourseRead,
    ConcourseTagCreate,
    ConcourseTagRead,
    ConcourseUpdate,
)
from app.services.concourse_service import ConcourseService

router = APIRouter()
logger = logging.getLogger(__name__)


# ------------------------------------------------------------------
# Tags (must be registered before /{concourse_id} to avoid path conflicts)
# ------------------------------------------------------------------


@router.get("/tags", response_model=list[ConcourseTagRead])
async def list_tags(
    workspace_ctx: tuple[Workspace, WorkspaceMember] = Depends(get_current_workspace),
    db: AsyncSession = Depends(get_db),
):
    workspace, _ = workspace_ctx
    return await ConcourseService.list_tags(db, workspace.id)


@router.post(
    "/tags",
    response_model=ConcourseTagRead,
    status_code=status.HTTP_201_CREATED,
)
@limiter.limit("30/minute")
async def create_tag(
    request: Request,
    data: ConcourseTagCreate,
    workspace_ctx: tuple[Workspace, WorkspaceMember] = Depends(
        require_workspace_role(WorkspaceRole.researcher)
    ),
    db: AsyncSession = Depends(get_db),
):
    workspace, _ = workspace_ctx
    return await ConcourseService.create_tag(db, workspace.id, data)


@router.delete("/tags/{tag_id}", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("30/minute")
async def delete_tag(
    request: Request,
    tag_id: int,
    workspace_ctx: tuple[Workspace, WorkspaceMember] = Depends(
        require_workspace_role(WorkspaceRole.researcher)
    ),
    db: AsyncSession = Depends(get_db),
):
    workspace, _ = workspace_ctx
    await ConcourseService.delete_tag(db, workspace.id, tag_id)
    return None


# ------------------------------------------------------------------
# Concourse CRUD
# ------------------------------------------------------------------


@router.post("", response_model=ConcourseRead, status_code=status.HTTP_201_CREATED)
@limiter.limit("30/minute")
async def create_concourse(
    request: Request,
    data: ConcourseCreate,
    workspace_ctx: tuple[Workspace, WorkspaceMember] = Depends(
        require_workspace_role(WorkspaceRole.researcher)
    ),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ConcourseRead:
    workspace, _ = workspace_ctx
    concourse = await ConcourseService.create_concourse(
        db, workspace.id, data, current_user.id
    )
    return ConcourseRead(
        id=concourse.id,
        workspace_id=concourse.workspace_id,
        title=concourse.title,
        description=concourse.description,
        item_count=0,
        created_by=concourse.created_by,
        created_at=concourse.created_at,
        updated_at=concourse.updated_at,
    )


@router.get("", response_model=PaginatedResponse[ConcourseRead])
async def list_concourses(
    workspace_ctx: tuple[Workspace, WorkspaceMember] = Depends(get_current_workspace),
    db: AsyncSession = Depends(get_db),
    pagination: PaginationParams = Depends(),
):
    workspace, _ = workspace_ctx
    concourses, total = await ConcourseService.list_concourses(
        db, workspace.id, pagination.limit, pagination.offset
    )
    items = [
        ConcourseRead(
            id=c.id,
            workspace_id=c.workspace_id,
            title=c.title,
            description=c.description,
            item_count=getattr(c, "item_count", 0),
            created_by=c.created_by,
            created_at=c.created_at,
            updated_at=c.updated_at,
        )
        for c in concourses
    ]
    return PaginatedResponse(
        items=items, total=total, limit=pagination.limit, offset=pagination.offset
    )


@router.get("/{concourse_id}", response_model=ConcourseDetailRead)
async def get_concourse(
    concourse_id: int,
    workspace_ctx: tuple[Workspace, WorkspaceMember] = Depends(get_current_workspace),
    db: AsyncSession = Depends(get_db),
):
    workspace, _ = workspace_ctx
    concourse = await ConcourseService.get_concourse(db, concourse_id)
    # Verify workspace ownership
    if concourse.workspace_id != workspace.id:
        from fastapi import HTTPException

        raise HTTPException(status_code=404, detail="Concourse not found")
    # Attach comment counts
    if concourse.items:
        item_ids = [item.id for item in concourse.items]
        counts = await ConcourseService.get_comment_counts(db, item_ids)
        for item in concourse.items:
            item.comment_count = counts.get(item.id, 0)  # type: ignore[attr-defined]
    return concourse


@router.patch("/{concourse_id}", response_model=ConcourseRead)
@limiter.limit("30/minute")
async def update_concourse(
    request: Request,
    concourse_id: int,
    data: ConcourseUpdate,
    workspace_ctx: tuple[Workspace, WorkspaceMember] = Depends(
        require_workspace_role(WorkspaceRole.researcher)
    ),
    db: AsyncSession = Depends(get_db),
):
    workspace, _ = workspace_ctx
    return await ConcourseService.update_concourse(db, workspace.id, concourse_id, data)


@router.delete("/{concourse_id}", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("30/minute")
async def delete_concourse(
    request: Request,
    concourse_id: int,
    workspace_ctx: tuple[Workspace, WorkspaceMember] = Depends(
        require_workspace_role(WorkspaceRole.owner)
    ),
    db: AsyncSession = Depends(get_db),
):
    workspace, _ = workspace_ctx
    concourse = await ConcourseService.get_concourse(db, concourse_id)
    if concourse.workspace_id != workspace.id:
        from fastapi import HTTPException

        raise HTTPException(status_code=404, detail="Concourse not found")
    await ConcourseService.delete_concourse(db, concourse_id)
    return None


# ------------------------------------------------------------------
# Item CRUD
# ------------------------------------------------------------------


@router.post(
    "/{concourse_id}/items",
    response_model=ConcourseItemRead,
    status_code=status.HTTP_201_CREATED,
)
@limiter.limit("60/minute")
async def create_item(
    request: Request,
    concourse_id: int,
    data: ConcourseItemCreate,
    workspace_ctx: tuple[Workspace, WorkspaceMember] = Depends(
        require_workspace_role(WorkspaceRole.researcher)
    ),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    workspace, _ = workspace_ctx
    await ConcourseService._verify_concourse_ownership(db, concourse_id, workspace.id)
    return await ConcourseService.create_item(db, concourse_id, data, current_user.id)


@router.post(
    "/{concourse_id}/items/bulk",
    response_model=list[ConcourseItemRead],
    status_code=status.HTTP_201_CREATED,
)
@limiter.limit("10/minute")
async def bulk_create_items(
    request: Request,
    concourse_id: int,
    data: ConcourseItemBulkCreate,
    workspace_ctx: tuple[Workspace, WorkspaceMember] = Depends(
        require_workspace_role(WorkspaceRole.researcher)
    ),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    workspace, _ = workspace_ctx
    await ConcourseService._verify_concourse_ownership(db, concourse_id, workspace.id)
    return await ConcourseService.bulk_create_items(
        db, concourse_id, data, current_user.id
    )


@router.post(
    "/{concourse_id}/items/import",
    response_model=list[ConcourseItemRead],
    status_code=status.HTTP_201_CREATED,
)
@limiter.limit("10/minute")
async def import_items_from_text(
    request: Request,
    concourse_id: int,
    data: ConcourseItemBulkImport,
    workspace_ctx: tuple[Workspace, WorkspaceMember] = Depends(
        require_workspace_role(WorkspaceRole.researcher)
    ),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    workspace, _ = workspace_ctx
    await ConcourseService._verify_concourse_ownership(db, concourse_id, workspace.id)
    return await ConcourseService.bulk_import_text(
        db, concourse_id, data, current_user.id
    )


@router.patch(
    "/{concourse_id}/items/{item_id}",
    response_model=ConcourseItemRead,
)
@limiter.limit("60/minute")
async def update_item(
    request: Request,
    concourse_id: int,
    item_id: int,
    data: ConcourseItemUpdate,
    workspace_ctx: tuple[Workspace, WorkspaceMember] = Depends(
        require_workspace_role(WorkspaceRole.researcher)
    ),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    workspace, _ = workspace_ctx
    await ConcourseService._verify_concourse_ownership(db, concourse_id, workspace.id)
    return await ConcourseService.update_item(
        db, concourse_id, item_id, data, user_id=current_user.id
    )


@router.delete(
    "/{concourse_id}/items/{item_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
@limiter.limit("60/minute")
async def delete_item(
    request: Request,
    concourse_id: int,
    item_id: int,
    workspace_ctx: tuple[Workspace, WorkspaceMember] = Depends(
        require_workspace_role(WorkspaceRole.researcher)
    ),
    db: AsyncSession = Depends(get_db),
):
    workspace, _ = workspace_ctx
    await ConcourseService._verify_concourse_ownership(db, concourse_id, workspace.id)
    await ConcourseService.delete_item(db, concourse_id, item_id)
    return None


# ------------------------------------------------------------------
# Item Versions & Comments
# ------------------------------------------------------------------


@router.get(
    "/{concourse_id}/items/{item_id}/versions",
    response_model=list[ConcourseItemVersionRead],
)
async def list_item_versions(
    concourse_id: int,
    item_id: int,
    workspace_ctx: tuple[Workspace, WorkspaceMember] = Depends(get_current_workspace),
    db: AsyncSession = Depends(get_db),
    pagination: PaginationParams = Depends(),
):
    workspace, _ = workspace_ctx
    await ConcourseService._verify_concourse_ownership(db, concourse_id, workspace.id)
    await ConcourseService._verify_item_ownership(db, item_id, concourse_id)
    return await ConcourseService.list_item_versions(
        db, item_id, pagination.limit, pagination.offset
    )


@router.get(
    "/{concourse_id}/items/{item_id}/comments",
    response_model=list[ConcourseItemCommentRead],
)
async def list_item_comments(
    concourse_id: int,
    item_id: int,
    workspace_ctx: tuple[Workspace, WorkspaceMember] = Depends(get_current_workspace),
    db: AsyncSession = Depends(get_db),
    pagination: PaginationParams = Depends(),
):
    workspace, _ = workspace_ctx
    await ConcourseService._verify_concourse_ownership(db, concourse_id, workspace.id)
    await ConcourseService._verify_item_ownership(db, item_id, concourse_id)
    return await ConcourseService.list_item_comments(
        db, item_id, pagination.limit, pagination.offset
    )


@router.post(
    "/{concourse_id}/items/{item_id}/comments",
    response_model=ConcourseItemCommentRead,
    status_code=status.HTTP_201_CREATED,
)
@limiter.limit("30/minute")
async def create_item_comment(
    request: Request,
    concourse_id: int,
    item_id: int,
    data: ConcourseItemCommentCreate,
    workspace_ctx: tuple[Workspace, WorkspaceMember] = Depends(
        require_workspace_role(WorkspaceRole.researcher)
    ),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    workspace, _ = workspace_ctx
    await ConcourseService._verify_concourse_ownership(db, concourse_id, workspace.id)
    await ConcourseService._verify_item_ownership(db, item_id, concourse_id)
    return await ConcourseService.create_item_comment(
        db, item_id, current_user.id, data.body
    )
