"""Seed the full Bioeconomy Futures demo: study + concourse + filled Q-sorts.

This is the rich demo seeder behind ``make demo-seed``. It does three things,
each idempotent so the command is safe to re-run:

  1. Sync + activate the study design from ``data/example-study.json``
     (reuses ``sync_study_from_file(..., activate=True)``).
  2. Seed a curated concourse from ``data/example-study.concourse.json``:
     candidate statements are bulk-created, then edited (recording version
     history with change comments) and discussed (comments), and end up
     accepted / rejected / proposed. The 25 accepted items are the study Q-set.
  3. Submit 18 synthetic, factor-structured Q-sorts from
     ``data/example-study.sorts.json`` through the participant API, each with
     pre-sort and post-sort answers, so a reviewer can replay the whole
     workflow — design, concourse curation, collection, and analysis.

The Q-sort data is SYNTHETIC (see ``scripts/generate_demo_sorts.py``); it is
authored for teaching and does not represent real participants. The intended
analysis is a three-factor solution (industrial vs justice as a bipolar factor,
plus a sufficiency factor and a territorial factor).

Run (backend container):  uv run python seed_demo.py
"""

import asyncio
import json
import os
import sys
import uuid
from collections.abc import Awaitable, Callable
from typing import Any

import httpx

current_dir = os.path.dirname(os.path.abspath(__file__))
if current_dir not in sys.path:
    sys.path.append(current_dir)

from app.utils.script_utils import APIClient, sync_study_from_file  # noqa: E402

STUDY_JSON = "data/example-study.json"
CONCOURSE_JSON = "data/example-study.concourse.json"
SORTS_JSON = "data/example-study.sorts.json"
AUDIO_DIR = "data/audio"
AUDIO_MANIFEST = "data/audio/manifest.json"
SLUG = "bioeconomy-futures"

_RETRY_STATUSES = {429, 500, 502, 503, 504}


def _load(name: str) -> Any:
    with open(os.path.join(current_dir, name), encoding="utf-8") as f:
        return json.load(f)


def _load_optional(name: str) -> Any:
    try:
        return _load(name)
    except FileNotFoundError:
        return {}


async def _send(
    make_request: Callable[[], Awaitable[httpx.Response]],
    *,
    ok: tuple[int, ...],
    what: str,
    attempts: int = 5,
) -> httpx.Response:
    """Run a request with exponential backoff on rate-limit / transient errors."""
    delay = 1.0
    last: httpx.Response | None = None
    for attempt in range(attempts):
        resp = await make_request()
        if resp.status_code in ok:
            return resp
        last = resp
        if resp.status_code in _RETRY_STATUSES and attempt < attempts - 1:
            await asyncio.sleep(delay)
            delay *= 2
            continue
        break
    detail = last.text if last is not None else "no response"
    raise RuntimeError(f"{what} failed: {detail}")


def _tr_list(translations: dict[str, str]) -> list[dict[str, str]]:
    return [
        {"language_code": lang, "text": text} for lang, text in translations.items()
    ]


async def seed_concourse(api: APIClient) -> None:
    """Create the demo concourse, its items, version history, and comments."""
    data = _load(CONCOURSE_JSON)
    title = data["title"]

    listing = await api.client.get("/api/admin/concourses", params={"limit": 100})
    if listing.status_code == 200:
        existing = listing.json().get("items", [])
        if any(c.get("title") == title for c in existing):
            print(f"Concourse '{title}' already exists — skipping concourse seed.")
            return

    created = await _send(
        lambda: api.client.post(
            "/api/admin/concourses",
            json={"title": title, "description": data.get("description")},
        ),
        ok=(201,),
        what="Create concourse",
    )
    cid = created.json()["id"]
    print(f"Created concourse '{title}' (id={cid}).")

    bulk_payload = {
        "items": [
            {
                "code": item["code"],
                "source": item.get("source"),
                "status": item["create_status"],
                "translations": _tr_list(item["translations"]),
            }
            for item in data["items"]
        ]
    }
    bulk = await _send(
        lambda: api.client.post(
            f"/api/admin/concourses/{cid}/items/bulk", json=bulk_payload
        ),
        ok=(201,),
        what="Bulk-create concourse items",
    )
    versions = {
        row["code"]: {"id": row["id"], "version": row["version"]} for row in bulk.json()
    }
    print(f"Created {len(versions)} concourse items.")

    n_rev = n_comment = 0
    for item in data["items"]:
        ref = versions[item["code"]]
        iid = ref["id"]
        for rev in item.get("revisions", []):
            body: dict[str, Any] = {
                "version": ref["version"],
                "change_comment": rev["change_comment"],
            }
            if rev.get("status"):
                body["status"] = rev["status"]
            if rev.get("translations"):
                body["translations"] = _tr_list(rev["translations"])
            updated = await _send(
                lambda b=body: api.client.patch(
                    f"/api/admin/concourses/{cid}/items/{iid}", json=b
                ),
                ok=(200,),
                what=f"Update item {item['code']}",
            )
            ref["version"] = updated.json()["version"]
            n_rev += 1
        for comment in item.get("comments", []):
            await _send(
                lambda body=comment: api.client.post(
                    f"/api/admin/concourses/{cid}/items/{iid}/comments",
                    json={"body": body},
                ),
                ok=(201,),
                what=f"Comment on item {item['code']}",
            )
            n_comment += 1

    statuses = {"accepted": 0, "rejected": 0, "proposed": 0}
    for item in data["items"]:
        final = item["create_status"]
        for rev in item.get("revisions", []):
            if rev.get("status"):
                final = rev["status"]
        statuses[final] += 1
    print(
        f"Concourse seeded: {statuses['accepted']} accepted, "
        f"{statuses['rejected']} rejected, {statuses['proposed']} proposed; "
        f"{n_rev} edits recorded, {n_comment} comments."
    )


async def _upload_audio(api: APIClient, token: str, info: dict[str, Any]) -> str:
    """Upload one spoken clip. Returns 'uploaded', 'storage_off', or 'missing'.

    A 503 means object storage is unconfigured (the default ``make demo-up``
    runs MinIO, but a bare ``seed_demo.py`` run may not) — we skip audio cleanly
    rather than fail the whole seed.
    """
    path = os.path.join(current_dir, AUDIO_DIR, info["file"])
    if not os.path.exists(path):
        return "missing"
    with open(path, "rb") as fh:
        content = fh.read()
    data = {
        "session_token": token,
        "question_key": f"question_{info['question_key']}",
        "duration_seconds": str(info["duration_seconds"]),
    }
    files = {"file": (info["file"], content, "audio/mpeg")}
    delay = 1.0
    for attempt in range(4):
        resp = await api.client.post("/api/audio/upload", data=data, files=files)
        if resp.status_code == 200:
            return "uploaded"
        if resp.status_code == 503:
            return "storage_off"
        if resp.status_code in _RETRY_STATUSES and attempt < 3:
            await asyncio.sleep(delay)
            delay *= 2
            continue
        raise RuntimeError(f"Audio upload for {info['file']} failed: {resp.text}")
    return "storage_off"


async def submit_sorts(api: APIClient) -> None:
    """Submit the synthetic Q-sorts with pre-sort, audio, and post-sort answers."""
    sorts = _load(SORTS_JSON)
    audio_manifest = _load_optional(AUDIO_MANIFEST)

    study = await api.get_study(SLUG)
    if study is None:
        raise RuntimeError(f"Study '{SLUG}' not found after sync")
    if study.get("participant_count", 0) > 0:
        print(
            f"Study '{SLUG}' already has {study['participant_count']} participant(s) — "
            "skipping Q-sort submission."
        )
        return
    code_to_id = {s["code"]: s["id"] for s in study["statements"]}

    audio_uploaded = 0
    audio_storage_off = False
    for pid, p in sorts.items():
        token = str(uuid.uuid4())
        lang = p["language"]
        await _send(
            lambda: api.client.post(
                f"/api/study/{SLUG}/consent",
                json={
                    "study_slug": SLUG,
                    "session_token": token,
                    "language_code": lang,
                    "consent_hash": None,
                },
            ),
            ok=(200,),
            what=f"Consent for {pid}",
        )
        # Audio must be uploaded after consent but before submission (the API
        # rejects uploads once the participant has submitted).
        if not audio_storage_off and pid in audio_manifest:
            result = await _upload_audio(api, token, audio_manifest[pid])
            if result == "uploaded":
                audio_uploaded += 1
            elif result == "storage_off":
                audio_storage_off = True
                print("  (object storage unconfigured — skipping audio comments)")
        card_comments = p.get("card_comments", {})
        qsort = [
            {
                "statement_id": code_to_id[code],
                "grid_score": score,
                "card_comment": card_comments.get(code),
            }
            for code, score in p["qsort"].items()
        ]
        postsort_answers = {
            "questions_answers": p["postsort"],
            "card_comments": {
                str(code_to_id[code]): text for code, text in card_comments.items()
            },
            "general_comment": p.get("general_comment", ""),
            "missing_statement": p.get("missing_statement", ""),
        }
        await _send(
            lambda: api.client.post(
                "/api/submit",
                json={
                    "study_slug": SLUG,
                    "session_token": token,
                    "language_used": lang,
                    "status": "completed",
                    "presort_answers": p["presort"],
                    "qsort": qsort,
                    "postsort_answers": postsort_answers,
                },
            ),
            ok=(200,),
            what=f"Submit {pid}",
        )
        print(f"Submitted Q-sort {pid} ({p['archetype']}, {lang}).")

    if audio_manifest:
        if audio_uploaded:
            print(f"Uploaded {audio_uploaded} spoken audio comment(s).")
        elif not audio_storage_off:
            print("No audio comments uploaded (clips missing).")


async def main() -> None:
    """Seed study design, concourse, and filled Q-sorts in one pass."""
    api = APIClient()
    try:
        await api.login()
        print(f"Syncing + activating study from {STUDY_JSON}...")
        await sync_study_from_file(
            os.path.join(current_dir, STUDY_JSON), activate=True, api=api
        )
        print("\nSeeding concourse...")
        await seed_concourse(api)
        print("\nSubmitting synthetic Q-sorts...")
        await submit_sorts(api)
    finally:
        await api.close()

    print(
        "\nBioeconomy Futures demo seeded. Open the study, browse the concourse "
        "(accepted / rejected / proposed items, edits, and comments), then run "
        "an analysis — a three-factor solution is expected (industrial vs justice "
        "as a bipolar factor, plus sufficiency and territorial factors)."
    )


if __name__ == "__main__":
    asyncio.run(main())
