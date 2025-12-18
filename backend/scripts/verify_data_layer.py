import sys
import os
# Add parent directory to path to allow importing app
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import asyncio
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from sqlalchemy.exc import IntegrityError
from app.database import engine, Base, SessionLocal
from app.models import User, Study, StudyTranslation, Statement, StatementTranslation, Participant, QSortEntry, StudyState

async def reset_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
    print("--- Database Reset Complete ---")

async def test_workflow():
    async with SessionLocal() as session:
        # 1. Create Owner
        owner = User(email="admin@example.com", hashed_password="hashed_secret", is_active=True)
        session.add(owner)
        await session.commit()
        print("1. User created.")

        # 2. Create Study
        study = Study(
            slug="complex-study",
            owner_id=owner.id,
            state=StudyState.active,
            grid_config={"-2": 1, "-1": 2, "0": 3, "1": 2, "2": 1},
            presort_config={"age": "number"},
            postsort_config={"comment": True}
        )
        session.add(study)
        await session.commit()
        await session.refresh(study)
        print(f"2. Study created (ID: {study.id}).")

        # 3. Add Translations (En, Fr)
        t_en = StudyTranslation(study_id=study.id, language_code="en", title="My Study", description="Desc", instructions="Instr")
        t_fr = StudyTranslation(study_id=study.id, language_code="fr", title="Mon Étude", description="Desc", instructions="Instr")
        session.add_all([t_en, t_fr])
        await session.commit()
        print("3. Study Translations added.")

        # 4. Verify Translation Uniqueness Constraint (Should Fail)
        try:
            t_fail = StudyTranslation(study_id=study.id, language_code="en", title="Dup", description="D", instructions="I")
            session.add(t_fail)
            await session.commit()
        except IntegrityError:
            print("4. Constraint Verified: Cannot duplicate StudyTranslation for same language.")
            await session.rollback()
            await session.refresh(study) # Refresh after rollback


        # 5. Add Statements
        stmt1 = Statement(study_id=study.id, code="S1")
        stmt2 = Statement(study_id=study.id, code="S2")
        session.add_all([stmt1, stmt2])
        await session.commit()
        
        # Add Translations for Statements
        st_t1 = StatementTranslation(statement_id=stmt1.id, language_code="en", text="I like coding.")
        st_t2 = StatementTranslation(statement_id=stmt2.id, language_code="en", text="I like testing.")
        session.add_all([st_t1, st_t2])
        await session.commit()
        print("5. Statements and translations added.")

        # 6. Create Participant
        participant = Participant(study_id=study.id, language_used="en", presort_answers={"age": 25})
        session.add(participant)
        await session.commit()
        print(f"6. Participant created (Token: {participant.session_token}).")

        # 7. Submit Q-Sort
        q1 = QSortEntry(participant_id=participant.id, statement_id=stmt1.id, grid_score=2, card_comment="Love it")
        q2 = QSortEntry(participant_id=participant.id, statement_id=stmt2.id, grid_score=-1)
        session.add_all([q1, q2])
        await session.commit()
        print("7. Q-Sort submitted.")

        # 8. Verify Q-Sort Uniqueness (Same card twice)
        try:
            q_fail = QSortEntry(participant_id=participant.id, statement_id=stmt1.id, grid_score=0)
            session.add(q_fail)
            await session.commit()
        except IntegrityError:
            print("8. Constraint Verified: Participant cannot sort same statement twice.")
            await session.rollback()
            await session.refresh(study)
            await session.refresh(participant)


        # 9. Verify Cascade Delete
        # Deleting Study should delete translations, statements, participants, and q-sorts.
        await session.delete(study)
        await session.commit()
        
        # Check if participant is gone
        result = await session.execute(select(Participant).where(Participant.id == participant.id))
        if result.scalar() is None:
             print("9. Cascade Verified: Deleting Study removed dependent Participant.")
        else:
             print("9. FAILED: Participant still exists.")

if __name__ == "__main__":
    asyncio.run(reset_db())
    asyncio.run(test_workflow())
