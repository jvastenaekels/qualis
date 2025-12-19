from fastapi import APIRouter, Depends, HTTPException, Request, Path, Query
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from sqlalchemy import select
from app.database import get_db
from app.models import Study, Participant, QSortEntry, ParticipantStatus, Statement
from app.schemas import SubmissionInput

router = APIRouter()

@router.post("/submit")
async def submit_study(data: SubmissionInput, request: Request, db: AsyncSession = Depends(get_db)):
    # Metadata
    ip_address = request.client.host if request.client else "unknown"
    # Confirmation code logic moved up (or re-generated if new, but session token is consistent)
    confirmation_code = str(data.session_token)[:8].upper()

    # 1. Find Study
    study_stmt = select(Study).where(Study.slug == data.study_slug).options(selectinload(Study.statements))
    study_result = await db.execute(study_stmt)
    study = study_result.scalar_one_or_none()
    if not study:
        raise HTTPException(status_code=404, detail="Study not found")

    # 2. Validation: Statement Ownership
    # Ensure all submitted statement IDs belong to this study
    valid_statement_ids = {s.id for s in study.statements}
    for entry in data.qsort:
        if entry.statement_id not in valid_statement_ids:
            raise HTTPException(
                status_code=400, 
                detail=f"Statement ID {entry.statement_id} does not belong to study '{data.study_slug}'"
            )

    # 3. Validation: Enforce Completeness
    if data.status == ParticipantStatus.completed:
        # Check if qsort entries match the total number of statements in the study
        # We need to count statements.
        stmt_count = len(study.statements)
        if len(data.qsort) != stmt_count:
             # Since duplicates are blocked in schema, len equality is enough.
             raise HTTPException(status_code=400, detail=f"Submission incomplete. Expected {stmt_count} cards, got {len(data.qsort)}.")

        # Check Column Capacities (Forced Distribution)
        # Group entries by grid_score
        from collections import Counter
        submission_counts = Counter(entry.grid_score for entry in data.qsort)
        
        # Normalize grid_config to a dict for easier comparison
        # study.grid_config can be a list of {"score": X, "capacity": Y} or dict {"score": capacity}
        target_dist = {}
        if isinstance(study.grid_config, list):
            for item in study.grid_config:
                if isinstance(item, dict) and "score" in item and "capacity" in item:
                    target_dist[int(item["score"])] = item["capacity"]
        elif isinstance(study.grid_config, dict):
            for score_str, capacity in study.grid_config.items():
                try:
                    target_dist[int(score_str)] = capacity
                except ValueError:
                    continue
        
        # Check against target_dist
        for score_val, capacity in target_dist.items():
            count = submission_counts.get(score_val, 0)
            
            # Strict enforcement for completed studies: Count must match capacity exactly
            if count != capacity:
                raise HTTPException(
                    status_code=400, 
                    detail=f"Column {score_val} has incorrect number of cards. Expected {capacity}, got {count}."
                )
            
            # Remove from counter to check for extra invalid scores later
            if score_val in submission_counts:
                del submission_counts[score_val]
        
        # If any entries remain in submission_counts, they are invalid scores (not in config)
        if submission_counts:
            invalid_scores = list(submission_counts.keys())
            raise HTTPException(status_code=400, detail=f"Submission contains invalid grid scores: {invalid_scores}")

    # 4. Find or Create Participant
    # We trust the session_token from the client for now, or ensure uniqueness
    participant = await db.execute(select(Participant).where(Participant.session_token == data.session_token))
    participant = participant.scalar_one_or_none()

    if not participant:
        # Create participant
        participant = Participant(
            study_id=study.id,
            session_token=data.session_token,
            language_used=data.language_used,
            presort_answers=data.presort_answers,
            postsort_answers=data.postsort_answers,
            status=data.status,
            confirmation_code=confirmation_code,
            ip_address=ip_address,
            submitted_at=datetime.now()
        )
        db.add(participant)
        await db.flush() # Get ID, don't commit yet
    else:
        # Update existing participant
        if participant.status == ParticipantStatus.completed:
             # Already completed, idempotent return
            confirmation_code = str(participant.session_token)[:8].upper()
            return {"status": "success", "confirmation_code": confirmation_code}

        participant.language_used = data.language_used
        participant.presort_answers = data.presort_answers
        participant.postsort_answers = data.postsort_answers
        participant.status = data.status 
        participant.confirmation_code = confirmation_code
        participant.ip_address = ip_address
        participant.submitted_at = datetime.now()
        
        await db.flush()
        
        # Delete existing Q-Sorts to replace them
        # We need to load them to delete, or use delete statement logic
        # For simplicity and ORM safety:
        stmt = select(Participant).where(Participant.id == participant.id).options(selectinload(Participant.qsort_entries))
        p_with_entries = await db.execute(stmt)
        participant = p_with_entries.scalar_one()

        if participant.qsort_entries:
            for entry in participant.qsort_entries:
                await db.delete(entry)
        
        await db.flush()

    # 5. Save Q-Sort Entries
    new_entries = []
    for entry in data.qsort:
        new_entries.append(QSortEntry(
            participant_id=participant.id,
            statement_id=entry.statement_id,
            grid_score=entry.grid_score,
            card_comment=entry.card_comment
        ))
    
    db.add_all(new_entries)
    
    # SINGLE ATOMIC COMMIT
    await db.commit()

    return {"status": "success", "confirmation_code": confirmation_code}

@router.get("/study/{slug}")
async def get_study(
    slug: str = Path(..., pattern="^[a-z0-9-]+$", min_length=3, max_length=100),
    lang: str = Query("en", pattern="^[a-z]{2}(-[A-Z]{2})?$", max_length=5),
    db: AsyncSession = Depends(get_db)
):
    # Fetch study with all necessary relations
    # We need: grid_config, presort_config, postsort_config, statements
    # AND translations for the current language (handling this in backend or sending all?)
    # Sending all translations is easier for now, frontend selects.
    
    # Eager load relationships
    stmt = select(Study).where(Study.slug == slug) \
        .options(selectinload(Study.translations)) \
        .options(selectinload(Study.statements).selectinload(Statement.translations))
        
    study = await db.execute(stmt)
    study = study.scalar_one_or_none()

    if not study:
         # Fallback to defaults or 404
         raise HTTPException(status_code=404, detail="Study not found")

    # Transform to Frontend Config Format
    # Logic:
    # 1. Determine language (default 'en' for now, or accept query param)
    # 2. Extract title/desc/instr from translations
    # 3. Extract statements
    
    # For now, let's return a structured object the frontend can use directly.
    # We default to English for the main fields if found, else first available.
    
    # Priority: Requested Lang -> Default (Study) -> English -> First Available
    # 1. Requested
    translation = next((t for t in study.translations if t.language_code == lang), None)
    
    # 2. Default (Study)
    if not translation and study.default_language:
        translation = next((t for t in study.translations if t.language_code == study.default_language), None)

    # 3. English
    if not translation:
        translation = next((t for t in study.translations if t.language_code == "en"), None)
    
    # 4. First Available
    if not translation and study.translations:
        translation = study.translations[0]
        
    resolved_lang = translation.language_code if translation else "en"

    title = translation.title if (translation and hasattr(translation, 'title')) else study.slug
    description = translation.description if (translation and hasattr(translation, 'description')) else ""
    instructions = translation.instructions if (translation and hasattr(translation, 'instructions')) else ""
    
    statements_data = []
    for s in study.statements:
        # Same Logic for Statements
        s_trans = next((t for t in s.translations if t.language_code == resolved_lang), None)
        
        # If specific statement translation missing, allow fallback to English
        if not s_trans:
             s_trans = next((t for t in s.translations if t.language_code == "en"), None)

        if not s_trans and s.translations:
             s_trans = s.translations[0]
             
        text = s_trans.text if s_trans else s.code
        statements_data.append({"id": s.id, "text": text})


    # Transform grid_config from dict {"-4": 2} or list [{"score": -4, "capacity": 2}] to list [{"score": -4, "capacity": 2}]
    grid_config_list = []
    if study.grid_config:
        if isinstance(study.grid_config, list):
            for item in study.grid_config:
                if isinstance(item, dict) and "score" in item and "capacity" in item:
                    grid_config_list.append({"score": int(item["score"]), "capacity": item["capacity"]})
        elif isinstance(study.grid_config, dict):
            for score_str, capacity in study.grid_config.items():
                try:
                    grid_config_list.append({"score": int(score_str), "capacity": capacity})
                except ValueError:
                    pass
        
        # Sort by score
        grid_config_list.sort(key=lambda x: x["score"])

    return {
        "slug": study.slug,
        "title": title,
        "description": description,
        "instructions": instructions,
        "presort_config": study.presort_config,
        "grid_config": grid_config_list, 
        "statements": statements_data,
        "consent": {
            "title": getattr(translation, "consent_title", None),
            "description": getattr(translation, "consent_description", None),
            "accept": getattr(translation, "consent_accept", None),
            "decline": getattr(translation, "consent_decline", None)
        },
        "available_languages": [t.language_code for t in study.translations],
        "language": resolved_lang
    }
