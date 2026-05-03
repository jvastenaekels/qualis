# Audit Wave 2 — Auth-Email Flows — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Audit the auth-email flows added in v0.6.0 (JTI denylist, email-OTP for 2FA, log-scrubbing, password-reset / email-change / 2FA-disable token flows) for replay races, brute-force exposure, email enumeration, session-invalidation gaps, log leaks; remediate every blocker/major with an exploit script + fix + regression test; address the F-01-010 carry-over (JWT lifetime, refresh, revocation on password change).

**Architecture:** Findings discovered by static reading + targeted dynamic exploit scripts. Each finding ships in `03-auth-email-flows.md` with the canonical eight-field schema; blocker/major findings additionally ship an exploit script (PRE-FIX assertion fails on `main`, POST-FIX passes). Fixes land with regression tests under `backend/tests/security/wave_2/`. F-01-010 is the largest item — JWT refresh-token + password-change-revocation is a feature, not a patch.

**Tech Stack:** FastAPI router + SQLAlchemy async + asyncpg; pyjwt 2.12+; pyotp 2.9 (used elsewhere); pytest with `pytest-asyncio`; httpx for in-process exploit clients.

---

## Reference

- **Spec:** `docs/superpowers/specs/2026-05-03-comprehensive-security-audit-design.md` (Wave 2 section).
- **Prior wave:** `docs/audits/2026-05-03-comprehensive-security-audit/` (01-prior-findings-status.md, 02-scanner-pass.md, 99-action-backlog.md, .raw/README.md).
- **Carry-over:** **F-01-010** — JWT 8h lifetime, no refresh, no revocation on password change. Source `01-prior-findings-status.md#f-01-010`. Wave 2 fixes this, not just files it.

## Wave 2 scope (from spec)

Files in scope:

- `backend/app/services/email_token_consume_service.py` (36 lines) — JTI denylist (`is_jti_consumed`, `mark_jti_consumed`, `cleanup_consumed`).
- `backend/app/services/email_otp_service.py` (89 lines) — `issue_otp`, `verify_otp`, `invalidate_active_otps`.
- `backend/app/middleware/log_scrub.py` (44 lines) — `scrub_token_query`, `TokenLogScrubFilter`.
- `backend/app/routers/auth.py` (747 lines) — login, password-reset request/consume, email-change request/consume, 2FA setup/disable, OTP verify.
- `backend/db_migrations/versions/cb8732294475_add_auth_email_flows.py`.
- `backend/db_migrations/versions/fd88287d3f9b_fix_password_changed_at_default.py`.

Out of scope: TOTP/2FA app secret rotation (separate concern); recovery-codes flow (Wave 5 business logic if it surfaces).

## File Structure

**Created:**

- `docs/audits/2026-05-03-comprehensive-security-audit/03-auth-email-flows.md` — wave doc with Inventory + Findings + Resolved-since-prior + False-positives sections.
- `docs/audits/2026-05-03-comprehensive-security-audit/.raw/exploits/F-03-NNN.py` — one per blocker/major finding.
- `backend/tests/security/wave_2/__init__.py`
- `backend/tests/security/wave_2/test_jti_replay.py`
- `backend/tests/security/wave_2/test_otp_brute_force.py`
- `backend/tests/security/wave_2/test_email_enumeration.py`
- `backend/tests/security/wave_2/test_session_invalidation.py`
- `backend/tests/security/wave_2/test_email_change_dual_confirmation.py`
- `backend/tests/security/wave_2/test_clock_skew.py`
- `backend/tests/security/wave_2/test_log_scrub.py`
- (For F-01-010 fix:) `backend/app/services/refresh_token_service.py` and adjacent test files.
- (For F-01-010 fix:) `backend/db_migrations/versions/<hash>_add_refresh_tokens_and_session_revocation.py`.

**Modified (depending on findings):**

- `backend/app/services/email_token_consume_service.py` — add unique-constraint or atomic INSERT to close any replay race.
- `backend/app/services/email_otp_service.py` — add per-account daily attempt cap and/or per-IP rate limit on `issue_otp`.
- `backend/app/middleware/log_scrub.py` — broaden regex (case-insensitive, additional param names) and apply to non-uvicorn loggers if relevant.
- `backend/app/routers/auth.py` — uniform timing on enumeration-prone endpoints; password-change session-invalidation; email-change dual-confirmation if missing.
- `backend/app/core/config.py` — JWT lifetime / refresh / clock-skew settings (only if F-01-010 fix touches them).

**Branch:** `audit/2-auth-email-flows` off `main`.

---

## Task 1: Set up branch and Wave 2 scaffolding

**Files:**
- Create: `docs/audits/2026-05-03-comprehensive-security-audit/03-auth-email-flows.md`
- Create: `backend/tests/security/wave_2/__init__.py`

- [ ] **Step 1.1: Branch and worktree**

The controller creates the worktree before dispatch. From the worktree root:

```bash
git rev-parse --abbrev-ref HEAD
```

Expected: `audit/2-auth-email-flows`. If not, escalate.

- [ ] **Step 1.2: Create the wave doc skeleton**

Path: `docs/audits/2026-05-03-comprehensive-security-audit/03-auth-email-flows.md`

```markdown
# Wave 2 — Auth-Email Flows

**Date:** 2026-05-03
**Auditor:** Claude Opus 4.7
**Codebase ref:** commit `<HEAD short SHA>` of `audit/2-auth-email-flows`

## Scope

Files audited:
- `backend/app/services/email_token_consume_service.py`
- `backend/app/services/email_otp_service.py`
- `backend/app/middleware/log_scrub.py`
- `backend/app/routers/auth.py`
- migrations `cb8732294475_add_auth_email_flows.py`, `fd88287d3f9b_fix_password_changed_at_default.py`

Carry-over: F-01-010 (JWT lifetime + revocation).

## Inventory

_Filled by Task 2._

## Summary

| Severity | Count |
|----------|-------|
| blocker | 0 |
| major | 0 |
| minor | 0 |
| observation | 0 |

## Findings

_Populated as findings are filed by Tasks 3-9._

## F-01-010 — JWT lifetime + revocation (carry-over)

_Status section filled by Task 10._

## Resolved since prior

_Listed by Task 11 if any prior auth-related findings were closed by intervening commits._

## False positives — not filed

_Populated as appropriate._
```

- [ ] **Step 1.3: Create the test directory**

```bash
mkdir -p backend/tests/security/wave_2
touch backend/tests/security/wave_2/__init__.py
```

- [ ] **Step 1.4: Commit**

```bash
git add docs/audits/2026-05-03-comprehensive-security-audit/03-auth-email-flows.md \
        backend/tests/security/wave_2/__init__.py
git commit -m "$(cat <<'EOF'
audit(wave-2): scaffold auth-email flows wave

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Inventory the auth-email surface

**Files:**
- Modify: `docs/audits/2026-05-03-comprehensive-security-audit/03-auth-email-flows.md` (Inventory section).

This is orientation, not findings. A reader of the wave doc must be able to follow data through the system from a token's birth to its consumption without reading the source.

- [ ] **Step 2.1: Read the six scope files end-to-end.**

Use the `Read` tool. Capture, for each file:

- exported public functions and their preconditions/postconditions,
- the database tables touched and the unique constraints on them,
- the config values consulted (`settings.<NAME>`) and the env vars they map to.

Cross-reference: read `backend/app/models/user.py`, `backend/app/models/__init__.py` for `ConsumedEmailToken`, `TwoFAEmailOTPCode`, and the `password_changed_at` column on `User`. Read both migrations.

- [ ] **Step 2.2: Write the Inventory section**

Replace `_Filled by Task 2._` with subsections covering:

- **Token lifecycle** (one diagram or numbered list per token type: signup-confirmation, password-reset, email-change, 2FA-disable, 2FA-email-OTP). Each entry: where issued, claims it carries, where consumed, what consume side-effects produce.
- **JTI denylist** — table + unique constraint + cleanup window; usage sites enumerated.
- **OTP entropy + rate limits** — code length, attempt cap per row, resend cooldown, `issue_otp` endpoint rate limits (read `auth.py` for the `@limiter.limit(...)` decorator on the relevant route).
- **Log scrubbing** — regex pattern, loggers it applies to (and which it does not).
- **Session/JWT lifetime** — `settings.JWT_*` values, `password_changed_at` integration (or absence — if absent, this is a finding for Task 6).
- **Configuration table** — every `settings.<NAME>` consulted in scope files, with default value and env-var mapping.

Aim for 200-400 lines. Concise prose. No findings yet — those are Tasks 3-9.

- [ ] **Step 2.3: Commit**

```bash
git add docs/audits/2026-05-03-comprehensive-security-audit/03-auth-email-flows.md
git commit -m "$(cat <<'EOF'
audit(wave-2): inventory auth-email surface

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Verify JTI denylist replay-window race

**Files (depending on outcome):**
- Modify: `docs/audits/2026-05-03-comprehensive-security-audit/03-auth-email-flows.md` (Findings).
- Modify (if race exists): `backend/app/services/email_token_consume_service.py`, possibly the migration file or a new migration.
- Create (if blocker/major): `docs/audits/2026-05-03-comprehensive-security-audit/.raw/exploits/F-03-001.py`.
- Create: `backend/tests/security/wave_2/test_jti_replay.py`.

The `consumed_email_tokens` table holds `(jti, purpose, consumed_at)`. The current consume flow is:

```python
# pseudocode
if await is_jti_consumed(db, jti):
    raise ...
# ... consume side-effects (e.g., disable 2FA)
await mark_jti_consumed(db, jti, purpose)
await db.commit()
```

A concurrent attacker submitting two requests with the same JTI in rapid succession may both pass the `is_jti_consumed` check before either commits. Whether this is exploitable depends on (a) the unique constraint on `consumed_email_tokens.jti`, (b) transaction isolation level, (c) whether side-effects commit before the JTI mark.

- [ ] **Step 3.1: Read the consume call sites in `auth.py`**

```bash
grep -n 'mark_jti_consumed\|is_jti_consumed' backend/app/routers/auth.py
```

For each call site, identify: which side-effect runs (e.g., `user.totp_secret = None`), and the order of `mark_jti_consumed` vs side-effect vs commit.

- [ ] **Step 3.2: Check the migration for unique constraint**

```bash
grep -nE 'jti|UniqueConstraint|primary_key' backend/db_migrations/versions/cb8732294475_add_auth_email_flows.py
```

Expected: `jti` is the primary key OR has a unique constraint. If yes, a duplicate INSERT raises `IntegrityError` — the race is benign (both requests would attempt to mark, the second fails). If no, the race is real.

- [ ] **Step 3.3: Verify by exploit script**

Write `docs/audits/2026-05-03-comprehensive-security-audit/.raw/exploits/F-03-001.py`. The script:

1. Spins up the FastAPI app via `httpx.AsyncClient(transport=ASGITransport(app=app))`.
2. Creates a test user with 2FA enabled, mints a 2FA-disable token (use the same path the production code uses).
3. Fires N=20 concurrent `POST /auth/2fa/disable` requests with the same token using `asyncio.gather`.
4. Asserts: exactly 1 request succeeds (HTTP 200), 19 fail (HTTP 4xx).

PRE-FIX assertion: if more than 1 succeeds, the race is real → the script's assert fails on the unfixed code.
POST-FIX assertion: same script passes after the fix.

- [ ] **Step 3.4: If race exists, fix it**

Likely fix: add a unique constraint on `consumed_email_tokens.jti` if not present (new migration); or restructure the consume flow to `mark_jti_consumed` BEFORE side-effects, exploiting `IntegrityError` as the duplicate-detection signal.

```python
# proposed pattern
try:
    await mark_jti_consumed(db, jti, purpose)
except IntegrityError:
    raise HTTPException(400, "Token already consumed")
# ... side-effects only after mark succeeds
```

If a migration is needed:

```bash
cd backend && uv run alembic revision -m "add unique constraint on consumed_email_tokens.jti"
# inspect generated stub, fill in op.create_unique_constraint(...) and op.drop_constraint(...)
```

- [ ] **Step 3.5: Write the regression test**

Path: `backend/tests/security/wave_2/test_jti_replay.py`

```python
"""Regression test for F-03-001: JTI denylist replay-window race.

After the fix, concurrent consume requests against the same JTI must
result in exactly one success. Before the fix, multiple succeeded.
"""
from __future__ import annotations

import asyncio
import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app

# Test setup: build a user with 2FA enabled, mint a disable token. Use the
# existing test fixtures in backend/tests/conftest.py — do not invent a
# new fixture style.

@pytest.mark.asyncio
async def test_jti_concurrent_consume_only_succeeds_once(
    seed_user_with_2fa,  # define in conftest or local fixture
    twofa_disable_token,
) -> None:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        async def fire():
            return await client.post(
                "/api/auth/2fa/disable",
                json={"token": twofa_disable_token},
            )

        responses = await asyncio.gather(*[fire() for _ in range(20)])
        statuses = [r.status_code for r in responses]
        assert statuses.count(200) == 1, f"expected exactly 1 success, got {statuses}"
```

Adapt fixture names and request shape to whatever Qualis actually has — the exact endpoint may be `/api/auth/2fa/disable/consume` or similar. Read `auth.py` for the correct path.

- [ ] **Step 3.6: Add finding to wave doc**

Append a section under `## Findings` in `03-auth-email-flows.md` using this exact schema:

```markdown
### F-03-001 — JTI denylist replay-window race

- **Severity:** <blocker / major / minor / observation>
- **Audience:** [Prod] [SoftwareX]
- **Location:** `backend/app/services/email_token_consume_service.py:NN-NN`, `backend/app/routers/auth.py:NN`
- **Tool:** static analysis + dynamic exploit script
- **Observation:** <2-3 sentences>
- **Impact:** <what an exploit achieves; e.g., bypasses 2FA-disable's single-use guarantee>
- **Recommendation:** <one-line fix>
- **Effort:** S/M/L
- **Disposition:** fixed in this PR (commit `<sha>`) / deferred to Wave N / deferred to backlog (rationale)
- **Exploit script:** `.raw/exploits/F-03-001.py`
- **Regression test:** `backend/tests/security/wave_2/test_jti_replay.py::test_jti_concurrent_consume_only_succeeds_once`
```

If the static analysis showed the unique constraint already exists AND the consume flow is ordered correctly, the finding may be **observation** with disposition `false positive — the unique constraint guards the race`. Still file it with the same schema (audit-trail value).

- [ ] **Step 3.7: Run tests and commit**

```bash
make ci-fast
cd backend && .venv/bin/pytest tests/security/wave_2/test_jti_replay.py -v
cd ..
git add docs/audits/2026-05-03-comprehensive-security-audit/03-auth-email-flows.md \
        docs/audits/2026-05-03-comprehensive-security-audit/.raw/exploits/F-03-001.py \
        backend/tests/security/wave_2/test_jti_replay.py \
        backend/app/services/email_token_consume_service.py \
        backend/db_migrations/versions/  # only if new migration
git commit -m "$(cat <<'EOF'
fix(security): close JTI replay-window race in email-token consume flow

Closes F-03-001. <one paragraph rationale>.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

If no fix is needed (constraint already exists), the commit only adds the wave-doc section + regression test:

```bash
git add docs/audits/2026-05-03-comprehensive-security-audit/03-auth-email-flows.md \
        backend/tests/security/wave_2/test_jti_replay.py
git commit -m "$(cat <<'EOF'
test(security): document JTI replay-window race is closed by unique constraint

Files F-03-001 as observation; the existing unique constraint on
consumed_email_tokens.jti causes the second concurrent INSERT to raise
IntegrityError, closing the race.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: OTP brute-force entropy + rate-limit analysis

**Files:**
- Modify: `03-auth-email-flows.md` (Findings).
- Modify (likely): `backend/app/services/email_otp_service.py`, `backend/app/routers/auth.py`.
- Create: `.raw/exploits/F-03-002.py` (if blocker/major).
- Create: `backend/tests/security/wave_2/test_otp_brute_force.py`.

Pre-analysis (verified during plan-writing):

- 6-digit OTP → 10^6 entropy.
- 5 wrong attempts per code → invalidates the row.
- 30s `issue_otp` resend cooldown per account.
- Per-attacker-account brute-force rate over 24h, in the worst case where the attacker spins fresh codes every 30s and exhausts 5 attempts each: 2 codes/min × 60 min × 24 h × 5 attempts = **14,400 guesses/day**.
- Probability of guessing one of those 14,400 codes correctly: ~1.44%. Over a week: ~10%. **Major.**

Mitigation options (the implementer picks based on user-experience impact):

- Per-account daily attempt cap (e.g., 30 wrong attempts in 24h → lock account or step up to a stronger gate).
- Per-IP rate limit on `issue_otp` and `verify_otp` endpoints (slowapi; check `app.limiter`).
- Increase OTP entropy to 8 digits (10^8, 100x more cost).
- Combination: tighter resend cooldown (5 min instead of 30s) AND per-account daily cap.

- [ ] **Step 4.1: Read the OTP issue/verify endpoints**

```bash
grep -nE '/2fa/email|otp' backend/app/routers/auth.py | head -20
```

Identify: are these endpoints behind `@limiter.limit(...)`? What's the limit? Is the limit per-IP or per-user?

- [ ] **Step 4.2: Confirm the worst-case math against the actual code**

Verify the 30s cooldown by re-reading `issue_otp`. Verify the 5-attempt cap. If either is different from the plan's pre-analysis, recompute.

- [ ] **Step 4.3: Decide severity**

If the rate-limited daily-attack ceiling is below ~100 attempts/day (e.g., a stricter slowapi limit is in place that the pre-analysis missed) → **observation/minor**. If it's at the 14k level the pre-analysis estimated → **major**.

- [ ] **Step 4.4: Write the exploit script**

Path: `.raw/exploits/F-03-002.py`

The script does NOT actually try 14k codes (would be slow). It demonstrates the rate-limit gap by:

1. Issue an OTP.
2. Submit 5 wrong codes (exhaust attempts).
3. Issue another OTP.
4. Submit 5 wrong codes.
5. Loop N=20 times. Each iteration takes ~30s of wall-clock per the cooldown.
6. Assert: at no point does the server return 429 or otherwise lock the account.

PRE-FIX: 100 wrong attempts go through unimpeded → assertion fails (script exits 1 if a 429 was seen, exits 0 if not — invert based on the convention).

POST-FIX: After the per-account daily cap kicks in, the loop returns 429 → assertion passes.

For wall-clock budgets, allow `OTP_RESEND_COOLDOWN_SECONDS` to be patched to 1 second in the exploit's testing harness (use a fixture that overrides `settings.TWOFA_EMAIL_OTP_RESEND_COOLDOWN_SECONDS`).

- [ ] **Step 4.5: Implement the fix**

Recommended approach (escalate to user if you want a different one):

- Add per-account counter `wrong_otp_attempts_24h` (or a small table; or reuse `consumed_email_tokens` style with a TTL).
- After N wrong attempts in 24 h (e.g., N=30), `verify_otp` returns 429.
- Add per-IP rate limit on `POST /api/auth/2fa/email/issue` (slowapi) — e.g., 10/hour. Existing `app.limiter` setup will tell you the conventional rate-limit syntax.

If the implementer judges that one of these mitigations is enough (e.g., a strict per-IP rate limit alone is sufficient), document the rationale in the finding. Don't over-engineer.

- [ ] **Step 4.6: Regression test**

Path: `backend/tests/security/wave_2/test_otp_brute_force.py`

```python
"""F-03-002 regression: OTP brute-force is rate-limited per account or per IP.

Without the fix, an attacker can issue ~2,880 fresh codes per day per
account, each with 5 attempt slots = ~14,400 guesses → ~1.4% daily
success against 6-digit entropy.

After the fix, repeated wrong attempts trigger a 429 / lockout.
"""
from __future__ import annotations

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app

@pytest.mark.asyncio
async def test_otp_brute_force_is_capped(seed_user_with_2fa_email, monkeypatch) -> None:
    # patch resend cooldown to 0 to compress wall-clock
    monkeypatch.setattr("app.core.config.settings.TWOFA_EMAIL_OTP_RESEND_COOLDOWN_SECONDS", 0)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        for cycle in range(20):
            issue = await client.post("/api/auth/2fa/email/issue", json={...})
            for _ in range(5):
                v = await client.post("/api/auth/2fa/email/verify", json={"code": "000000"})
                if v.status_code == 429:
                    return  # locked — pass
        pytest.fail("OTP brute-force was not rate-limited after 100 wrong attempts")
```

- [ ] **Step 4.7: File finding + commit**

Append `### F-03-002` section to `03-auth-email-flows.md` per the schema. `make ci-fast` green. Commit on its own.

---

## Task 5: Email enumeration via timing / response differential

**Files:**
- Modify: `03-auth-email-flows.md` (Findings).
- Modify (if findings): `backend/app/routers/auth.py` (uniform timing + response shape on enumeration-prone endpoints).
- Create: `.raw/exploits/F-03-003.py` (if any blocker/major).
- Create: `backend/tests/security/wave_2/test_email_enumeration.py`.

Endpoints to test:

- `POST /api/auth/login` — does response body or status differ for `(unknown email)` vs `(known email, wrong password)` vs `(known email, correct password, 2FA pending)`?
- `POST /api/auth/password-reset/request` — does it return `{ok: true}` regardless of whether the email exists, or does it respond differently?
- `POST /api/auth/email-change/request` — same question; also: does it leak whether the *new* email is already registered to another user?

Timing channels: even if the response body is uniform, async DB lookup costs differ. A user-found path runs `bcrypt.checkpw` (~100ms), a user-not-found path skips it. This is detectable with N=100 timing samples per arm.

- [ ] **Step 5.1: Black-box test each endpoint**

Use `httpx` against `app` (in-process). For each endpoint and each arm, send N=100 requests, measure mean+stddev of `r.elapsed`.

- [ ] **Step 5.2: Identify which endpoints leak**

Three categories:

- **Body leak** — different status code or visible body field (`"email already registered"` vs `"check your email"`). High-severity, easy to file.
- **Timing leak ≥50ms mean delta** — likely meaningful in a network attack. Major.
- **Timing leak <20ms** — likely network noise. Observation, defer.

- [ ] **Step 5.3: Fix**

For body leaks: return identical response on success or no-such-user. The standard pattern is `{"ok": true}` with no detail.

For timing leaks: `bcrypt.checkpw` against a fixed dummy hash when the user is not found, so both arms run a hash. Already used for login? Read `auth.py`'s login handler to check.

- [ ] **Step 5.4: Regression test**

Path: `backend/tests/security/wave_2/test_email_enumeration.py`

Test each endpoint × each arm × assert response body equality and (for timing) mean-delta < 30ms over N=20 samples in CI.

- [ ] **Step 5.5: File finding + commit**

One finding per endpoint with a leak (likely 1-3 findings).

---

## Task 6: Session invalidation when `password_changed_at` advances

**Files:**
- Modify: `03-auth-email-flows.md`.
- Modify (likely — this is a known gap from F-01-010): `backend/app/utils/security.py` (JWT decode/validate path), `backend/app/dependencies.py` (`get_current_user`).
- Create: `.raw/exploits/F-03-004.py` (if blocker/major).
- Create: `backend/tests/security/wave_2/test_session_invalidation.py`.

The user model has a `password_changed_at` column. JWT access tokens issued BEFORE that timestamp should be rejected after a password change. If they aren't, a stolen token remains valid for 8h regardless of password reset.

- [ ] **Step 6.1: Read the JWT validation path**

```bash
grep -nE 'password_changed_at|iat|jwt.decode' backend/app/utils/security.py backend/app/dependencies.py
```

If `iat` is checked against `user.password_changed_at` → already enforced. Otherwise, finding.

- [ ] **Step 6.2: Exploit script**

`.raw/exploits/F-03-004.py`:

1. Login user, capture access token.
2. Change password via `/api/auth/password-change`.
3. Submit a request to a protected endpoint with the **old** access token.
4. Assert: response is 401 (rejected). PRE-FIX: returns 200.

- [ ] **Step 6.3: Fix**

Add to JWT validation:

```python
if token.iat < int(user.password_changed_at.timestamp()):
    raise InvalidTokenError("token issued before password change")
```

Test forward-compat: tokens with `iat == password_changed_at` (i.e., issued in the same second) — accept or reject? Depends. Default to >= (accept). Document in the finding.

- [ ] **Step 6.4: Regression test, commit.**

This is one of the F-01-010 carry-over's two halves (the other is JWT lifetime + refresh token, addressed in Task 10).

---

## Task 7: Email-change dual confirmation

**Files:**
- Modify: `03-auth-email-flows.md`.
- Modify (likely): `backend/app/routers/auth.py` (email-change request/consume routes).
- Create: regression test at `backend/tests/security/wave_2/test_email_change_dual_confirmation.py`.

Account takeover scenario: attacker temporarily owns the user's account (e.g., via a stolen access token). They request an email change to their own address. If only the NEW address receives a confirmation, the attacker locks the legitimate user out. The mitigation is to send a **notification** (not a confirmation) to the OLD address with a 24h "this was you?" cancel link.

- [ ] **Step 7.1: Read the email-change flow in `auth.py`.**

Identify: where is the confirmation sent? Is it only to the new address, or also to the old address?

- [ ] **Step 7.2: If only the new address receives anything**, file the finding.

Severity: minor (account takeover requires an already-compromised account; this is defence-in-depth).

- [ ] **Step 7.3: Implement**

Add a "cancellation" token sent to the old address whenever an email-change request is initiated. Token expires after 24h. Endpoint: `GET /api/auth/email-change/cancel?token=...` rejects the pending change.

- [ ] **Step 7.4: Regression test + commit.**

---

## Task 8: Clock-skew tolerance on token expiry

**Files:**
- Modify: `03-auth-email-flows.md`.
- Modify (likely): `backend/app/utils/security.py` (jwt.decode call sites).
- Create: `backend/tests/security/wave_2/test_clock_skew.py`.

PyJWT's `jwt.decode` accepts a `leeway` parameter for clock skew. If unset (default 0), tokens are rejected the moment `now > exp`. In multi-server deploys, ±10s skew between issuer and verifier is normal; tighter than that risks false rejections. Wider than ~60s widens the replay window.

- [ ] **Step 8.1: Audit `jwt.decode` call sites**

```bash
grep -n 'jwt.decode' backend/app/
```

For each: is `leeway=` passed? Is it consistent across call sites?

- [ ] **Step 8.2: Recommendation**

Settle on a single value (recommend 30s) and ensure every `jwt.decode` uses it. Add a thin wrapper in `app/utils/security.py` if call sites currently call `jwt.decode` directly.

- [ ] **Step 8.3: Regression test**

Test: a token issued at `now`, verified at `now + exp + 5s`, with `leeway=30s` → passes. With `leeway=0` → fails. Assert the configured leeway via the wrapper.

- [ ] **Step 8.4: File finding + commit.**

Severity: usually `observation` (operational hygiene) unless the audit finds a >120s leeway that's actually risky.

---

## Task 9: Log-scrub regex coverage

**Files:**
- Modify: `03-auth-email-flows.md`.
- Modify (likely): `backend/app/middleware/log_scrub.py`.
- Create: `backend/tests/security/wave_2/test_log_scrub.py`.

Pre-analysis (verified during plan-writing): the current regex is `([?&])([Tt]oken)=[^&]*`. It misses:

- `?TOKEN=...` (all caps).
- `?otp=...`, `?code=...` and other parameter names that may carry secrets (password-reset emails could conceivably link to `?otp=...` although current code uses `token=`).
- URL fragments (`#token=...`) — fragments aren't logged in path-with-query, so this is OK.
- Application-level loggers (sentry, app/middleware error log). The filter only attaches to `uvicorn.access`.

- [ ] **Step 9.1: Build a synthetic-log corpus**

```python
CORPUS = [
    ("/api/auth/email-change/consume?token=eyJhbGc...", "REDACTED"),  # current pattern
    ("/api/auth/email-change/consume?TOKEN=eyJhbGc...", "REDACTED"),  # missed today
    ("/api/auth/2fa/email/verify?code=123456", "REDACTED"),           # missed today
    ("/api/auth/password-reset/consume?token=A&also=B", "REDACTED&also=B"),  # multi-param
    ("/api/auth/2fa/email/verify?otp=987654", "REDACTED"),            # missed today
    # negative cases — no scrub
    ("/api/foo?bar=baz", "/api/foo?bar=baz"),
    ("/api/study/123", "/api/study/123"),
]
```

- [ ] **Step 9.2: Test that current code fails on the missed cases.**

This is the PRE-FIX assertion. Each missed case is a finding (or one finding with multiple sub-cases listed).

- [ ] **Step 9.3: Broaden the regex**

```python
_TOKEN_RE = re.compile(r"([?&])(token|otp|code)=[^&]*", re.IGNORECASE)
```

Run the corpus again. POST-FIX: all expected outputs match.

- [ ] **Step 9.4: Audit application logger coverage**

Search for places where a token might be logged from application code (not just uvicorn.access):

```bash
grep -rnE 'logger\.\w+\(.*\?token' backend/app/
grep -rnE 'logger\.\w+\(.*url' backend/app/
```

If any application logger emits a path-with-query in a way that bypasses the scrub filter, file a sub-finding and either (a) attach the scrub filter to the application logger too, or (b) refactor the call site to log the path without the query string.

- [ ] **Step 9.5: Regression test**

`backend/tests/security/wave_2/test_log_scrub.py` — test `scrub_token_query` against the corpus.

- [ ] **Step 9.6: File finding + commit.**

Severity: minor (defence-in-depth; URL tokens shouldn't be logged at all but this is the second line of defence).

---

## Task 10: F-01-010 carry-over — JWT lifetime + refresh + revocation

This is the largest task in Wave 2. **It is a feature implementation, not a patch.** Estimate: 1-2 days. If the implementer judges it's >2 days, they STOP and escalate — splitting it into a Wave 2b PR is acceptable.

**Files:**
- Modify: `03-auth-email-flows.md` (F-01-010 section).
- Create: `backend/app/services/refresh_token_service.py`.
- Modify: `backend/app/utils/security.py`, `backend/app/dependencies.py`, `backend/app/routers/auth.py`.
- Modify: `backend/app/core/config.py` (new `JWT_REFRESH_*` settings).
- Create: `backend/db_migrations/versions/<hash>_add_refresh_tokens.py`.
- Create: `backend/tests/security/wave_2/test_refresh_token_flow.py`.
- Modify: `frontend/src/api/` (regenerate via `make generate-api`).
- Modify: `frontend/src/store/` (refresh-token storage and rotation).

Three sub-deliverables:

### 10A: Refresh-token model

Schema: `refresh_tokens(id PK, user_id FK, token_hash, issued_at, expires_at, revoked_at, parent_id)`. The `parent_id` enables refresh-token rotation: each new refresh token records its parent; if a refresh token is presented and its parent is also being used, that's evidence of theft → revoke the entire chain.

Migration adds the table. Service module wraps issue / rotate / revoke.

### 10B: Token-issuance changes

Login response shape changes from `{access_token}` to `{access_token, refresh_token}`. Access token lifetime drops from 8h to 15min. Refresh token lifetime is 14 days, rotates on each use.

`POST /api/auth/refresh` — accepts a refresh token, returns a new access+refresh pair, marks the old refresh as rotated.

`POST /api/auth/logout` — revokes the refresh-token chain.

### 10C: Revocation on password change

When `password_changed_at` advances, all refresh tokens for that user are marked revoked. Combined with Task 6's access-token-iat check, this forces re-login across all devices.

### Procedure

- [ ] **Step 10.1: Design check.**

Before writing any code, the implementer reads relevant existing patterns:

- `backend/app/services/email_token_consume_service.py` (similar revocation table pattern).
- `backend/app/utils/security.py` (current JWT issuance).
- Existing auth endpoints in `backend/app/routers/auth.py`.

If the design doesn't fit the codebase's patterns, escalate before continuing.

- [ ] **Step 10.2: Migration.**

```bash
cd backend && uv run alembic revision -m "add refresh tokens table"
```

Edit the generated stub. Schema:

```python
op.create_table(
    "refresh_tokens",
    sa.Column("id", sa.UUID(), primary_key=True, server_default=sa.text("gen_random_uuid()")),
    sa.Column("user_id", sa.UUID(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
    sa.Column("token_hash", sa.String(255), unique=True, nullable=False),
    sa.Column("issued_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
    sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
    sa.Column("parent_id", sa.UUID(), sa.ForeignKey("refresh_tokens.id", ondelete="CASCADE"), nullable=True),
)
op.create_index("ix_refresh_tokens_user_id", "refresh_tokens", ["user_id"])
```

Verify: `make migrate` against a clean DB succeeds; `alembic downgrade -1` then `alembic upgrade head` round-trip is clean.

- [ ] **Step 10.3: Service module.**

Path: `backend/app/services/refresh_token_service.py`

Functions:

- `async def issue_refresh_token(db, user, parent: RefreshToken | None = None) -> tuple[str, RefreshToken]` — generates the plaintext, stores hash, returns plaintext.
- `async def rotate_refresh_token(db, presented: str, user_id: UUID) -> RefreshToken | None` — verifies presented hash, marks current as rotated, issues child. Returns None on theft (presented twice).
- `async def revoke_chain(db, root: RefreshToken) -> None` — marks the root and all descendants revoked.
- `async def revoke_all_for_user(db, user_id: UUID) -> int` — used by password-change.

Each function fully type-annotated; module is added to the strict-mypy override list in `backend/pyproject.toml` per Qualis convention.

- [ ] **Step 10.4: Endpoints.**

Modify `backend/app/routers/auth.py`:

- Login: return `{access_token, refresh_token}`.
- Add `POST /api/auth/refresh`.
- Add `POST /api/auth/logout` (revokes presented refresh).
- Modify `POST /api/auth/password-change`: after success, call `revoke_all_for_user`.

Update OpenAPI by running `make generate-api`. The `frontend/src/api/` client regenerates.

- [ ] **Step 10.5: Frontend integration.**

Modify the auth Zustand slice / api wrapper to:

- Store the refresh token (HttpOnly cookie OR same secure-storage pattern Qualis already uses; check existing code).
- On 401 with `code: "access_token_expired"`, call `/auth/refresh` and retry the original request.
- On `/auth/refresh` failure, redirect to login.

- [ ] **Step 10.6: Tests.**

`backend/tests/security/wave_2/test_refresh_token_flow.py` covers:

- Login returns both tokens.
- Refresh rotates: old refresh becomes invalid, new pair issued.
- Theft detection: presenting the same refresh twice revokes the chain.
- Password change revokes all refresh tokens for the user.
- Access tokens issued before `password_changed_at` are rejected (covers Task 6 too).
- Refresh-token expiry honoured.

Frontend: add a vitest test for the api wrapper's auto-refresh path.

- [ ] **Step 10.7: Make ci, commit, write up.**

This change touches many files. Make multiple commits if natural breakpoints exist (model+migration, then service+endpoints, then frontend, then tests). If you split, each commit must independently pass `make ci-fast`.

Update `03-auth-email-flows.md`'s F-01-010 section with status `closed`, fix-commit list, and a one-paragraph design summary.

---

## Task 11: Update action backlog

**Files:**
- Modify: `docs/audits/2026-05-03-comprehensive-security-audit/99-action-backlog.md`.

- [ ] **Step 11.1: For each F-03-NNN finding, mark closed/deferred under `## Wave 2`** (currently has only the F-01-010 carry-over bullet; replace with full Wave 2 list).

- [ ] **Step 11.2: Mark F-01-010 as `closed` in commit `<sha>`.**

- [ ] **Step 11.3: If any finding was deferred (e.g., a tiny timing leak), add it to `## Deferred items`.**

- [ ] **Step 11.4: Commit.**

---

## Task 12: Final CI run, push, and open PR

- [ ] **Step 12.1: `make ci` green.**

- [ ] **Step 12.2: Push.**

```bash
git push -u origin audit/2-auth-email-flows
```

- [ ] **Step 12.3: Open PR titled `audit(wave-2): auth-email flows deep dive + F-01-010 fix`**, with body summarising findings counts, the F-01-010 redesign, and the test plan.

- [ ] **Step 12.4: Report PR URL.**

---

## Per-finding-task discipline

Tasks 3-9 each follow the same shape:

1. Static read of in-scope code.
2. Dynamic exploit script (skipped only if static read confirms no issue).
3. Severity decision per the wave-doc schema.
4. Fix (if blocker/major/minor with clear remediation).
5. Regression test under `backend/tests/security/wave_2/`.
6. Finding writeup in `03-auth-email-flows.md`.
7. Commit.

If the static read shows no issue: file as **observation** with disposition `false positive — <rationale>`. Do not write an exploit script for non-issues.

If the static read shows an issue but the fix is non-trivial (>1 day) and not on the critical path: file as **major/minor**, defer the fix to a follow-up Wave 2b PR, and add a backlog entry. Note this in the wave doc.

## Code-reviewer gate

After Task 12 lands the PR, dispatch `superpowers:code-reviewer` (Opus) per the spec. Brief: the wave doc, the diff, all exploit scripts, all regression tests, and an explicit ask to look for missed-propagation bugs in the auth flow (e.g., did the JWT-validation change skip a route?).

## Stop criteria

- Task 10 (F-01-010 fix) tripling its initial estimate → pause and check with user.
- Any finding that requires breaking schema migrations beyond the refresh-tokens table → backlog with rationale, not in-session.
- An exploit script that requires a live external service (real SMTP, real S3) → mock or skip, do not block on infra.

## Out of scope

- TOTP / authenticator-app 2FA secret rotation (separate concern, not in v0.6.0 surface).
- Recovery-codes flow (Wave 5 if it surfaces issues).
- WebAuthn / passkeys (future feature).
- Account lockout policy beyond OTP brute-force (Wave 5).

---

## Self-Review

Spec coverage check (against `2026-05-03-comprehensive-security-audit-design.md`, Wave 2 section):

- ✅ JTI denylist replay-window race → Task 3.
- ✅ OTP brute-force: rate-limit + entropy → Task 4.
- ✅ Email enumeration via response differential / timing → Task 5.
- ✅ Session invalidation when `password_changed_at` advances → Task 6.
- ✅ Email-change confirmation on both old and new addresses → Task 7.
- ✅ Clock-skew tolerance on token expiry → Task 8.
- ✅ Log-scrub regex coverage against synthetic-log corpus → Task 9.
- ✅ F-01-010 carry-over (JWT lifetime + refresh + revocation) → Task 10.
- ✅ Code-reviewer (Opus) gate before merge → "Code-reviewer gate" section.
- ✅ Per-wave PR contents (wave doc, exploits for blocker/major, regression tests, action backlog updated, `make ci` green) → Tasks 11, 12.

Naming consistency: finding IDs use `F-03-NNN` for new findings (third axis after F-01 prior + F-02 scanner pass). This is consistent with the spec's "finding IDs continue the prior convention: F-<axis>-<seq>" rule.

Placeholder scan: `<HEAD short SHA>`, `<sha>`, `<NN-NN>` are designed-in slots filled at commit time. The `<one paragraph rationale>` markers are commit-message prompts to the implementer, not unfilled plan content. No "TODO", "TBD", or "implement later" present.

Edge cases noted: replay-race may already be closed by a unique constraint (Task 3 documents both branches). OTP brute-force severity depends on whether existing slowapi limits are tight (Task 4 step 4.3 is the decision point). Email-enumeration findings may be 0-3 depending on how many endpoints leak. F-01-010 may need a Wave 2b split if it grows (Task 10's stop criterion).

---

## Execution Handoff

**Plan complete. Two execution options:**

**1. Subagent-Driven (recommended)** — fresh subagent per task, two-stage review between tasks, fast iteration.

**2. Inline Execution** — execute tasks in this session with checkpoints.

**Which approach?**
