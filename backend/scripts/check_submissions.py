import sys
import os
# Add parent directory to path to allow importing app
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import asyncio
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from app.database import SessionLocal
from app.models import Participant, Study, QSortEntry

async def check_submissions():
    async with SessionLocal() as session:
        # Fetch participants with related data
        stmt = select(Participant).options(
            selectinload(Participant.study),
            selectinload(Participant.qsort_entries)
        ).order_by(Participant.id.desc())
        
        result = await session.execute(stmt)
        participants = result.scalars().all()

        print(f"\n--- Found {len(participants)} Participants ---")
        
        for p in participants:
            print(f"\nParticipant ID: {p.id}")
            print(f"Session Token: {p.session_token}")
            print(f"Study: {p.study.slug if p.study else 'Unknown'}")
            print(f"Status: {p.status}")
            print(f"Confirmation Code: {p.confirmation_code}")
            print(f"IP Address: {p.ip_address}")
            print(f"Submitted At: {p.submitted_at}")
            print(f"Language: {p.language_used}")
            print(f"Q-Sort Entries: {len(p.qsort_entries)}")
            print(f"Pre-Sort Answers: {p.presort_answers}")
            print(f"Post-Sort Answers: {p.postsort_answers}")
            
            if p.qsort_entries:
                print("  Sample Entries:")
                for entry in p.qsort_entries[:5]: # Show first 5
                    print(f"    - Statement {entry.statement_id}: Score {entry.grid_score} (Comment: {entry.card_comment})")
        print("\n--------------------------------")

if __name__ == "__main__":
    asyncio.run(check_submissions())
