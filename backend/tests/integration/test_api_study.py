import pytest
from sqlalchemy import delete, select
from sqlalchemy.orm import selectinload
from app.models import Study, StudyTranslation, User, StudyState, Statement, StatementTranslation

# 1. Get Study Config
@pytest.mark.asyncio
async def test_get_study_config(client, seed_study):
    response = await client.get(f"/api/study/{seed_study.slug}")
    assert response.status_code == 200
    data = response.json()
    assert data["slug"] == seed_study.slug
    assert data["title"] == "Test Study"
    assert len(data["statements"]) == 4
    # Check default lang is en (from fixture)
    assert data["consent"]["title"] == "Consent"
    assert data["show_statement_codes"] is False # Default from fixture
    assert data["default_language"] is None # Default from fixture

@pytest.mark.asyncio
async def test_get_study_not_found(client, db):
    response = await client.get("/api/study/non-existent-slug")
    assert response.status_code == 404

@pytest.mark.asyncio
async def test_language_resolution_cascade(client, db):
    """
    Priority: Requested Lang -> Default (Study) -> English -> First Available
    """
    # Setup: Study with multiple languages
    owner = User(email="lang@test.com", hashed_password="pw")
    db.add(owner)
    await db.flush()
    
    study = Study(
        slug="lang-study", 
        owner_id=owner.id, 
        state=StudyState.active,
        default_language="fr", # STUDY DEFAULT IS FR
        grid_config=[], presort_config={}, postsort_config={}
    )
    db.add(study)
    await db.flush()
    slug = study.slug
    
    # Adds EN, FR, FI translations
    trans_en = StudyTranslation(study_id=study.id, language_code="en", title="Title EN", description="", instructions="")
    trans_fr = StudyTranslation(study_id=study.id, language_code="fr", title="Title FR", description="", instructions="")
    trans_fi = StudyTranslation(study_id=study.id, language_code="fi", title="Title FI", description="", instructions="")
    db.add_all([trans_en, trans_fr, trans_fi])
    await db.commit()
    
    # Case 1: Requested Lang (FI)
    response = await client.get(f"/api/study/{slug}?lang=fi")
    assert response.json()["title"] == "Title FI"
    
    # Case 2: No request lang. Router defaults to 'en' in Query.
    response = await client.get(f"/api/study/{slug}") 
    assert response.json()["title"] == "Title EN"
    
    # Case 3: Study Default (FR) - If we remove EN translation
    await db.execute(delete(StudyTranslation).where(StudyTranslation.language_code == "en"))
    await db.commit()
    db.expire_all()
    
    response = await client.get(f"/api/study/{slug}")
    assert response.json()["title"] == "Title FR"
    
    # Case 4: English Fallback
    study.default_language = None
    trans_en = StudyTranslation(study_id=study.id, language_code="en", title="Title EN", description="", instructions="")
    db.add(trans_en)
    await db.commit()
    db.expire_all()
    
    response = await client.get(f"/api/study/{slug}")
    assert response.json()["title"] == "Title EN"
    
    # Case 5: First Available
    await db.execute(delete(StudyTranslation).where(StudyTranslation.language_code == "en"))
    study.default_language = None
    await db.commit()
    db.expire_all()
    
    response = await client.get(f"/api/study/{slug}")
    assert response.json()["title"] in ["Title FR", "Title FI"]

@pytest.mark.asyncio
async def test_get_study_optional_fields_and_statement_fallbacks(client, db):
    owner = User(email="opts@test.com", hashed_password="pw")
    db.add(owner)
    await db.flush()
    
    study = Study(
        slug="opts-study", 
        owner_id=owner.id, 
        state=StudyState.active,
        grid_config=[], presort_config={}, postsort_config={}
    )
    db.add(study)
    await db.flush()
    
    trans_fi = StudyTranslation(
        study_id=study.id, 
        language_code="fi", 
        title="Title FI", 
        subtitle="Subtitle FI",
        objective="Objective FI",
        description="Desc FI",
        instructions="Instr FI"
    )
    db.add(trans_fi)
    
    s1 = Statement(study_id=study.id, code="S1")
    db.add(s1)
    await db.flush()
    
    # S1 has translation in EN only
    st1_en = StatementTranslation(statement_id=s1.id, language_code="en", text="Text EN")
    db.add(st1_en)
    
    await db.commit()
    
    # Request FI
    response = await client.get(f"/api/study/{study.slug}?lang=fi")
    assert response.status_code == 200
    data = response.json()
    assert data["subtitle"] == "Subtitle FI"
    assert data["objective"] == "Objective FI"
    assert data["instructions"] == "Instr FI"
    
    # Statement fallback to EN
    assert data["statements"][0]["text"] == "Text EN"

@pytest.mark.asyncio
async def test_get_study_show_statement_codes(client, db):
    owner = User(email="codes@test.com", hashed_password="pw")
    db.add(owner)
    await db.flush()
    
    study = Study(
        slug="codes-study", 
        owner_id=owner.id, 
        state=StudyState.active,
        show_statement_codes=True,
        grid_config=[], presort_config={}, postsort_config={}
    )
    db.add(study)
    await db.commit()
    
    response = await client.get(f"/api/study/{study.slug}")
    assert response.json()["show_statement_codes"] is True
