"""The two authorisation helpers that replace hand-rolled checks in routers.

Before this change the rule "member at or above role X" existed in three
shapes: the dependency factories in app.dependencies, a private
``_check_member`` in routers/admin/memos.py (twenty call sites), and
``ProjectMember.role.in_([owner, member])`` literals in query filters.
Adding a project role would have meant finding every literal by hand.
Both helpers here derive from PROJECT_ROLE_HIERARCHY / ROLE_MAP, the
same tables the dependency factories use.
"""

from __future__ import annotations

import pytest
from fastapi import HTTPException

from app.dependencies import (
    assert_project_role,
    project_roles_satisfying,
)
from app.models import ProjectMember, ProjectRole, StudyRole


def test_project_roles_satisfying_editor_is_owner_and_member() -> None:
    assert set(project_roles_satisfying(StudyRole.editor)) == {
        ProjectRole.owner,
        ProjectRole.member,
    }


def test_project_roles_satisfying_viewer_is_every_role() -> None:
    assert set(project_roles_satisfying(StudyRole.viewer)) == set(ProjectRole)


def test_project_roles_satisfying_owner_is_owner_only() -> None:
    assert list(project_roles_satisfying(StudyRole.owner)) == [ProjectRole.owner]


@pytest.mark.asyncio
async def test_assert_project_role_404_for_non_member(
    db, test_user, test_project
) -> None:
    from app.models import User
    from app.utils.security import get_password_hash

    outsider = User(
        email="outsider@example.org", hashed_password=get_password_hash("x" * 12)
    )
    db.add(outsider)
    await db.commit()

    with pytest.raises(HTTPException) as exc:
        await assert_project_role(db, test_project.id, outsider, ProjectRole.viewer)
    assert exc.value.status_code == 404


@pytest.mark.asyncio
async def test_assert_project_role_403_below_required(
    db, test_project, user_factory
) -> None:
    viewer = await user_factory()
    db.add(
        ProjectMember(
            project_id=test_project.id, user_id=viewer.id, role=ProjectRole.viewer
        )
    )
    await db.commit()

    with pytest.raises(HTTPException) as exc:
        await assert_project_role(db, test_project.id, viewer, ProjectRole.member)
    assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_assert_project_role_returns_membership_at_or_above(
    db, test_user, test_project
) -> None:
    # test_project makes test_user its owner.
    member = await assert_project_role(
        db, test_project.id, test_user, ProjectRole.member
    )
    assert member.role == ProjectRole.owner


def test_delete_study_declares_superuser_in_its_signature() -> None:
    """Static guard (wave-5 style): the handler's dependency list must say
    what the policy is. It used to declare owner access and then demand
    is_superuser in the body, so the signature lied to every reader."""
    import inspect

    from app.routers.admin import studies as studies_module

    src = inspect.getsource(studies_module)
    idx = src.find("async def delete_study(")
    assert idx != -1
    signature = src[idx : src.find(")", idx + 300) + 1]
    assert "Depends(check_superuser)" in signature, signature
    body = src[idx : idx + 1200]
    assert "if not current_user.is_superuser" not in body


def test_no_router_spells_out_project_role_lists() -> None:
    """Query filters derive the accepted roles from the hierarchy."""
    from pathlib import Path

    routers = Path(__file__).resolve().parents[2] / "app" / "routers"
    offenders = [
        str(f.relative_to(routers))
        for f in routers.rglob("*.py")
        if "role.in_([ProjectRole." in f.read_text(encoding="utf-8")
    ]
    assert offenders == []


def test_memos_router_uses_the_shared_assertion() -> None:
    from pathlib import Path

    src = (
        Path(__file__).resolve().parents[2] / "app" / "routers" / "admin" / "memos.py"
    ).read_text(encoding="utf-8")
    assert "def _check_member" not in src
    assert "assert_project_role" in src
