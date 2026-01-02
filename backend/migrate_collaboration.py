"""Migration script for study collaboration.

This script migrates Study.owner_id and WorkspaceMember data into the 
new StudyCollaborator table.
"""

import asyncio
import logging
from sqlalchemy import select
from app.database import SessionLocal
from app.models import Study, StudyCollaborator, StudyRole, WorkspaceMember

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Map WorkspaceRole to StudyRole
ROLE_MAP = {
    "admin": StudyRole.owner,
    "researcher": StudyRole.editor,
    "viewer": StudyRole.viewer,
}


async def migrate():
    async with SessionLocal() as db:
        logger.info("Starting migration...")

        # 1. Migrate WorkspaceMember to StudyCollaborator
        members_result = await db.execute(select(WorkspaceMember))
        members = members_result.scalars().all()
        
        member_migrated_count = 0
        for member in members:
            # Find all studies in this workspace
            studies_in_ws_result = await db.execute(
                select(Study).where(Study.workspace_id == member.workspace_id)
            )
            studies_in_ws = studies_in_ws_result.scalars().all()
            
            for study in studies_in_ws:
                # Check if collaborator already exists
                existing = await db.execute(
                    select(StudyCollaborator).where(
                        StudyCollaborator.study_id == study.id,
                        StudyCollaborator.user_id == member.user_id
                    )
                )
                if not existing.scalar_one_or_none():
                    collab = StudyCollaborator(
                        study_id=study.id,
                        user_id=member.user_id,
                        role=ROLE_MAP.get(member.role, StudyRole.viewer)
                    )
                    db.add(collab)
                    member_migrated_count += 1
        
        logger.info(f"Migrated {member_migrated_count} workspace memberships to study collaborators.")

        await db.commit()
        logger.info("Migration completed successfully.")

if __name__ == "__main__":
    asyncio.run(migrate())
