# Threat Model — 2026-05-03 Comprehensive Security Audit

**Date:** 2026-05-03
**Audit codebase ref:** `fe4efd2b` (post-Wave-6 merge; Wave 7 scaffold).
**Methodology:** STRIDE per trust boundary, top-10 risk ranking weighted by
likelihood × impact, attack tree for the worst-case "exfiltrate all participant
data" scenario.

This document synthesises Waves 1-6. Every claim cites a Wave finding (`F-NN-NNN`)
or a `file:line` anchor in the codebase. It is intentionally narrow on scope —
items listed in §7 are out of band.

## 1. Actors

| Actor | Description | Trust | Example access patterns |
|---|---|---|---|
| **Anonymous internet** | Unauthenticated caller of the public API | none | `GET /api/study/{slug}`, `POST /api/register`, `POST /api/token`, `GET /api/admin/invitations/verify` |
| **Participant** | Holds a `session_token` (UUID) or a resume code; reaches the participant flow | low (data-subject only) | `POST /consent`, `PUT /save-draft`, `POST /audio/upload`, `POST /submit`, `DELETE /personal-data` |
| **Researcher member** | Authenticated user with `ProjectMember.role = member` on at least one project | medium (per-project) | All `/api/admin/studies/*` editor routes for member projects; cannot reassign roles |
| **Researcher owner** | Authenticated user with `ProjectMember.role = owner` on at least one project | medium-high (per-project) | All member routes + member-management + project deletion + invitations |
| **Super-admin** | `User.is_superuser = True` | high (limited surface) | `/api/admin/users`, `DELETE /api/admin/studies/{slug}` overlay; **no** automatic project membership |
| **Ops / SRE** | Holds Scalingo / Cellar credentials, log-sink access, DB shell | very high | Scalingo CLI, `psql`, S3 console, CI/CD secrets |
| **Attacker with stolen JWT** | Has lifted an access JWT (XSS, leaked log line, shared device) | bearer-of-token | Same surface as the impersonated user, until `password_changed_at` advances (F-03-010) |
| **Attacker with DB read access** | Has obtained a read-only DB credential or a leaked dump | very high (data plane only) | All tables; cannot write; **cannot decrypt JWTs without `SECRET_KEY`** |

## 2. Assets

| Asset | Sensitivity | Location | Who can access |
|---|---|---|---|
| Q-sort entries (research data) | medium | `qsort_entries` table; per-card `card_comment` may carry PII (F-05-003) | Researchers on owning project; bulk exporters |
| Audio recordings (biometric) | **high** (Art. 9 special-category) | S3 `audio/<sha-prefix>/...` (F-05-004), `audio_recordings` rows | Researchers with `editor+` on study; `storage_service` presigned URLs |
| Consent records | medium | `participants.consented_at`, `consent_hash`, `is_discarded`, `anonymised_at` | Same as Q-sort |
| Participant PII (hashed IP, UA-hash, draft_responses, presort/postsort) | **high** | `participants` row | Researchers on owning study; participant via `session_token` |
| `session_token` (122-bit UUID, bearer credential) | **high** | `participants.session_token`; in URLs and resume responses | Holder = participant; rotated on anonymisation |
| `resume_code` (`adj-noun-NNN`, ~9M entropy) | medium | `participants.resume_code`; emailed/displayed to participant | Holder; rate-limited at `30/min` per-IP + `10/hour` per-(slug,code) (F-06-001) |
| User passwords (bcrypt cost-12) | high | `users.hashed_password` | Set by user; verified server-side; never leaves backend |
| TOTP secrets / 2FA-email OTP | high | `users.totp_secret`; `twofa_email_otp_codes.code_hash` (bcrypt) | Per-user |
| **JWT signing key (`SECRET_KEY`)** | **critical** | env-var; HS256-symmetric; signs access JWTs **and** all email-link JWTs **and** invitation JWTs | Backend process only |
| **`IP_HASH_SALT`** | **critical** | env-var; SHA-256 input for IP, UA, audio-prefix hashes | Backend process only; rotation orphans every existing hash |
| S3 / Cellar credentials | critical | env-var (`CELLAR_*`) | Backend process; ops via Scalingo console |
| DB credentials (`DATABASE_URL`) | critical | env-var | Backend; ops; CI build (test DB only) |
| `app.audit` log stream | medium | operator log sink | Ops; downstream SIEM |
| Uvicorn access logs | medium (raw client IP — F-05-010) | operator log sink | Ops; documented as operator obligation #2 in GDPR memo |

## 3. Trust boundaries

```
        ┌────────────────────┐
        │ Anonymous internet │
        └─────────┬──────────┘
                  │ T1  (HTTPS, public)
                  ▼
        ┌────────────────────┐
        │  React SPA (CDN)   │
        └─────────┬──────────┘
                  │ T2  (HTTPS + CORS + CSRF-by-design via JWT bearer)
                  ▼
        ┌────────────────────────────────────┐
        │  FastAPI app (gunicorn + uvicorn)  │
        │  ┌──────────────────────────────┐  │
        │  │  Project A | Project B | …   │ ← T6 (logical, require_project_role)
        │  └──────────────────────────────┘  │
        └───┬─────────┬──────────┬───────────┘
            │ T3      │ T4       │ T5
            ▼         ▼          ▼
       ┌────────┐ ┌────────┐ ┌────────┐
       │  Postgres │ Cellar/S3 │  SMTP │
       └────────┘ └────────┘ └────────┘
```

- **T1: Internet ↔ SPA.** TLS at the Scalingo edge proxy. SPA served as static
  assets from `frontend/dist/` (nginx in self-hosted Dockerfile, Scalingo
  buildpack in production).
- **T2: SPA ↔ API.** HTTPS. Auth = `Authorization: Bearer <JWT>` for admin /
  authenticated routes; `session_token` in form/body/query for participant
  routes. CORS allow-list in `app.middleware.security`. Rate limiting per-IP
  via slowapi (`backend/app/limiter.py`); IP trusted only when peer is in
  `TRUSTED_PROXIES` (closed F-01-004).
- **T3: API ↔ Postgres.** Scalingo private network (or operator-controlled VPC).
  Async SQLAlchemy. No row-level security; multi-tenant isolation is enforced
  in-application by `require_project_role` / `check_*_permission` (T6 below).
- **T4: API ↔ S3 (Cellar).** HTTPS. Boto3 with creds from env. Audio uploads
  go through application validation (size cap, MIME magic-sniff F-06-005,
  `_hashed_audio_prefix` key construction F-05-004).
- **T5: API ↔ SMTP.** TLS where the operator configures it. `_send_or_log`
  in `utils/email.py` falls back to logging the body to stdout when
  `SMTP_HOST/USER/PASSWORD` are unset (dev convenience; documented).
- **T6: Member ↔ other-project (logical).** Single in-process boundary
  enforced by `require_project_role(role)` (header-keyed) and
  `check_project_permission` / `check_study_permission` (slug-keyed) in
  `backend/app/dependencies.py:170-293`. Wave 3 cross-tenant harness (95
  parametrised cases, `test_admin_idor_harness.py`, F-04-001) confirms this
  boundary holds across all 89 admin endpoints.

## 4. STRIDE per boundary

`n/a` cells are intentional — for example, **Tampering** at T1 is implausible
because the SPA bundle is served as immutable static assets and the integrity
of its dependencies is governed by the supply-chain controls in T2 (Wave 6).

### T1 — Internet ↔ SPA

| Threat | Description | Mitigation | Status | Reference |
|---|---|---|---|---|
| **S** Spoofing | Attacker hosts look-alike SPA at evil-qualis.example | TLS + edge-proxy cert + (operator) HSTS preload list | mitigated (operator) | SECURITY.md HSTS bullet |
| **T** Tampering | MITM modifies bundle in transit | TLS at edge | mitigated | infra |
| **R** Repudiation | n/a — anonymous tier | n/a | n/a | — |
| **I** Information disclosure | Frontend dependency CVE leaks data via XSS | DOMPurify pinned, `xlsx` accepted-risk (writes only), CSP headers | partial (CSP `style-src 'unsafe-inline'`) | F-01-013 deferred to 6b; F-02-005 |
| **D** Denial of service | CDN-level flood | Out of scope (operator infra) | n/a | §7 |
| **E** Elevation of privilege | XSS lifts JWT from `localStorage` | DOMPurify, CSP `script-src 'self'`, `frame-ancestors 'none'` | partial (style-src) | F-01-013, F-03-010 (post-XSS rotation) |

### T2 — SPA ↔ API

| Threat | Description | Mitigation | Status | Reference |
|---|---|---|---|---|
| **S** Spoofing | Forged JWT impersonates a user | HS256 + `SECRET_KEY` (env, refuses default in prod); `iss/aud` for email-link JWTs (`security.py:144-154`) | mitigated | F-03-010, SECURITY.md |
| **S** Spoofing | Forged `session_token` impersonates a participant | UUID4, 122 bits, unique-indexed, study-scoped lookup | mitigated | F-04-002, F-04-003, F-06-002 |
| **T** Tampering | Body tamper to elevate role / change ownership | Pydantic schemas + `OWNER_ROLE_IMMUTABLE` reject + project-scoped FKs | mitigated | F-04-001 (95 IDOR cases pass) |
| **R** Repudiation | User denies admin action | `app.audit` rows on every state-mutating admin path; participant self-erase emits `mode=participant_self` | mitigated | F-05-008 |
| **I** Information disclosure | Email enumeration via timing / body / status | Constant-time bcrypt across known/unknown arms; always-201 register response | mitigated | F-03-005/006/007, F-06-007 |
| **I** Information disclosure | Cross-tenant IDOR | `require_project_role` + `check_*_permission` + service-side ownership filters | mitigated | F-04-001, F-04-002, F-04-005 |
| **I** Information disclosure | Tokens in URLs leak via access logs / 5xx tracebacks | `log_scrub` filter on `uvicorn.access`, `app.middleware.errors`, `app.routers.logs`; regex `(token|otp|code)` IGNORECASE | mitigated | F-03-013, lint_logger_urls.py |
| **D** Denial of service | Brute-force / scrape | slowapi rate limits (30/min resume, 10/min withdraw, 60/min submit, 5/min /token, 3/hour /password/reset/request, 10/hour per-(slug,code) for resume) | mitigated for credential-grade endpoints | F-06-001, F-03-004 |
| **E** Elevation of privilege | Stolen JWT survives password change | `iat` claim + `password_changed_at` check on every request | mitigated | F-03-010 |
| **E** Elevation of privilege | OTP brute-force defeats 2FA | per-row `attempts ≥ 5`, 30s resend cooldown, **per-account 24h cap of 30 wrong attempts** (F-03-004) | mitigated | F-03-004 |
| **E** Elevation of privilege | Email change = account takeover from transient session | Dual-confirmation flow: confirm-link to NEW + cancel-link to OLD; `pending_email` parking | mitigated | F-03-011 |

### T3 — API ↔ Postgres

| Threat | Description | Mitigation | Status | Reference |
|---|---|---|---|---|
| **S** Spoofing | Attacker reaches DB directly | Private network at Scalingo; `DATABASE_URL` env-only | mitigated (operator) | SECURITY.md |
| **T** Tampering | SQL injection | SQLAlchemy ORM; only two `text(f"...")` sites with hardcoded literals (F-02-008/009 false positives) | mitigated | F-02-008, F-02-009 |
| **R** Repudiation | DB-side change unattributed | `app.audit` rows for application paths; DB-level audit out of scope | partial | §7 |
| **I** Information disclosure | DB read leak (backup, dump, support shell) | Hashed IP / UA / audio-prefix; bcrypt passwords; **not encrypted-at-rest at app layer** (operator-side EBS encryption) | partial (operator) | F-05-002, F-05-004, GDPR memo |
| **D** Denial of service | Connection exhaustion | gunicorn 2 workers × asyncpg pool; not specifically rate-limited at app | partial | §7 |
| **E** Elevation of privilege | Race in quota check creates extra owner | `cb2c7f6f0cfe` partial unique index `project_members_one_owner_per_project (project_id) WHERE role='owner'` | mitigated (DB-level) | Wave 3 inventory §migration |
| **E** Elevation of privilege | Member-quota TOCTOU | `assert_can_add_member` race window; impact bounded (default `MAX_MEMBERS_PER_PROJECT=0` = unlimited in OSS) | **deferred** | F-04-006 |

### T4 — API ↔ S3 (Cellar)

| Threat | Description | Mitigation | Status | Reference |
|---|---|---|---|---|
| **S** Spoofing | Forged S3 caller | IAM creds env-only; private bucket | mitigated (operator) | infra |
| **T** Tampering | Object overwrite (key collision) | Per-upload timestamped key + 122-bit prefix; idempotency at participant level | mitigated | F-05-004 |
| **R** Repudiation | Operator-side bucket activity unattributed | S3 access logs (operator); `app.audit` for delete attempts | partial (operator) | GDPR memo §c#5 |
| **I** Information disclosure | List-bucket leaks `study_slug` + `participant_token` | `_hashed_audio_prefix(slug, token, salt)` 32-char hex; metadata stripped | mitigated | F-05-004 |
| **I** Information disclosure | Presigned URL leakage | URLs minted in-handler after session-token auth check; default lifetime 1h | mitigated | F-04-003, audio.py |
| **D** Denial of service | Storage exhaustion | Per-study quota `max_storage_mb` (default 100MB); per-file `AUDIO_MAX_FILE_SIZE_MB` (default 10MB) | mitigated | audio.py:56-86 |
| **E** Elevation of privilege | Audio MIME spoof for stored XSS on playback | `magic.from_buffer` allowlist (`audio/webm`, `video/webm`, `audio/mp4`, `audio/mpeg`); sniffed MIME persisted (F-06-005) | mitigated | F-06-005 |

### T5 — API ↔ SMTP

| Threat | Description | Mitigation | Status | Reference |
|---|---|---|---|---|
| **S** Spoofing | Email spoofs Qualis sender | SPF/DKIM/DMARC at operator MX | n/a (operator) | §7 |
| **T** Tampering | Body modified in transit | TLS to SMTP relay (operator-configured) | mitigated (operator) | utils/email.py |
| **R** Repudiation | Email send unattributed | `app.audit` for password reset, 2FA disable, email-change events | mitigated | F-03-010 / F-03-011 |
| **I** Information disclosure | Plaintext OTP in email body | Inherent to email-channel 2FA; bounded by 5-min expiry, per-row attempts cap, per-account 24h cap | partial (channel-design) | F-03-004 |
| **I** Information disclosure | `_send_or_log` writes body to stdout on missing SMTP config | Dev/test convenience; production `is_smtp_configured` gate disables fallback | mitigated (config-gated) | utils/email.py:_send_or_log |
| **D** Denial of service | SMTP relay flood from attacker triggering issuance | Per-IP + per-email-hash 3/hour on `/password/reset/request`, `/email/verify/resend`, `/2fa/disable/request` | mitigated | auth.py:548, 580, 660 |
| **E** Elevation of privilege | Email-link replay (post-consume) | JTI denylist (2FA-disable); `email_verified_at` gate (verify); `pwa` round-trip (reset) | mitigated | F-03-001, F-03-002 |

### T6 — Member ↔ other-project (logical)

| Threat | Description | Mitigation | Status | Reference |
|---|---|---|---|---|
| **S** Spoofing | Forge `X-Project-ID` header | `get_current_project` joins `Project.id × ProjectMember.user_id`; missing membership → 403 | mitigated | dependencies.py:94-133 |
| **T** Tampering | Path-id manipulation (Pattern B) | Inline `concourse.project_id != project.id` checks; `_verify_concourse_ownership`; service-side `project_id` filter on tag/recruitment/memo | mitigated (B_VALID_HEADER pin-down) | F-04-001 §B_VALID_HEADER |
| **R** Repudiation | Member denies action on shared project | `app.audit` actor_user_id + role + resource | mitigated | F-05-008 |
| **I** Information disclosure | Cross-tenant read via 89 admin endpoints | 95-case parametrised harness, all pass | mitigated (regression-guarded) | F-04-001 |
| **I** Information disclosure | Recruitment-token replay across studies | `validate_link_token` pins `link.study_id == study_id` | mitigated | F-04-002 |
| **I** Information disclosure | Resume-code probed across studies | `WHERE resume_code = :code AND Study.slug = :slug` | mitigated | F-04-004 |
| **D** Denial of service | Member abuses bulk export | Editor+ role gate; per-IP rate limits; export streamed | partial | §7 |
| **E** Elevation of privilege | Multiple owners per project | `project_members_one_owner_per_project` partial unique index | mitigated (DB-level) | migration cb2c7f6f0cfe |
| **E** Elevation of privilege | Member self-promotion to owner | `OWNER_ROLE_IMMUTABLE` rejection on PATCH/invite; `role=owner` rejected at API | mitigated | projects.py:286, :449 |

**Cell totals across the 6 boundaries:** ~37 STRIDE entries filed.
Mitigated: 28. Partial: 6. Deferred / open: 1 (F-04-006). N/A or operator-side: 4.

## 5. Top-10 ranked risks

Ranked by **likelihood × impact** at the current commit. "Status" tracks whether
the dominant mitigation is shipped, partial, or deferred.

1. **Cross-tenant data access via IDOR.**
   *Likelihood: low (95-case harness passes; B_VALID_HEADER guards inline checks).
   Impact: very high (project A reads project B's participants).*
   Status: **mitigated** — F-04-001 harness is a CI regression guard. (T6, T2-I.)

2. **JWT theft + post-password-change validity.**
   *Likelihood: low-medium (XSS / leaked log line / shared device).
   Impact: high (8h account control after the user's primary remediation).*
   Status: **mitigated** by F-03-010 (`iat` + `password_changed_at` check).
   Refresh-token rotation deferred to **Wave 2b** — current 8h window is the
   residual exposure when the user has not yet rotated.

3. **OTP brute-force defeating email-channel 2FA.**
   *Likelihood: medium (attacker who already has password from breach).
   Impact: high (full account control bypassing 2FA).*
   Status: **mitigated** by F-03-004 (per-account 24h cap of 30 wrong attempts).

4. **Email-change account takeover.**
   *Likelihood: low (requires transient authenticated-session compromise).
   Impact: very high (silent permanent control transfer; reset/2FA-disable
   links land in attacker mailbox).*
   Status: **mitigated** by F-03-011 (dual-confirmation flow + `pending_email`).

5. **Email enumeration → targeted phishing campaign.**
   *Likelihood: high (rate-limited but `5/min`-per-IP scaling across IPs).
   Impact: medium (feeds downstream credential-stuffing).*
   Status: **mitigated** — F-03-005/006/007 (timing parity), F-06-007 / F-03-008
   (always-201 register).

6. **Audio S3 bucket-list re-identification.**
   *Likelihood: low (requires operator-side IAM mis-config).
   Impact: medium (key leaks `study_slug` + `participant_token`).*
   Status: **mitigated** by F-05-004 (hashed prefix + stripped metadata).
   Pre-existing rows retain legacy keys; orphan-sweep documented as operator
   obligation #5.

7. **Consent-text drift: pre-submission abandonment retains data.**
   *Likelihood: high (most participants close browser without explicit
   withdrawal). Impact: medium (consent-integrity / reputational).*
   Status: **mitigated (backend half)** by F-05-001 (`DELETE /draft`
   endpoint). Frontend "Start over" button + abandoned-draft sweeper are
   Wave 4b deferred.

8. **Member-quota TOCTOU race.**
   *Likelihood: very low (default cap = 0 = unlimited in OSS;
   only deployments with explicit cap are exposed).
   Impact: low (over-fill is bounded, recoverable, no billing/security
   boundary crossed).*
   Status: **deferred** — F-04-006. Recommended fix `SELECT … FOR UPDATE`
   on the project sentinel row.

9. **Supply-chain transitive dep regression.**
   *Likelihood: medium (transitive churn in the lockfile).
   Impact: medium-high (depends on the surface of the dep).*
   Status: **mitigated** — Wave 6 direct-pin promotion (`pygments`,
   `python-dotenv`, `requests`); pip-audit gate in `security-scans.yml`;
   Dependabot weekly cadence; SHA-pinned third-party GHA actions.

10. **Operator misconfiguration leaks at the log / S3 / SMTP layer.**
    *Likelihood: medium-high (operator-dependent: raw IP in `uvicorn.access`,
    no S3 lifecycle, missing scheduler for cleanup_consumed_email_tokens).
    Impact: medium (slow-burn re-identification or capacity issue).*
    Status: **partial** — F-05-010 (frontend_error IP hashed),
    F-03-003 (operator-side scheduler doc), F-05-005 (operator obligation).
    Documented in GDPR memo §c (8 obligations) and SECURITY.md hardening.

**Honourable mentions (not in top-10):**

- CSP `style-src 'unsafe-inline'` (F-01-013, deferred to Wave 6b — needs nonce
  refactor; XSS mitigated through DOMPurify + `script-src 'self'`).
- `card_comment` preserved through anonymisation (F-05-003 — operator
  screening obligation; not programmatically fixable).
- Cleartext OTP in 2FA email (channel-design constraint).

## 6. Worst-case attack tree

**Goal:** exfiltrate participant data across all projects on a Qualis deployment.

```
GOAL: dump every participants row + every audio object across all projects
│
├── A. Compromise the backend process (steal SECRET_KEY + DATABASE_URL + S3 creds)
│   │
│   ├── A.1 Server-side RCE via dependency
│   │   • exposure: minimal (FastAPI + Pydantic + SQLAlchemy fully patched)
│   │   • defence: pip-audit CI gate (Wave 6); Dependabot weekly; direct-pin floors
│   │
│   ├── A.2 Container escape
│   │   • exposure: backend USER=app (non-root) since F-02-006
│   │   • defence: F-02-006 closed; kernel CVE on host = operator infra concern
│   │
│   └── A.3 Ops credential theft (Scalingo dashboard, GH Actions secrets)
│       • defence: GH Actions third-party SHA-pinned (Wave 6); MFA on Scalingo
│         (operator obligation); §7 pen-test out of scope
│
├── B. Compromise a researcher account with broad project membership
│   │
│   ├── B.1 Phish researcher → password
│   │   ├── B.1.1 Reuse password across services + breach corpus
│   │   │   • defence: 2FA when enabled (F-03-004 caps brute-force at 30/24h)
│   │   ├── B.1.2 OTP-channel brute-force after password compromise
│   │   │   • defence: per-account 24h cap (F-03-004) → 0.003%/day
│   │   └── B.1.3 Phish 2FA-disable link
│   │       • defence: link is per-account, JTI-burned on first consume
│   │         (F-03-001), 15-min expiry
│   │
│   ├── B.2 Hijack a session (XSS / bearer-token leak / shared device)
│   │   ├── B.2.1 XSS payload through DOMPurified content
│   │   │   • defence: DOMPurify ^3.4.1 (closed F-01-005); CSP script-src 'self'
│   │   │   • residual: CSP style-src 'unsafe-inline' (F-01-013, deferred)
│   │   ├── B.2.2 Bearer JWT lifted from localStorage / log line
│   │   │   • defence: F-03-013 token-scrub regex IGNORECASE on (token|otp|code)
│   │   │     across uvicorn.access + app.middleware.errors + app.routers.logs;
│   │   │     30s leeway only (F-03-012)
│   │   │   • residual: 8h ACCESS_TOKEN_EXPIRE_MINUTES until owner rotates
│   │   │     password (F-03-010 then invalidates; refresh-token rotation
│   │   │     Wave 2b)
│   │   └── B.2.3 Email-change to attacker address from the hijacked session
│   │       • defence: F-03-011 dual-confirmation; cancel-link to OLD address
│   │
│   ├── B.3 Become owner via cross-tenant escalation
│   │   • defence: F-04-001 IDOR harness (95 cases pass);
│   │     OWNER_ROLE_IMMUTABLE rejects role=owner on PATCH/invite;
│   │     project_members_one_owner_per_project DB-level partial index
│   │
│   └── B.4 Bulk-export every owned project's participants
│       • outcome (post-compromise): legitimate scope of role = owner
│       • this is the actor model — defence is preventing B.1/B.2/B.3
│
├── C. DB-side read access (backup leak, support-shell over-privilege)
│   │
│   ├── C.1 Recover plaintext from hashed columns
│   │   • IPs / UAs / audio-prefix all SHA-256(salt+input); bounded preimage
│   │     space (~4B IPs) but per-deployment salt prevents rainbow tables
│   │   • defence: F-05-002 (UA hash), F-05-004 (audio-prefix hash); operator
│   │     obligation #1 — set IP_HASH_SALT
│   │
│   ├── C.2 Mint forged JWT from leaked SECRET_KEY (if shared backup)
│   │   • defence: SECRET_KEY in env-vars only; not in DB or S3
│   │
│   └── C.3 Leverage anonymisation gaps
│       • residual: qsort_entries.card_comment preserved (F-05-003);
│         operator screening obligation
│
└── D. S3-side read access (Cellar console, IAM key leak, lifecycle mis-config)
    │
    ├── D.1 List-bucket → reconstruct (study, participant) pairs
    │   • defence: F-05-004 hashed prefix; Metadata stripped to question only
    │
    ├── D.2 Direct GetObject on every audio key
    │   • outcome: voice recordings in cleartext (no app-layer encryption)
    │   • defence: bucket policy (operator); GDPR memo Art. 30 inventory
    │
    └── D.3 Orphan audio objects from anonymisation S3-failure path
        • defence: F-05-005 (operator obligation #5: monthly orphan sweep)
```

**Defence summary by branch.**
A is heavily mitigated through Wave 6 supply-chain gates and Wave 1 Dockerfile
hardening; the residual is operator infra (host kernel, Scalingo MFA). B is the
**most plausible exploit path**, and Waves 2 + 3 close every step that a single
PR can close: F-03-004 / F-03-005-007 / F-03-010 / F-03-011 / F-04-001 each
remove one rung. The residual on B.2.2 is the 8h JWT lifetime + Wave 2b
refresh-token deferral. C and D require operator-side compromise; the
application-layer hashing (IP, UA, audio prefix) bounds the damage of a
read-only data-plane breach. The qsort_entries.card_comment preservation
(F-05-003) is unfixable without NER and is documented as an operator
screening obligation.

## 7. Out-of-scope

This threat model does NOT cover:

- **Denial-of-service analysis** beyond the application rate-limiter inventory.
  Network-tier DoS, capacity-planning, and CDN/edge protection are operator
  concerns.
- **Penetration testing** of any production deployment. This is a code audit;
  no live targets were probed.
- **Cryptographic primitive review** (HS256, SHA-256, bcrypt cost-12). We rely
  on `pyjwt`, `bcrypt`, and the Python `hashlib` / `secrets` standard libraries
  being correct.
- **Hosted-deployment GDPR posture.** Qualis ships as self-hostable software;
  the operator is the data controller. The Wave 7 GDPR memo covers operator
  obligations but does not assess any specific deployment.
- **Frontend visual / UX security beyond what the scanners covered.** No design
  review of phishing-resistance copy, no a11y-driven security review.
- **Insider threat at the operator level.** A malicious ops/SRE has read access
  to env-vars, DB, and S3; this threat model accepts that and documents the
  hashing / audit-logging mitigations that bound the damage of a *non*-malicious
  operator who suffers a credential leak.
- **Browser-side participant device security.** A compromised participant
  device (keylogger, browser extension) is outside the trust boundary;
  participant consent text covers the "use a private device" guidance.

## 8. Glossary

- **Finding ID `F-NN-NNN`:** wave-prefixed identifier. `F-01-NNN` = 2026-04-25
  prior audit; `F-02-NNN` = Wave 1 scanner pass; `F-03-NNN` = Wave 2 auth-email;
  `F-04-NNN` = Wave 3 multi-tenant; `F-05-NNN` = Wave 4 consent; `F-06-NNN` =
  Wave 5 business-logic; `F-07-NNN` reserved for Wave 6 (unused — operational
  hardening).
- **Severity:** *blocker* (production-down or pre-auth RCE/PII leak),
  *major* (defeats a primary security control), *minor* (defence-in-depth or
  bounded-radius issue), *observation* (informational; pinned by regression
  test).
- **Status:** *closed* (fix shipped), *deferred* (fix scoped to a future wave),
  *partial* (one half closed), *n/a* (column / file no longer exists).
- **Pattern A / B / C** (Wave 3): A = project-scoped via path or header (single
  dependency); B = object-id-scoped (bespoke inline ownership check);
  C = top-level enumeration / superuser / unauth.
- **B_VALID_HEADER** (Wave 3): IDOR test variant where the attacker holds a
  valid `X-Project-ID` (their own project) but addresses a foreign object id
  in the path — pins the inline service guard, not just the dependency layer.
- **TOCTOU:** Time-Of-Check-To-Time-Of-Use race condition.
- **JTI:** JWT ID claim; uniquely identifies a token, used for denylist
  (`consumed_email_tokens`) — only the 2FA-disable flow uses JTI denylist;
  the other email-link JWTs use adjacent DB state for single-use semantics
  (F-03-002).
- **`pwa` claim:** `password_changed_at` encoded in microseconds in the
  password-reset JWT; mismatch on consume → token rejected (single-use by
  rotation).
- **Anti-enum bcrypt pad:** dummy `bcrypt` call on the no-such-user branch so
  both arms spend equal wall-clock; mitigates timing-based email enumeration.
- **`hash_ip` / `hash_user_agent` / `_hashed_audio_prefix`:** SHA-256 with
  per-deployment `IP_HASH_SALT`; truncated to 64 / 64 / 32 hex chars.
- **Anonymisation as Art. 17 endpoint:** Qualis treats
  `StudyDataService.anonymise_participant` (PII nulled, qsort preserved) as
  the legal endpoint of an individual erasure request, per GDPR Recital 26
  ("anonymous information ... does not relate to an identified or identifiable
  natural person"). Hard-deletion would lose research data the participant
  consented to contribute. Documented in F-05-009.
