# Open-Q - Open-source platform for conducting Q-methodology research
# Copyright (C) 2025 Julien Vastenekels
# Licensed under the GNU Affero General Public License v3.0 or later.


import pytest
import uuid
from app.models import ParticipantStatus

# 1. Main / Health Check
@pytest.mark.asyncio
async def test_health_check(client):
    response = await client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}

# 2. Get Study Config
@pytest.mark.asyncio
async def test_get_study_config(client, seed_study):
    response = await client.get(f"/api/study/{seed_study.slug}")
    assert response.status_code == 200
    data = response.json()
    assert data["slug"] == seed_study.slug
    assert data["title"] == "Test Study"
    assert len(data["statements"]) == 4
    # Check default lang is en
    assert data["consent"]["title"] == "Consent"

@pytest.mark.asyncio
async def test_get_study_not_found(client, db):
    response = await client.get("/api/study/non-existent-slug")
    assert response.status_code == 404

# 3. Submissions
@pytest.mark.asyncio
async def test_submit_valid_completed(client, seed_study):
    """
    Grid Config from seed:
    -1: 1 card
     0: 2 cards
     1: 1 card
    Total 4 cards (S1-S4)
    """
    statements = seed_study.statements
    # Map statement IDs to scores to match config
    qsort = [
        {"statement_id": statements[0].id, "grid_score": -1},
        {"statement_id": statements[1].id, "grid_score": 0},
        {"statement_id": statements[2].id, "grid_score": 0},
        {"statement_id": statements[3].id, "grid_score": 1, "card_comment": "Top agree"},
    ]

    payload = {
        "session_token": str(uuid.uuid4()),
        "study_slug": seed_study.slug,
        "language_used": "en",
        "status": "completed",
        "presort_answers": {"age": 25},
        "qsort": qsort,
        "postsort_answers": {"feedback": "Good"}
    }
    
    response = await client.post("/api/submit", json=payload)
    assert response.status_code == 200, response.text
    resp_data = response.json()
    assert "confirmation_code" in resp_data
    assert resp_data["status"] == "success"

@pytest.mark.asyncio
async def test_submit_incomplete_cards(client, seed_study):
    """Submitting 'completed' status with missing cards should fail"""
    statements = seed_study.statements
    qsort = [
        {"statement_id": statements[0].id, "grid_score": 0},
    ] 
    # Only 1 card, need 4

    payload = {
        "session_token": str(uuid.uuid4()),
        "study_slug": seed_study.slug,
        "language_used": "en",
        "status": "completed",
        "qsort": qsort
    }
    
    response = await client.post("/api/submit", json=payload)
    assert response.status_code == 400
    assert "Submission incomplete" in response.json()["detail"]

@pytest.mark.asyncio
async def test_submit_invalid_grid_distribution(client, seed_study):
    """Submitting 'completed' status with wrong column counts"""
    statements = seed_study.statements
    # Try to put everyone in column 0 (capacity 2, but we put 4)
    qsort = [
        {"statement_id": s.id, "grid_score": 0} for s in statements
    ]

    payload = {
        "session_token": str(uuid.uuid4()),
        "study_slug": seed_study.slug,
        "language_used": "en",
        "status": "completed",
        "qsort": qsort
    }
    
    response = await client.post("/api/submit", json=payload)
    assert response.status_code == 400
    assert "incorrect number of cards" in response.json()["detail"]

@pytest.mark.asyncio
async def test_submit_draft_ignore_validation(client, seed_study):
    """Submitting 'started' (draft) status should skip rigorous validation"""
    statements = seed_study.statements
    # Incomplete sort
    qsort = [
        {"statement_id": statements[0].id, "grid_score": 0}
    ]

    payload = {
        "session_token": str(uuid.uuid4()),
        "study_slug": seed_study.slug,
        "language_used": "en",
        "status": "started", # DRAFT
        "qsort": qsort
    }
    
    response = await client.post("/api/submit", json=payload)
    assert response.status_code == 200, response.text
    assert response.json()["status"] == "success"

@pytest.mark.asyncio
async def test_submit_invalid_statement_id(client, seed_study):
    payload = {
        "session_token": str(uuid.uuid4()),
        "study_slug": seed_study.slug,
        "language_used": "en",
        "status": "started",
        "qsort": [
            {"statement_id": 99999, "grid_score": 0} # Non-existent ID
        ]
    }
    
    response = await client.post("/api/submit", json=payload)
    assert response.status_code == 400
    assert "does not belong to study" in response.json()["detail"]
