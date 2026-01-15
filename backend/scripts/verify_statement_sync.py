import asyncio
from httpx import ASGITransport, AsyncClient
from app.main import app
from app.models import (
    Study,
    StudyState,
    User,
    Workspace,
    WorkspaceMember,
    WorkspaceRole,
)
from app.database import SessionLocal
from app.utils.security import get_password_hash, create_access_token
from sqlalchemy import delete
from datetime import timedelta


async def test_statement_sync():
    async with SessionLocal() as db:
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            # 1. Setup
            user_email = "test_sync_v3@example.com"
            await db.execute(delete(User).where(User.email == user_email))
            await db.commit()

            user = User(
                email=user_email,
                hashed_password=get_password_hash("test"),
                is_active=True,
            )
            db.add(user)
            await db.flush()

            ws_slug = "sync-ws-v3"
            await db.execute(delete(Workspace).where(Workspace.slug == ws_slug))
            await db.commit()

            ws = Workspace(title="Sync WS", slug=ws_slug)
            db.add(ws)
            await db.flush()

            wsm = WorkspaceMember(
                workspace_id=ws.id, user_id=user.id, role=WorkspaceRole.owner
            )
            db.add(wsm)

            study = Study(
                slug="sync-study-v3",
                workspace_id=ws.id,
                state=StudyState.draft,
                grid_config=[{"score": 0, "capacity": 2}],
                presort_config={},
                postsort_config={},
            )
            db.add(study)
            await db.flush()

            from app.models import StudyTranslation, Statement, StatementTranslation

            db.add(
                StudyTranslation(
                    study_id=study.id,
                    language_code="en",
                    title="Sync Study",
                    description="Sync Desc",
                    instructions="",
                    ui_labels={},
                    process_steps=[],
                    methodology_tips=[],
                    step_help={},
                )
            )
            s1 = Statement(study_id=study.id, code="S1")
            db.add(s1)
            await db.flush()
            db.add(
                StatementTranslation(
                    statement_id=s1.id, language_code="en", text="Statement 1"
                )
            )
            await db.commit()

            # Auth
            token = create_access_token(
                subject=user.email, expires_delta=timedelta(minutes=30)
            )
            headers = {"Authorization": f"Bearer {token}", "X-Workspace-ID": str(ws.id)}

            print("\n--- Phase 1: Add and Update ---")
            update_payload = {
                "statements": [
                    {
                        "code": "S1",
                        "translations": [
                            {"language_code": "en", "text": "Statement 1 Updated"}
                        ],
                    },
                    {
                        "code": "S2",
                        "translations": [
                            {"language_code": "en", "text": "Statement 2 New"}
                        ],
                    },
                ]
            }
            resp = await client.patch(
                f"/api/admin/studies/{study.slug}", json=update_payload, headers=headers
            )
            assert resp.status_code == 200
            data = resp.json()
            assert len(data["statements"]) == 2

            print("\n--- Phase 2: Remove S1 ---")
            update_payload = {
                "statements": [
                    {
                        "code": "S2",
                        "translations": [
                            {"language_code": "en", "text": "Statement 2 New"}
                        ],
                    }
                ]
            }
            resp = await client.patch(
                f"/api/admin/studies/{study.slug}", json=update_payload, headers=headers
            )
            assert resp.status_code == 200
            data = resp.json()
            assert len(data["statements"]) == 1
            assert data["statements"][0]["code"] == "S2"

            print("\n--- Phase 3: Verify Persistence ---")
            db.expire_all()
            from app.services.study_service import StudyService

            persisted_study = await StudyService.get_study_by_slug(db, study.slug)
            assert len(persisted_study.statements) == 1
            assert persisted_study.statements[0].code == "S2"

            # Cleanup
            await db.execute(delete(User).where(User.id == user.id))
            await db.execute(delete(Workspace).where(Workspace.id == ws.id))
            await db.commit()


if __name__ == "__main__":
    asyncio.run(test_statement_sync())
