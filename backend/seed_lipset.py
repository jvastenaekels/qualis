"""Seed the published Lipset (1963) Q dataset as an analytical validation study.

Two phases:
  1. Sync + activate the study design from data/lipset-democracy.json
     (reuses sync_study_from_file --activate).
  2. Submit the 9 real, published Q-sorts from
     data/lipset-democracy.sorts.json via the participant API, so the
     dataset is ingested through the same path a collected study uses.

The data is the openly published Lipset (1963) "Value Patterns of
Democracy" Q dataset distributed with the qmethod R package
(Zabala 2014, GPL-2-or-later). It exists so Qualis can be validated
against the qmethod factor solution on real, citable data.
"""

import asyncio
import json
import os
import sys
import uuid

current_dir = os.path.dirname(os.path.abspath(__file__))
if current_dir not in sys.path:
    sys.path.append(current_dir)

from app.utils.script_utils import APIClient, sync_study_from_file  # noqa: E402

STUDY_JSON = "data/lipset-democracy.json"
SORTS_JSON = "data/lipset-democracy.sorts.json"
SLUG = "lipset-democracy"


async def submit_sorts() -> None:
    """Submit the 9 published Q-sorts through the participant API."""
    with open(os.path.join(current_dir, SORTS_JSON), encoding="utf-8") as f:
        sorts = json.load(f)

    api = APIClient()
    try:
        await api.login()
        study = await api.get_study(SLUG)
        if study is None:
            raise RuntimeError(f"Study '{SLUG}' not found after sync")
        code_to_id = {s["code"]: s["id"] for s in study["statements"]}

        for sort_id, placements in sorts.items():
            token = str(uuid.uuid4())
            consent = await api.client.post(
                f"/api/study/{SLUG}/consent",
                json={
                    "study_slug": SLUG,
                    "session_token": token,
                    "language_code": "en",
                    "consent_hash": None,
                },
            )
            if consent.status_code != 200:
                raise RuntimeError(f"Consent failed for {sort_id}: {consent.text}")
            qsort = [
                {"statement_id": code_to_id[code], "grid_score": score}
                for code, score in placements.items()
            ]
            resp = await api.client.post(
                "/api/submit",
                json={
                    "study_slug": SLUG,
                    "session_token": token,
                    "language_used": "en",
                    "status": "completed",
                    "qsort": qsort,
                    "presort_answers": {},
                    "postsort_answers": {},
                },
            )
            if resp.status_code != 200:
                raise RuntimeError(f"Submit failed for {sort_id}: {resp.text}")
            print(f"Submitted Q-sort {sort_id}")
    finally:
        await api.close()


async def main() -> None:
    """Run both phases."""
    print(f"Syncing + activating study from {STUDY_JSON}...")
    await sync_study_from_file(os.path.join(current_dir, STUDY_JSON), activate=True)
    print("Submitting 9 published Lipset Q-sorts...")
    await submit_sorts()
    print(
        "Lipset validation study seeded. Run a 3-factor analysis and "
        "compare with the qmethod solution."
    )


if __name__ == "__main__":
    asyncio.run(main())
