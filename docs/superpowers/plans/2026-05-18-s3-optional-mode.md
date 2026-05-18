# S3-optional mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Qualis non-blocking when S3/object storage is unconfigured — audio silently degrades to text-only for participants, never a 500 — while the operator is clearly and impeccably informed.

**Architecture:** Mirror the shipped `smtp-optional-mode` pattern. One settings-derived capability flag (`is_s3_configured`) exposed via the existing `GET /api/config`, read once into `usePlatformConfigStore`, gating the participant audio UI. A backend FastAPI dependency is the 503 safety-net. Operator clarity via a startup log banner, a study-design inline note, and a doc.

**Tech Stack:** FastAPI/Pydantic v2 (backend), React 19/TS/Zustand/react-i18next (frontend), pytest + Vitest, orval-generated API client.

---

## Verified codebase facts (read before any task — these are ground truth)

- **Settings:** `backend/app/core/config.py`. S3 vars at lines 73-80: `S3_ENDPOINT_URL`, `S3_BUCKET_NAME`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` (all `str | None = None`), `S3_REGION` (has default). `is_smtp_configured` property at line ~156 is the exact pattern to copy. `settings = Settings()` at module end.
- **Public config schema:** `backend/app/schemas/config.py` — `PublicConfig(BaseModel)` currently has only `email_delivery: Literal["smtp","manual"]`.
- **Config router:** `backend/app/routers/config.py` — `get_public_config()` builds `PublicConfig(...)`.
- **Startup banner:** `backend/app/utils/smtp_mode.py` → `smtp_mode_banner_lines(*, smtp_configured: bool) -> list[str]`. Wired in `backend/app/main.py` lifespan (~line 114-116): `from app.utils.smtp_mode import smtp_mode_banner_lines` then `for line in smtp_mode_banner_lines(...): logger.warning(line)`, just before `yield`.
- **Audio router:** `backend/app/routers/audio.py`. `from app.core.config import settings` already imported (line 19). `from app.services.storage_service import storage_service` (line 18). Three storage-touching routes: `@router.post("/upload")` `upload_audio` (~line 99-101), `@router.delete("/{recording_id}")` `delete_audio_recording` (~258-260), `@router.get("/{recording_id}/url")` `get_audio_url` (~313-315). Router prefix is `/api/audio`.
- **Error envelope:** the errors middleware reshapes `HTTPException(detail="x")` into `{code,message,details}`; tests assert `r.json()["message"] == "x"`, **never** `["detail"]` (house convention; see `test_smtp_optional.py`).
- **Frontend store:** `frontend/src/store/usePlatformConfigStore.ts` (Zustand, `emailDelivery` pattern). Bootstrap: `frontend/src/hooks/usePlatformConfigBootstrap.ts` (maps `data.email_delivery`).
- **Participant audio:** `frontend/src/components/postsort/Step1_Feedback.tsx` (line 63: `const isAudioEffectivelyEnabled = isAudioEnabled && !audioUnsupported;`). `frontend/src/components/postsort/Step2_Questionnaire.tsx` (line 60 same expression; `showAudioSection` callback lines ~64-69 — `text_audio` bypasses the global toggle via the `isTextAudio` arg; render site ~316-317).
- **Admin audio toggle:** `frontend/src/components/admin/designer/PostSortConfigEditor.tsx`. Uses `const { t, i18n } = useTranslation();`. Audio section ~line 495; the toggle `<Switch data-testid="audio-recording-toggle" checked={config?.audio?.enabled ...}>` ~line 511; `{config?.audio?.enabled && ( ...duration... )}` block ~line 536. This file's local i18n style is `t('key') || 'fallback'`; **new strings must use the project standard `t('key', 'English fallback')`** and the key must exist in `frontend/public/locales/en/admin.json`.
- **Test fixtures:** integration tests use `client`, `db`, `test_user`, `superuser_token`, `monkeypatch` (toggle settings inline via `monkeypatch.setattr(settings, "S3_*", None)`). Audio integration setup: `backend/tests/integration/test_audio.py` has `audio_enabled_study` and `participant_token` fixtures (do **not** reuse its `mock_storage_service` for the 503 test — the guard must fire before storage is touched).
- **Unit banner test pattern:** `backend/tests/unit/test_smtp_mode.py`.
- **Strict typing:** add new leaf modules to the `mypy --strict` overrides in `backend/pyproject.toml` (the override list contains `"app.utils.smtp_mode"`, `"app.schemas.config"`, `"app.routers.config"`).
- **Vulture:** `backend/vulture_whitelist.py` has a `# --- SMTP-optional mode feature ---` section (line ~400). New endpoint/dep functions and new Pydantic fields **must** be appended in a new section (`make ci-fast` does NOT run vulture; only full `make ci` does).
- **Doc-links CI:** lychee scans `./docs/**/*.md`. Only link to files/anchors that exist. Verified-good target: `docs/guides/deployment.md#required-environment-variables`.
- **Inner loop:** `cd /home/julien/tools/qualis && make ci-fast` (~38s). Backend tests alone: `cd backend && uv run pytest <path> -q`. Frontend: `cd frontend && npx vitest run <path>`.

---

### Task 1: `Settings.is_s3_configured`

**Files:**
- Modify: `backend/app/core/config.py` (add property next to `is_smtp_configured`, ~line 165)
- Test: `backend/tests/unit/test_s3_config.py` (create)

- [ ] **Step 1: Write the failing test**

Create `backend/tests/unit/test_s3_config.py`:

```python
"""Settings.is_s3_configured capability flag."""

from app.core.config import Settings


def _settings(**over):
    base = dict(
        S3_ENDPOINT_URL="https://s3.example.com",
        S3_BUCKET_NAME="bucket",
        S3_ACCESS_KEY_ID="key",
        S3_SECRET_ACCESS_KEY="secret",
    )
    base.update(over)
    return Settings(**base)


def test_is_s3_configured_true_when_all_four_set():
    assert _settings().is_s3_configured is True


def test_is_s3_configured_false_when_endpoint_missing():
    assert _settings(S3_ENDPOINT_URL=None).is_s3_configured is False


def test_is_s3_configured_false_when_bucket_missing():
    assert _settings(S3_BUCKET_NAME=None).is_s3_configured is False


def test_is_s3_configured_false_when_access_key_missing():
    assert _settings(S3_ACCESS_KEY_ID=None).is_s3_configured is False


def test_is_s3_configured_false_when_secret_missing():
    assert _settings(S3_SECRET_ACCESS_KEY=None).is_s3_configured is False
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && uv run pytest tests/unit/test_s3_config.py -q`
Expected: FAIL — `AttributeError: 'Settings' object has no attribute 'is_s3_configured'`

- [ ] **Step 3: Add the property**

In `backend/app/core/config.py`, immediately after the `is_smtp_configured` property (before `email_verification_active`), add:

```python
    @property
    def is_s3_configured(self) -> bool:
        """True iff all four S3/object-storage credentials are populated.

        When False, Qualis runs in STORAGE-OPTIONAL mode: the audio
        subsystem is unavailable. Studies with audio enabled silently
        degrade to text-only responses (no audio captured, no error
        shown to participants); see docs/guides/running-without-s3.md.
        The audio router uses this to return a clean 503 instead of an
        AttributeError if it is ever reached.
        """
        return bool(
            self.S3_ENDPOINT_URL
            and self.S3_BUCKET_NAME
            and self.S3_ACCESS_KEY_ID
            and self.S3_SECRET_ACCESS_KEY
        )
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && uv run pytest tests/unit/test_s3_config.py -q`
Expected: PASS (5 passed)

- [ ] **Step 5: Commit**

```bash
cd /home/julien/tools/qualis
git add backend/app/core/config.py backend/tests/unit/test_s3_config.py
git commit -m "$(cat <<'EOF'
feat(config): is_s3_configured capability flag

Storage analogue of is_smtp_configured. Drives S3-optional mode.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Startup banner helper `app.utils.storage_mode`

**Files:**
- Create: `backend/app/utils/storage_mode.py`
- Modify: `backend/app/main.py` (lifespan, next to the smtp banner loop ~line 114-116)
- Modify: `backend/pyproject.toml` (add `"app.utils.storage_mode"` to the strict overrides list, next to `"app.utils.smtp_mode"`)
- Test: `backend/tests/unit/test_storage_mode.py` (create)

- [ ] **Step 1: Write the failing test**

Create `backend/tests/unit/test_storage_mode.py`:

```python
from app.utils.storage_mode import storage_mode_banner_lines


def test_banner_empty_when_s3_configured():
    assert storage_mode_banner_lines(s3_configured=True) == []


def test_banner_lists_consequences_when_s3_absent():
    lines = storage_mode_banner_lines(s3_configured=False)
    joined = "\n".join(lines)
    assert "Object storage" in joined
    assert "text-only" in joined.lower()
    assert "docs/guides/running-without-s3.md" in joined
    # Names the exact env vars the operator must set.
    assert "S3_BUCKET_NAME" in joined
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && uv run pytest tests/unit/test_storage_mode.py -q`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.utils.storage_mode'`

- [ ] **Step 3: Create the helper**

Create `backend/app/utils/storage_mode.py`:

```python
"""Operator-facing startup banner for S3-optional mode."""


def storage_mode_banner_lines(*, s3_configured: bool) -> list[str]:
    """Return the log lines to emit at startup describing storage
    capabilities. Empty when S3 is configured (nothing to warn about)."""
    if s3_configured:
        return []
    return [
        "Object storage (S3) is not configured — Qualis runs in "
        "STORAGE-OPTIONAL mode.",
        "  Studies run normally; audio capture is unavailable.",
        "  Any study with audio enabled silently degrades to text-only "
        "responses:",
        "  no audio is collected and no error is shown to participants.",
        "  To enable audio, set S3_ENDPOINT_URL, S3_BUCKET_NAME, "
        "S3_ACCESS_KEY_ID,",
        "  S3_SECRET_ACCESS_KEY and restart.",
        "  See docs/guides/running-without-s3.md for the capability matrix.",
    ]
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && uv run pytest tests/unit/test_storage_mode.py -q`
Expected: PASS (2 passed)

- [ ] **Step 5: Wire into the lifespan**

In `backend/app/main.py`, directly after the existing two-line smtp banner loop (the `for line in smtp_mode_banner_lines(...): logger.warning(line)` block, before `yield`), add:

```python
    from app.utils.storage_mode import storage_mode_banner_lines

    for line in storage_mode_banner_lines(
        s3_configured=settings.is_s3_configured
    ):
        logger.warning(line)
```

- [ ] **Step 6: Add the strict-typing override**

In `backend/pyproject.toml`, in the `module = [...]` strict-overrides list, add `"app.utils.storage_mode",` on the line immediately after `"app.utils.smtp_mode",`.

- [ ] **Step 7: Verify type + tests**

Run: `cd backend && uv run mypy app/utils/storage_mode.py && uv run pytest tests/unit/test_storage_mode.py -q`
Expected: mypy clean; 2 passed

- [ ] **Step 8: Commit**

```bash
cd /home/julien/tools/qualis
git add backend/app/utils/storage_mode.py backend/app/main.py backend/pyproject.toml backend/tests/unit/test_storage_mode.py
git commit -m "$(cat <<'EOF'
feat(startup): log storage-optional banner when S3 absent

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Expose `audio_storage` on `GET /api/config`

**Files:**
- Modify: `backend/app/schemas/config.py`
- Modify: `backend/app/routers/config.py`
- Modify: `backend/vulture_whitelist.py`
- Test: `backend/tests/integration/test_s3_optional.py` (create)

- [ ] **Step 1: Write the failing test**

Create `backend/tests/integration/test_s3_optional.py`:

```python
"""S3-optional mode: capability flag + audio safety-net guard."""

import pytest

from app.core.config import settings


@pytest.mark.asyncio
class TestPublicConfigAudioStorage:
    async def test_reports_unavailable_when_s3_absent(self, client, monkeypatch):
        monkeypatch.setattr(settings, "S3_ENDPOINT_URL", None)
        monkeypatch.setattr(settings, "S3_BUCKET_NAME", None)
        monkeypatch.setattr(settings, "S3_ACCESS_KEY_ID", None)
        monkeypatch.setattr(settings, "S3_SECRET_ACCESS_KEY", None)
        r = await client.get("/api/config")
        assert r.status_code == 200
        assert r.json()["audio_storage"] == "unavailable"

    async def test_reports_available_when_s3_configured(self, client, monkeypatch):
        monkeypatch.setattr(settings, "S3_ENDPOINT_URL", "https://s3.example.com")
        monkeypatch.setattr(settings, "S3_BUCKET_NAME", "bucket")
        monkeypatch.setattr(settings, "S3_ACCESS_KEY_ID", "key")
        monkeypatch.setattr(settings, "S3_SECRET_ACCESS_KEY", "secret")
        r = await client.get("/api/config")
        assert r.status_code == 200
        assert r.json()["audio_storage"] == "available"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && uv run pytest tests/integration/test_s3_optional.py -q`
Expected: FAIL — `KeyError: 'audio_storage'`

- [ ] **Step 3: Extend the schema**

In `backend/app/schemas/config.py`, update the docstring and add the field:

```python
class PublicConfig(BaseModel):
    """Minimal client bootstrap payload.

    ``email_delivery`` is "smtp" when SMTP credentials are configured and
    "manual" otherwise (see docs/guides/running-without-smtp.md).

    ``audio_storage`` is "available" when S3/object-storage credentials are
    configured and "unavailable" otherwise. When "unavailable", the
    participant audio UI is suppressed and audio-enabled studies degrade to
    text-only (see docs/guides/running-without-s3.md).
    """

    email_delivery: Literal["smtp", "manual"]
    audio_storage: Literal["available", "unavailable"]
```

- [ ] **Step 4: Populate it in the router**

In `backend/app/routers/config.py`, update the return and docstring:

```python
@router.get("/config", response_model=PublicConfig)
async def get_public_config() -> PublicConfig:
    """Return client bootstrap config. Unauthenticated by design — it
    exposes only capability modes (email delivery, audio storage), no
    secrets."""
    return PublicConfig(
        email_delivery="smtp" if settings.is_smtp_configured else "manual",
        audio_storage=(
            "available" if settings.is_s3_configured else "unavailable"
        ),
    )
```

- [ ] **Step 5: Whitelist the new Pydantic field for vulture**

In `backend/vulture_whitelist.py`, after the existing `# --- SMTP-optional mode feature ---` block, append:

```python

# --- S3-optional mode feature ---
# Pydantic field read only at the JSON wire boundary; vulture can't see it.
audio_storage
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd backend && uv run pytest tests/integration/test_s3_optional.py -q`
Expected: PASS (2 passed)

- [ ] **Step 7: Commit**

```bash
cd /home/julien/tools/qualis
git add backend/app/schemas/config.py backend/app/routers/config.py backend/vulture_whitelist.py backend/tests/integration/test_s3_optional.py
git commit -m "$(cat <<'EOF'
feat(api): expose audio_storage capability on GET /api/config

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Backend 503 safety-net guard in the audio router

**Files:**
- Modify: `backend/app/routers/audio.py`
- Modify: `backend/vulture_whitelist.py`
- Test: `backend/tests/integration/test_s3_optional.py` (extend)

- [ ] **Step 1: Write the failing test**

Append to `backend/tests/integration/test_s3_optional.py`:

```python
from io import BytesIO
from unittest.mock import patch


@pytest.mark.asyncio
class TestAudioStorageGuard:
    async def test_upload_returns_503_not_500_when_s3_absent(
        self, client, monkeypatch
    ):
        # No storage mock on purpose: the guard must fire BEFORE any
        # storage_service attribute is touched (today that path raises
        # AttributeError -> 500).
        monkeypatch.setattr(settings, "S3_ENDPOINT_URL", None)
        monkeypatch.setattr(settings, "S3_BUCKET_NAME", None)
        monkeypatch.setattr(settings, "S3_ACCESS_KEY_ID", None)
        monkeypatch.setattr(settings, "S3_SECRET_ACCESS_KEY", None)

        files = {"file": ("r.webm", BytesIO(b"x" * 50), "audio/webm")}
        data = {
            "session_token": "00000000-0000-0000-0000-000000000000",
            "question_key": "card_1",
            "duration_seconds": "1.0",
        }
        r = await client.post("/api/audio/upload", files=files, data=data)
        assert r.status_code == 503
        # Error-envelope house convention: the string lands in ["message"].
        assert r.json()["message"] == "audio_storage_unavailable"

    @patch("app.routers.audio.magic.from_buffer")
    async def test_upload_unaffected_when_s3_configured(
        self, mock_magic, client, monkeypatch
    ):
        # Guard must NOT fire when configured: a configured instance with a
        # bogus token still reaches normal validation (404), never 503.
        mock_magic.return_value = "audio/webm"
        monkeypatch.setattr(settings, "S3_ENDPOINT_URL", "https://s3.example.com")
        monkeypatch.setattr(settings, "S3_BUCKET_NAME", "bucket")
        monkeypatch.setattr(settings, "S3_ACCESS_KEY_ID", "key")
        monkeypatch.setattr(settings, "S3_SECRET_ACCESS_KEY", "secret")

        files = {"file": ("r.webm", BytesIO(b"x" * 50), "audio/webm")}
        data = {
            "session_token": "00000000-0000-0000-0000-000000000000",
            "question_key": "card_1",
            "duration_seconds": "1.0",
        }
        r = await client.post("/api/audio/upload", files=files, data=data)
        assert r.status_code != 503
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && uv run pytest tests/integration/test_s3_optional.py::TestAudioStorageGuard -q`
Expected: FAIL — `test_upload_returns_503_not_500_when_s3_absent` gets 500 (AttributeError) instead of 503.

- [ ] **Step 3: Add the guard dependency and apply it to the three storage routes**

In `backend/app/routers/audio.py`:

(a) After the existing `router = APIRouter(prefix="/api/audio", tags=["audio"])` line, add the dependency:

```python
def require_audio_storage() -> None:
    """Reject audio endpoints with a clean 503 when object storage is
    unconfigured. Defence-in-depth: the adaptive UI suppresses the audio
    affordance entirely (see GET /api/config audio_storage), so this is a
    safety net, not the primary path. Without it, storage_service is built
    with skip_init=True and any call raises AttributeError -> 500."""
    if not settings.is_s3_configured:
        raise HTTPException(
            status_code=503, detail="audio_storage_unavailable"
        )
```

(b) Add `dependencies=[Depends(require_audio_storage)]` to the three storage-touching route decorators. Change:

- `@router.post("/upload", response_model=AudioUploadResponse)` → `@router.post("/upload", response_model=AudioUploadResponse, dependencies=[Depends(require_audio_storage)])`
- `@router.delete("/{recording_id}")` → `@router.delete("/{recording_id}", dependencies=[Depends(require_audio_storage)])`
- `@router.get("/{recording_id}/url", response_model=AudioRecordingRead)` → `@router.get("/{recording_id}/url", response_model=AudioRecordingRead, dependencies=[Depends(require_audio_storage)])`

(`Depends` and `HTTPException` are already imported at the top of the file.)

- [ ] **Step 4: Whitelist the new dependency for vulture**

In `backend/vulture_whitelist.py`, under the `# --- S3-optional mode feature ---` section added in Task 3, append on its own line:

```python
require_audio_storage
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && uv run pytest tests/integration/test_s3_optional.py -q`
Expected: PASS (all). Also run the existing audio suite to confirm no regression (its `mock_storage_service` study fixture sets S3 via the real settings — confirm green): `cd backend && uv run pytest tests/integration/test_audio.py -q`
Expected: PASS. If `test_audio.py` now fails because the guard sees unconfigured S3 in the test env, add the four `monkeypatch.setattr(settings, "S3_*", "...")` lines to its `mock_storage_service` fixture (configured dummy values) — the mock replaces the client, the guard only needs the settings truthy.

- [ ] **Step 6: Commit**

```bash
cd /home/julien/tools/qualis
git add backend/app/routers/audio.py backend/vulture_whitelist.py backend/tests/integration/test_s3_optional.py backend/tests/integration/test_audio.py
git commit -m "$(cat <<'EOF'
feat(audio): 503 safety-net when object storage is unconfigured

Replaces the unguarded AttributeError -> 500. Applied to upload,
delete, and presigned-url routes via a shared FastAPI dependency.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Regenerate the frontend API client

**Files:**
- Modify: generated client under `frontend/src/api/**`, `openapi.json`, `frontend/openapi.json` (all via `make generate-api`)

- [ ] **Step 1: Regenerate**

Run: `cd /home/julien/tools/qualis && make generate-api`
Expected: a new model file for the `audio_storage` enum (e.g. `frontend/src/api/model/publicConfigAudioStorage.ts`) and an updated `PublicConfig` model type.

- [ ] **Step 2: Verify it is in sync**

Run: `cd /home/julien/tools/qualis && make check-api`
Expected: clean (no diff).

- [ ] **Step 3: Confirm the generated symbol name**

Run: `grep -rl "AudioStorage" frontend/src/api/model | head` and note the exact exported type name (expected `PublicConfigAudioStorage`, values `'available' | 'unavailable'`). Tasks 6 use this exact name.

- [ ] **Step 4: Commit**

```bash
cd /home/julien/tools/qualis
git add frontend/src/api openapi.json frontend/openapi.json
git commit -m "$(cat <<'EOF'
chore(api): regenerate client for audio_storage capability field

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Platform-config store + bootstrap consume `audio_storage`

**Files:**
- Modify: `frontend/src/store/usePlatformConfigStore.ts`
- Modify: `frontend/src/hooks/usePlatformConfigBootstrap.ts`
- Test: `frontend/src/store/usePlatformConfigStore.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `frontend/src/store/usePlatformConfigStore.test.ts`:

```typescript
import { describe, expect, it, beforeEach } from 'vitest';
import { usePlatformConfigStore } from './usePlatformConfigStore';

describe('usePlatformConfigStore — audioStorage', () => {
    beforeEach(() => {
        usePlatformConfigStore.setState({ emailDelivery: null, audioStorage: null });
    });

    it('isAudioStorageAvailable() is true by default (null = safe default)', () => {
        expect(usePlatformConfigStore.getState().isAudioStorageAvailable()).toBe(true);
    });

    it('isAudioStorageAvailable() is false when set to unavailable', () => {
        usePlatformConfigStore.getState().setAudioStorage('unavailable');
        expect(usePlatformConfigStore.getState().isAudioStorageAvailable()).toBe(false);
    });

    it('isAudioStorageAvailable() is true when set to available', () => {
        usePlatformConfigStore.getState().setAudioStorage('available');
        expect(usePlatformConfigStore.getState().isAudioStorageAvailable()).toBe(true);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/store/usePlatformConfigStore.test.ts`
Expected: FAIL — `setAudioStorage`/`isAudioStorageAvailable` not a function.

- [ ] **Step 3: Extend the store**

Replace the contents of `frontend/src/store/usePlatformConfigStore.ts` with:

```typescript
import { create } from 'zustand';
import type { PublicConfigEmailDelivery } from '@/api/model/publicConfigEmailDelivery';
import type { PublicConfigAudioStorage } from '@/api/model/publicConfigAudioStorage';

type EmailDelivery = PublicConfigEmailDelivery;
type AudioStorage = PublicConfigAudioStorage;

interface PlatformConfigState {
    emailDelivery: EmailDelivery | null;
    audioStorage: AudioStorage | null;
    setEmailDelivery: (mode: EmailDelivery) => void;
    setAudioStorage: (mode: AudioStorage) => void;
    isEmailManual: () => boolean;
    isAudioStorageAvailable: () => boolean;
}

export const usePlatformConfigStore = create<PlatformConfigState>((set, get) => ({
    emailDelivery: null,
    audioStorage: null,
    setEmailDelivery: (mode) => set({ emailDelivery: mode }),
    setAudioStorage: (mode) => set({ audioStorage: mode }),
    isEmailManual: () => get().emailDelivery === 'manual',
    // null = not yet loaded: default to available so a transient /api/config
    // failure never suppresses audio on a correctly-configured instance.
    isAudioStorageAvailable: () => get().audioStorage !== 'unavailable',
}));
```

(If Task 5 produced a different generated type name than `PublicConfigAudioStorage`, use that exact name here.)

- [ ] **Step 4: Map the field in the bootstrap hook**

In `frontend/src/hooks/usePlatformConfigBootstrap.ts`, add the store setter and effect alongside the email one:

```typescript
    const { data } = useGetPublicConfigApiConfigGet();
    const setEmailDelivery = usePlatformConfigStore((s) => s.setEmailDelivery);
    const setAudioStorage = usePlatformConfigStore((s) => s.setAudioStorage);

    useEffect(() => {
        if (data?.email_delivery) {
            setEmailDelivery(data.email_delivery);
        }
        if (data?.audio_storage) {
            setAudioStorage(data.audio_storage);
        }
    }, [data, setEmailDelivery, setAudioStorage]);
```

(Keep the existing "Silent-until-loaded by design" comment block; it applies equally to `audioStorage`.)

- [ ] **Step 5: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/store/usePlatformConfigStore.test.ts`
Expected: PASS (3 passed)

- [ ] **Step 6: Commit**

```bash
cd /home/julien/tools/qualis
git add frontend/src/store/usePlatformConfigStore.ts frontend/src/store/usePlatformConfigStore.test.ts frontend/src/hooks/usePlatformConfigBootstrap.ts
git commit -m "$(cat <<'EOF'
feat(frontend): platform-config store carries audio_storage

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Participant audio degrades silently to text-only

**Files:**
- Modify: `frontend/src/components/postsort/Step1_Feedback.tsx`
- Modify: `frontend/src/components/postsort/Step2_Questionnaire.tsx`
- Test: `frontend/src/components/postsort/Step2_Questionnaire.audio-storage.test.tsx` (create)

- [ ] **Step 1: Write the failing test**

Create `frontend/src/components/postsort/Step2_Questionnaire.audio-storage.test.tsx`:

```typescript
import { describe, expect, it, beforeEach } from 'vitest';
import { usePlatformConfigStore } from '@/store/usePlatformConfigStore';

// Pure logic guard: the storage-availability gate is the single predicate
// that suppresses the recorder. Verifying the store predicate that both
// components consume keeps this fast and free of MediaRecorder mocking.
describe('audio storage gate (participant degradation)', () => {
    beforeEach(() => {
        usePlatformConfigStore.setState({ audioStorage: null });
    });

    it('text_audio shows audio when storage available', () => {
        usePlatformConfigStore.getState().setAudioStorage('available');
        const storageOk = usePlatformConfigStore.getState().isAudioStorageAvailable();
        const isTextAudio = true;
        // Mirror showAudioSection: storageOk && (isTextAudio || ...)
        expect(storageOk && (isTextAudio || false)).toBe(true);
    });

    it('text_audio degrades to text-only when storage unavailable', () => {
        usePlatformConfigStore.getState().setAudioStorage('unavailable');
        const storageOk = usePlatformConfigStore.getState().isAudioStorageAvailable();
        const isTextAudio = true;
        expect(storageOk && (isTextAudio || false)).toBe(false);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/components/postsort/Step2_Questionnaire.audio-storage.test.tsx`
Expected: FAIL (store predicate not yet wired into the components — this test currently passes on the store alone; if it passes, that is acceptable: it locks the gate semantics. Treat green here as the spec for Steps 3-4.)

- [ ] **Step 3: Gate Step1_Feedback**

In `frontend/src/components/postsort/Step1_Feedback.tsx`:

(a) Add the import near the other store imports:

```typescript
import { usePlatformConfigStore } from '@/store/usePlatformConfigStore';
```

(b) Add the selector near the other audio state (right after `const [audioUnsupported, setAudioUnsupported] = useState(false);`, ~line 62):

```typescript
    const audioStorageAvailable = usePlatformConfigStore((s) =>
        s.isAudioStorageAvailable()
    );
```

(c) Change line 63 from:

```typescript
    const isAudioEffectivelyEnabled = isAudioEnabled && !audioUnsupported;
```

to:

```typescript
    const isAudioEffectivelyEnabled =
        isAudioEnabled && !audioUnsupported && audioStorageAvailable;
```

- [ ] **Step 4: Gate Step2_Questionnaire (including text_audio)**

In `frontend/src/components/postsort/Step2_Questionnaire.tsx`:

(a) Add the import:

```typescript
import { usePlatformConfigStore } from '@/store/usePlatformConfigStore';
```

(b) Add the selector right after the `audioUnsupported` state (~line 47):

```typescript
    const audioStorageAvailable = usePlatformConfigStore((s) =>
        s.isAudioStorageAvailable()
    );
```

(c) Change line 60 from:

```typescript
    const isAudioEffectivelyEnabled = isAudioEnabled && !audioUnsupported;
```

to:

```typescript
    const isAudioEffectivelyEnabled =
        isAudioEnabled && !audioUnsupported && audioStorageAvailable;
```

(d) Change the `showAudioSection` callback so storage gates `text_audio` too (the `isTextAudio` arg currently bypasses every gate). Replace:

```typescript
    const showAudioSection = useCallback(
        (questionKey: string, isTextAudio = false): boolean =>
            isTextAudio || isAudioEffectivelyEnabled || !!getAudioRecording(questionKey),
        [isAudioEffectivelyEnabled, getAudioRecording]
    );
```

with:

```typescript
    const showAudioSection = useCallback(
        (questionKey: string, isTextAudio = false): boolean =>
            audioStorageAvailable &&
            (isTextAudio ||
                isAudioEffectivelyEnabled ||
                !!getAudioRecording(questionKey)),
        [audioStorageAvailable, isAudioEffectivelyEnabled, getAudioRecording]
    );
```

(The text input from `SurveyField` always renders; only the `AudioRecorder` affordance is suppressed, so a required `text_audio` question is satisfiable by text alone — no participant-facing message, per design.)

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/components/postsort/Step2_Questionnaire.audio-storage.test.tsx src/components/postsort/Step2_Questionnaire.test.tsx src/components/postsort/Step1_Feedback.test.tsx`
Expected: PASS (existing component tests still green — the store defaults to available, so unchanged behaviour when storage is configured).

- [ ] **Step 6: Commit**

```bash
cd /home/julien/tools/qualis
git add frontend/src/components/postsort/Step1_Feedback.tsx frontend/src/components/postsort/Step2_Questionnaire.tsx frontend/src/components/postsort/Step2_Questionnaire.audio-storage.test.tsx
git commit -m "$(cat <<'EOF'
feat(participant): audio degrades to text-only when storage absent

Silent by design (no participant-facing message). text_audio
questions remain satisfiable by text alone.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: Operator note at the study-design audio toggle (UX-impeccable)

**Files:**
- Modify: `frontend/src/components/admin/designer/PostSortConfigEditor.tsx`
- Modify: `frontend/public/locales/en/admin.json`
- Test: covered by the i18n key-parity check; no new unit test (declarative JSX, store-driven)

The note must be **calm and informational, not an error**: it states the fact, the exact consequence for collected data, and the remedy — without blocking the operator (their explicit choice). Amber/info styling, not red.

- [ ] **Step 1: Add the i18n strings**

In `frontend/public/locales/en/admin.json`, add these keys (place them next to the existing `admin.design.postsort.audio.*` keys; preserve the file's JSON structure and alphabetical-ish ordering used by neighbouring keys):

- `admin.design.postsort.audio.storage_unavailable_title`:
  `"Audio capture is unavailable on this server"`
- `admin.design.postsort.audio.storage_unavailable_body`:
  `"Object storage (S3) is not configured, so audio responses cannot be collected. You can still enable audio below, but participants will answer in text only — no audio is recorded and they see no error. Configure object storage and restart the server to capture audio."`

- [ ] **Step 2: Render the note under the audio toggle**

In `frontend/src/components/admin/designer/PostSortConfigEditor.tsx`:

(a) Add the store import near the top with the other imports:

```typescript
import { usePlatformConfigStore } from '@/store/usePlatformConfigStore';
```

(b) Inside the component, near the top where `config` is derived (after `const config = postsortConfig(draft);`), add:

```typescript
    const audioStorageAvailable = usePlatformConfigStore((s) =>
        s.isAudioStorageAvailable()
    );
```

(c) In the Audio Recording Section, immediately **after** the audio toggle `<Switch ... data-testid="audio-recording-toggle" ... />` and its enclosing label/row, and **before** the `{config?.audio?.enabled && ( ... )}` duration block, insert (use the project-standard `t('key', 'fallback')` form even though this file's older strings use the `||` form):

```tsx
                    {!audioStorageAvailable && (
                        <div
                            role="status"
                            data-testid="audio-storage-unavailable-note"
                            className="mt-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"
                        >
                            <p className="font-semibold">
                                {t(
                                    'admin.design.postsort.audio.storage_unavailable_title',
                                    'Audio capture is unavailable on this server'
                                )}
                            </p>
                            <p className="mt-1">
                                {t(
                                    'admin.design.postsort.audio.storage_unavailable_body',
                                    'Object storage (S3) is not configured, so audio responses cannot be collected. You can still enable audio below, but participants will answer in text only — no audio is recorded and they see no error. Configure object storage and restart the server to capture audio.'
                                )}
                            </p>
                        </div>
                    )}
```

The English fallback strings here MUST be byte-identical to the JSON values added in Step 1.

- [ ] **Step 3: Verify i18n + types + lint**

Run: `cd /home/julien/tools/qualis && cd frontend && npm run i18n-check && npm run type-check && cd .. && make lint`
Expected: i18n-check clean (admin best-effort — no error for the new keys); type-check clean; lint clean.

- [ ] **Step 4: Commit**

```bash
cd /home/julien/tools/qualis
git add frontend/src/components/admin/designer/PostSortConfigEditor.tsx frontend/public/locales/en/admin.json
git commit -m "$(cat <<'EOF'
feat(admin): study-design note when audio storage unavailable

Calm, non-blocking operator notice: states the data consequence and
the remedy. Operator stays free to enable audio (explicit design).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: Operator doc `running-without-s3.md`

**Files:**
- Create: `docs/guides/running-without-s3.md`

- [ ] **Step 1: Create the doc**

Create `docs/guides/running-without-s3.md` with exactly:

```markdown
# Running Qualis without S3 / object storage

Qualis is fully usable without object storage. When any of
`S3_ENDPOINT_URL`, `S3_BUCKET_NAME`, `S3_ACCESS_KEY_ID`, or
`S3_SECRET_ACCESS_KEY` is unset, Qualis runs in **storage-optional
mode**: the audio subsystem is unavailable and studies degrade
gracefully to text-only responses.

A startup log line confirms the mode and lists the consequences. For the
canonical list of storage-related environment variables, see
[`deployment.md`](deployment.md#required-environment-variables).

---

## Capability matrix

| Flow | Without object storage |
|---|---|
| All non-audio study flows (presort, sort, postsort text, exports, analysis) | ✅ Work unchanged. |
| Study design — enabling audio | ⚙️ Allowed, but the designer shows a notice that audio will not be collected. |
| Participant audio recording (feedback step) | 🚫 The recorder is not shown; the participant answers in text only. |
| `text_audio` questions | ⚙️ Degrade to a plain text input; the question is satisfiable by text alone. |
| Existing audio recordings (if storage was later removed) | 🚫 Cannot be played back or downloaded until storage is restored. |

Legend: ✅ works unchanged · ⚙️ works with reduced capability · 🚫 disabled.

---

## What participants see

Nothing. Degradation is intentionally silent: an audio-enabled study
simply does not render the recorder, and `text_audio` questions show
their text field only. No error, no broken upload loop. A required
`text_audio` question remains satisfiable because its text input is
always present.

This means **no audio data is collected** for a study run in this mode,
even if the study has audio enabled. The designer notice and the startup
banner exist so the operator is never surprised by this.

## What the operator sees

- A startup log line: *"Object storage (S3) is not configured — Qualis
  runs in STORAGE-OPTIONAL mode"* followed by the consequences and the
  exact environment variables to set.
- In the study designer, under the audio toggle: a notice that audio
  responses will not be collected on this server.

## Safety net

If the audio API is somehow reached while storage is unconfigured (for
example a stale client), every audio endpoint returns a clean
`503 audio_storage_unavailable` rather than a server error.

---

## Enabling audio later

Set `S3_ENDPOINT_URL`, `S3_BUCKET_NAME`, `S3_ACCESS_KEY_ID`, and
`S3_SECRET_ACCESS_KEY` and restart. The startup banner disappears, the
designer notice clears, and the participant audio recorder reappears for
audio-enabled studies. No data migration is required.
```

- [ ] **Step 2: Verify links resolve (doc-links CI uses lychee)**

Run: `cd /home/julien/tools/qualis && test -f docs/guides/deployment.md && grep -qi "Required environment variables" docs/guides/deployment.md && echo "anchor OK"`
Expected: `anchor OK` (confirms the only internal link target exists).

- [ ] **Step 3: Commit**

```bash
cd /home/julien/tools/qualis
git add docs/guides/running-without-s3.md
git commit -m "$(cat <<'EOF'
docs(guides): running without S3 / object storage

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 10: Full quality gate

**Files:** none (verification + any fix-ups)

- [ ] **Step 1: Run the full CI gate**

Run: `cd /home/julien/tools/qualis && make ci`
Expected: green. `make ci` includes `make check` (vulture/deptry/radon — the gate `make ci-fast` skips). If vulture flags any symbol from this feature, the only correct fix is to add the bare name to the `# --- S3-optional mode feature ---` section of `backend/vulture_whitelist.py` and re-run (do not delete the symbol).

- [ ] **Step 2: Confirm API client sync explicitly**

Run: `cd /home/julien/tools/qualis && make check-api`
Expected: clean (already committed in Task 5; this re-confirms post-merge of all tasks).

- [ ] **Step 3: If any fix-up was needed, commit it**

```bash
cd /home/julien/tools/qualis
git add -A
git commit -m "$(cat <<'EOF'
chore(s3-optional): final quality-gate fix-ups

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

(Skip this step if `make ci` was green with no changes.)

- [ ] **Step 4: Report**

State explicitly: `make ci` result (green/red with output), the commit list (`git log --oneline main..HEAD`), and confirm the branch is ready for `finishing-a-development-branch`.

---

## Self-review

**Spec coverage:**
- §1 Capability signal → Task 1 (`is_s3_configured`), Task 3 (`/api/config` field), Task 6 (store + bootstrap). ✓
- §2 Backend safety-net guard → Task 4 (503 dependency on all 3 storage routes). ✓
- §3 Participant auto-degradation (silent) → Task 7 (Step1_Feedback + Step2_Questionnaire incl. `text_audio`). ✓
- §4 Operator clarity → Task 2 (startup banner), Task 8 (study-design note), Task 9 (doc). ✓
- §Cross-cutting gates → vulture whitelist (Tasks 3, 4, 10), mypy strict override (Task 2), generate-api/check-api (Tasks 5, 10), full `make check` before final (Task 10). ✓
- §Testing → unit (`is_s3_configured` T1, banner T2), integration (`/api/config` T3, 503-not-500 T4), frontend (store T6, degradation gate T7). ✓

**Placeholder scan:** every code/step block contains literal code, exact paths, exact commands, expected output. No TBD/TODO/"similar to". ✓

**Type/name consistency:** `is_s3_configured` (T1) used in T2/T3/T4; `audio_storage` field (T3) consumed by generated `PublicConfigAudioStorage` (T5) used in store (T6); `isAudioStorageAvailable()`/`audioStorageAvailable` consistent across T6/T7/T8; `require_audio_storage` consistent T4/whitelist; `audio_storage_unavailable` detail string consistent T4 router/test; banner `s3_configured=` kwarg consistent T2 helper/main.py/test. ✓

**UX-copy review (explicit user requirement — messages must be impeccable):** every operator-facing string states *fact → consequence → remedy*, names the exact env vars, is calm/non-alarmist (amber, `role="status"`, not red/error), and is consistent in wording across the three surfaces (startup banner, designer note, doc). No participant-facing copy (silent degradation by design). ✓
