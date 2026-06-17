# GDPR memo for Qualis self-hosters

**Date:** 2026-05-03
**Audit ref:** comprehensive security audit, 2026-05-03 (dossier kept outside this repository)
**Status:** Reference document for operators deploying Qualis. Not legal advice.

> **About this document.** Qualis is open-source software. The
> *operator* (the institution running a Qualis instance) is the
> **GDPR data controller** for participant data; Qualis maintainers
> are the **software vendor**, not a processor. This memo documents
> the controls the software provides, so the operator can drop the
> relevant sections into their own DPIA and DPA. Where we cite a
> finding ID (`F-NN-NNN`), the underlying analysis lives in the
> wave document referenced in the Appendix.

---

## 1. Roles

| Party | GDPR role | What they do |
|---|---|---|
| **Operator** | **Data controller** (Art. 4(7)) | Runs the Qualis instance; defines processing purposes; responds to data-subject requests; signs DPAs with sub-processors. |
| **Qualis maintainers** | **Software vendor** (NOT processor) | Ship the codebase, security advisories, and release notes. Do not handle participant data; have no production credentials on any operator's deployment. |
| **Hosting provider** (Scalingo, AWS, Azure, on-prem datacentre…) | **Processor** for the infrastructure layer | Operator must sign a DPA. Verify data-residency claims before deployment. |
| **S3 / object-storage provider** (Cellar, AWS S3, MinIO…) | **Processor / sub-processor** | Holds audio recordings (Art. 9 special-category when audio is enabled). DPA + region pinning required. |
| **SMTP provider** (institutional MX, SendGrid, AWS SES…) | **Processor / sub-processor** | Carries password-reset, email-verify, 2FA-disable, email-change, and recruitment-link bodies. DPA + DKIM/SPF/DMARC at the operator's MX. |
| **Researcher members** of the operator institution | Authorised users of the controller | Per-project access via `ProjectMember.role`. Subject to the operator's internal access policy. |

**Key consequence.** No traffic flows through any Qualis-maintainer-operated
endpoint at request time (`SECURITY.md:54`). The maintainers cannot subpoena
or intercept participant data because they never see it. This is not a
contractual claim — it is a property of the self-hosted-by-design architecture.

---

## 2. Data flows

### 2.1 Participant journey

```
Participant arrives → consent → drafts in-flight → submission → researcher reporting
                                                              ↘ (researcher option)
                                                                discard / anonymise / erase
```

### 2.2 Trust-boundary diagram

```
        ┌────────────────────┐
        │ Anonymous internet │
        └─────────┬──────────┘
                  │ T1  HTTPS, public
                  ▼
        ┌────────────────────┐
        │  React SPA (CDN)   │
        └─────────┬──────────┘
                  │ T2  HTTPS + JWT bearer (admin) / session_token (participant)
                  ▼
        ┌────────────────────────────────────┐
        │  FastAPI app (gunicorn + uvicorn)  │
        │  ┌──────────────────────────────┐  │
        │  │  Project A | Project B | …   │ ← T6 require_project_role
        │  └──────────────────────────────┘  │
        └───┬─────────┬──────────┬───────────┘
            │ T3      │ T4       │ T5
            ▼         ▼          ▼
       ┌────────┐ ┌────────┐ ┌────────┐
       │  Postgres │ Cellar/S3 │  SMTP │
       └────────┘ └────────┘ └────────┘
```

### 2.3 Critical edges the operator must understand

1. **Hashed-IP edge.** Raw IP → SHA-256(salt+IP) at the service-layer entry
   point (`backend/app/services/submission_service.py:53` via `hash_ip()`).
   *Caveat:* Uvicorn's access-log line precedes the hash and contains the raw
   IP. See operator obligation §6.4.
2. **Free-text edge.** `card_comment`, `presort_answers`, `postsort_answers`,
   `draft_responses`, `discard_reason` are participant- or researcher-supplied
   free text. Anonymisation clears the participant-side blobs but **preserves
   `card_comment`** as research data (F-05-003). Researchers must screen
   before publication.
3. **Follow-up edge.** The "exception for follow-up" promised in the consent
   text is implemented as a join through
   `presort_answers["_recruitment_token"] = recruitment_links.email`. There is
   **no automatic teardown.** The operator must (a) anonymise the participant
   and (b) delete the recruitment link when the follow-up phase ends.
4. **S3 edge.** Audio uploads carry a hashed prefix
   (`audio/<sha256(slug|token|salt)[:32]>/...`, F-05-004). Pre-anonymisation,
   anyone with bucket-list permission cannot correlate to a participant row
   without the `IP_HASH_SALT`. Anonymisation deletes the S3 objects, but
   failures are best-effort (logged at warning, not fatal). Operator must
   run a periodic orphan sweep (§6.6).

### 2.4 Lifecycle states

```
arrived → consented → submitting → submitted ──┬──► discarded ──► anonymised ──► erased
                                                └───────────────► anonymised ──► erased
```

`erased` is reachable only via study-level CASCADE
(`backend/app/models/participant.py:42`, ON DELETE CASCADE on `study_id`) or
via `DELETE /api/admin/studies/{slug}/participants` while the study is in
`draft` state. Per-row hard-delete is intentionally not exposed; Qualis
treats anonymisation as the legal Art. 17 endpoint per Recital 26 (F-05-009).

---

## 3. Personal-data inventory

### 3.1 Identifying / quasi-identifying data Qualis stores about participants

| Category | Where | Lawful basis (default) | Retention default |
|---|---|---|---|
| Hashed IP (SHA-256 + per-deployment salt) | `participants.ip_address` | Consent (Art. 6(1)(a)); fraud / duplicate detection (Art. 6(1)(f) legitimate interest) | Until anonymisation; operator-driven |
| User-agent (SHA-256 + salt; "mobile"/"desktop" device-class prefix preserved) | `participants.user_agent` | Consent | Until anonymisation; operator-driven |
| Session token (UUID4, 122-bit) | `participants.session_token` | Consent (technical session) | Rotated on anonymisation |
| Resume code (memorable, e.g. `swift-river-42`) | `participants.resume_code` | Consent (UX continuity) | Cleared on anonymisation |
| Confirmation code (8 chars from session token) | `participants.confirmation_code` | Consent (post-submission proof) | Cleared on anonymisation |
| Consent hash (versioning marker for the consent text the participant agreed to) | `participants.consent_hash` | Compliance (Art. 7(1) demonstrability) | Cleared on anonymisation; retained in `consented_at` only |
| Free-text presort/postsort answers (study-author-defined survey schema) | `participants.presort_answers`, `participants.postsort_answers` | Consent | Cleared on anonymisation (set to `{}`) |
| Free-text per-card comments | `qsort_entries.card_comment` | Consent | **Preserved on anonymisation as research data** — operator obligation to screen before publication (F-05-003) |
| Recruitment-link → email mapping (the follow-up bridge) | `recruitment_links.email` joined via `participants.presort_answers->>'_recruitment_token'` | Consent (named in consent text "exception for follow-up") | **Operator-driven** — no automatic teardown |
| Audio recordings (biometric voice data) | S3 `audio/<sha256(slug|token|salt)[:32]>/{ts}_{question}{ext}`; metadata in `audio_recordings` rows | **Explicit consent (Art. 9 — special category)** required when audio is enabled | Deleted on anonymisation; orphan-swept by operator (F-05-004, F-05-005) |
| Anonymisation marker | `participants.anonymised_at` | Compliance (audit trail) | Retained indefinitely |
| Discard flag + reason (researcher-supplied) | `participants.is_discarded`, `participants.discard_reason` | Legitimate interest (research QC) | Retained until study deletion |
| Last-step progress | `participants.last_step_reached`, `participants.last_step_reached_at` | Legitimate interest (UX) | Retained |
| Created/submitted timestamps | `participants.created_at`, `participants.submitted_at`, `participants.consented_at` | Consent (research timeline) | Retained as anonymous research metadata |

**Total: 14 personal-data categories.** All other participant columns are
either derived (e.g. `random_seed`) or non-identifying analytical metadata.

### 3.2 Researcher account data (institutional users)

| Category | Where | Lawful basis | Retention |
|---|---|---|---|
| Email | `users.email` | Contract (Art. 6(1)(b)) | While account active |
| Password hash (bcrypt cost-12) | `users.hashed_password` | Contract | While account active |
| TOTP secret (when enabled) | `users.totp_secret` | Contract | Until 2FA disabled |
| `pending_email` (during email-change flow) | `users.pending_email` | Contract (F-03-011) | Cleared on confirm/cancel |
| `password_changed_at` | `users.password_changed_at` | Compliance (Art. 32 access-token revocation, F-03-010) | Lifetime of account |
| 2FA email OTP code-hash | `twofa_email_otp_codes.code_hash` (bcrypt) | Contract | 5-minute TTL; row-attempts cap 5; per-account 24h wrong-attempt cap 30 (F-03-004) |
| Consumed email-link JTIs (denylist) | `consumed_email_tokens` | Compliance (F-03-001) | 7 days; cleanup script `backend/scripts/cleanup_consumed_email_tokens.py` (F-03-003 — operator schedules) |

### 3.3 Logs (separate retention regime)

| Source | Content | Retention |
|---|---|---|
| Uvicorn access log | `request.client.host` (raw IP), method, path, status, response time | Operator log sink (typically systemd-journald default = forever; rotated by operator) |
| `app.audit` logger | Admin actions (anonymise, bulk_anonymise, erase_personal_data, project member changes, study state transitions, user CRUD) — **no PII** (F-05-008) | Operator log sink |
| `app.middleware.errors` | 500-class exception detail; URL token-scrubbed by F-03-013 filter; may include study slug | Operator log sink |
| `frontend_error` logger | Frontend-reported error context — `ip_hash` (hashed in `routers/logs.py` since F-05-010), `userAgent`, `url` (token-scrubbed) | Operator log sink |

---

## 4. Lawful-basis menu

GDPR Art. 6 (and Art. 9 for special-category data) requires you to identify a
lawful basis per processing activity. Pick one per study and document it in
your records of processing (§10):

| Use case | Recommended Art. 6 basis | Notes |
|---|---|---|
| Standard academic Q-methodology research (consenting volunteers, anonymous results) | **Art. 6(1)(a) consent** | Document the consent text shown (it's hashed in `participants.consent_hash`). Your participants must be able to withdraw — Qualis exposes both the pre-submission `DELETE /api/study/{slug}/draft` (F-05-001) and the post-submission `DELETE /api/study/{slug}/personal-data`. |
| Public-interest research at a university | **Art. 6(1)(e) public-interest task** | Requires Member-State law authorising the task (in France: research-mission of universities under L. 123-3 du Code de l'éducation; in Belgium: arrêtés organiques des établissements; etc.). Often combined with Art. 89(1) safeguards. |
| Health, political views, ethnicity, sexual orientation, biometric data (incl. audio) | **Art. 9(2)(j) research exemption** | Required *in addition* to your Art. 6 basis when special-category fields are touched — including any study where the audio module is enabled (voice = biometric). Member-State law must authorise (e.g., France: art. 44 LIL; Finland: Tietosuojalaki §6). |
| Follow-up communication using emails collected post-sort (recruitment-link join) | **Art. 6(1)(a) explicit consent**, separately worded | The default `consent_description` includes the "exception for follow-up" wording. If your study uses follow-up, **keep that wording**; if it does not, edit `study.consent_description` to remove it before going live. |
| Researcher-account contracts | **Art. 6(1)(b) contract** | Standard institutional-user processing. |
| Security/audit logs (`app.audit`) | **Art. 6(1)(c) legal obligation** + Art. 6(1)(f) legitimate interest | Mandated by Art. 32 (security of processing). |

**Reminder.** A consent-based study cannot piggyback to "legitimate interest"
later to retain data after a withdrawal request. Pick the basis at study
design time and stick to it.

---

## 5. Subject-rights operator playbook

Qualis exposes the technical primitives; the operator is the public face of
the request. For every request:

1. Verify the requestor's identity out-of-band (do not trust an email alone).
2. Resolve the participant row: the simplest path is the recruitment-link
   email join (`recruitment_links.email`), failing that the resume code or
   confirmation code the participant remembers.
3. Apply the technical step below.
4. Respond within one calendar month of receipt (Art. 12(3)).
5. Log the request and the response in your records of processing (§10).

### Art. 15 (Right of access)

Today there is no participant-facing self-export. Operator path:

1. Receive the request via your DPO contact.
2. Verify the participant's identity out-of-band.
3. Identify the participant row (resume code, recruitment email, or session token).
4. Use the admin per-participant export endpoint:
   `GET /api/admin/studies/{slug}/participants/{id}/export/json`
   (`backend/app/routers/admin/exports.py:237-289`) — admin auth required.
   Available formats: JSON (the canonical machine-readable form for Art. 15
   portability), CSV.
5. Send the exported document to the participant. Strip researcher annotations
   (`is_discarded`, `discard_reason`) before delivery — they are research-QC
   data, not participant data.
6. Document the response in your records.

A participant-facing self-serve `GET /api/study/{slug}/personal-data` is on
the Wave 7 follow-up tracker (F-05-007). Until shipped, the admin path above
satisfies Art. 15 via the one-month response window.

### Art. 16 (Right to rectification)

Q-sort responses are observational research data; correcting an "I now
disagree with how I sorted card 7" request defeats the science. Operator
should refuse this class with reasoning. **Rectifiable** items: email on
`recruitment_links.email` (admin can update), free-text post-sort answers
(if the participant asks before the study closes — admin overwrites
`participants.postsort_answers`).

### Art. 17 (Right to erasure)

Qualis offers two paths; both call the same service
(`StudyDataService.anonymise_participant`,
`backend/app/services/study_data_service.py:73-160`):

- **Participant self-service:**
  `DELETE /api/study/{slug}/personal-data?session_token=…`
  (`backend/app/routers/participants.py:286-352`).
  Bound to the participant's `session_token`; the participant exercises this
  via the `EraseMyDataDialog` control on the post-sort feedback page (no admin
  involvement). A submitted participant who follows a resume link is redirected
  to that post-sort page, where the control appears. Audit row emitted with
  `mode=participant_self` (F-05-008).
- **Admin-mediated:**
  `DELETE /api/admin/studies/{slug}/participants/{participant_id}/personal-data`
  (`backend/app/routers/admin/studies_participants.py:179-225`).
  For requests received via the DPO inbox.

Both paths null PII (`ip_address`, `user_agent`, `confirmation_code`,
`resume_code`, `consent_hash`, `draft_responses`, `presort_answers`,
`postsort_answers`), rotate `session_token`, set `anonymised_at`, and delete
the audio S3 objects. **Q-sort entries are preserved** as anonymous research
data per GDPR Recital 26 (F-05-009).

**Bulk variant** (post follow-up phase):
`POST /api/admin/studies/{slug}/anonymise-bulk` body `{submitted_before: ISO}`
(`backend/app/routers/admin/lifecycle.py:253-316`). Audit row mode
`bulk_anonymise`.

**What full row-deletion is NOT.** Qualis does not expose per-row
hard-delete. If your DPA or legal advice requires it, the only paths are
study-level CASCADE (deleting the parent study) or pre-go-live
`DELETE /api/admin/studies/{slug}/participants` while the study is in
`draft` state.

### Art. 20 (Right to data portability)

Same path as Art. 15 — the JSON export is structured machine-readable. Send
it directly to the participant or to the receiving controller.

### Art. 21 (Right to object)

For research conducted under Art. 6(1)(e) or Art. 9(2)(j), Art. 21(6)
provides for objection on grounds relating to the participant's particular
situation. The operator's DPO weighs the objection against the public
interest of the research. If accepted, the technical fulfilment is the same
as Art. 17 erasure (anonymise the row). For consent-based research
(Art. 6(1)(a)) the participant withdraws consent rather than objecting,
which also routes to Art. 17.

### Art. 7(3) — Withdrawal of consent (pre-submission)

Distinct from Art. 17. A participant who closes the consent dialog or
abandons mid-sort can call `DELETE /api/study/{slug}/draft?session_token=…`
(F-05-001). This clears `draft_responses` to `None` and resets
`last_step_reached` to 1 without deleting the participant row. The
frontend "Start over" button is on the Wave 4b backlog; until shipped,
operators may wish to instrument this manually if a participant calls
support.

---

## 6. Retention and anonymisation

### 6.1 Anonymisation contract

`StudyDataService.anonymise_participant` is the single entry point. After
running:

```
DB: ip_address=NULL, user_agent=NULL, confirmation_code=NULL,
    resume_code=NULL, consent_hash=NULL, draft_responses=NULL,
    presort_answers={}, postsort_answers={},
    session_token=uuid4() (rotated), anonymised_at=now()
S3: all audio objects under the hashed prefix DELETED
DB: audio_recordings rows DELETED
```

The session-token rotation means the original token can never re-access
this row. Rejoin to the source dataset is impossible from the participant
side.

### 6.2 What `anonymised_at` does NOT clear

These remain by design (anonymous research metadata):

- `language_used` — population locale stat, not identifying alone.
- `random_seed` — was deterministic from `session_token`; rotating the token
  decouples.
- `submitted_at`, `created_at`, `consented_at`, `last_step_reached_at` —
  research timestamps.
- `is_discarded`, `discard_reason` — researcher-side QC state.
- `qsort_entries.card_comment` — **PRESERVED as research data**. See §6.3.

### 6.3 `card_comment` screening (F-05-003)

Per-card free-text comments may carry PII the participant volunteered (a
name, a place, a diagnosis). Anonymisation does not redact them; Qualis
ships no NER. **The screening before publication or sharing is the
operator's job.** Recommended workflow:

1. Before any export or publication, run the per-study CSV export
   (`/api/admin/studies/{slug}/export/csv`) and review the
   `card_comment` column manually.
2. For sensitive studies, apply quote-screening at study-design time: the
   default `consent_description` already says "comments may be quoted to
   contextualize ... screened to remove revealing details". Honour that.
3. The Wave 4b backlog tracks an inline-redaction admin UI; until shipped,
   redact via spreadsheet edit and re-import or via direct DB UPDATE under
   change control.

### 6.4 Operator obligations summary

Eight per-deployment actions Qualis cannot do for you:

1. **Set `IP_HASH_SALT`.** Production refuses to start without it
   (`backend/app/utils/crypto.py:19-22`). Use a long random value; **do not
   rotate** — rotation orphans every existing hash and silently breaks
   duplicate-detection.
2. **Configure log-sink IP redaction.** Uvicorn access logs contain raw
   client IPs; the Qualis-side `log_scrub` filter only handles query-string
   tokens. Operators serious about the consent-text "anonymous code"
   promise must redact at the systemd / fluentd / rsyslog layer. Sample
   fluentd snippet:
   ```
   <filter uvicorn.access>
     @type record_modifier
     <record>
       client_ip ${record["client_ip"].sub(/^([0-9]+\.[0-9]+\.[0-9]+)\.[0-9]+$/, '\1.0')}
     </record>
   </filter>
   ```
3. **Anonymise after the follow-up phase ends.** Run
   `POST /api/admin/studies/{slug}/anonymise-bulk` with a cutoff covering
   all relevant participants and **separately delete the recruitment link**
   that holds the email mapping. `data_retention_months` on the study row
   is a UI hint, not an automatic enforcement — the operator is the policy
   engine.
4. **Screen `card_comment` and `qsort_entries` free text before
   publication** (§6.3).
5. **Run an S3 orphan sweep.** When `storage_service.delete_audio` fails
   (transient S3 outage during anonymisation), the audio file remains in
   the bucket while the `audio_recordings` row is deleted. Set up a
   periodic job that lists `audio/<prefix>/...` keys and deletes any whose
   prefix does not appear in `audio_recordings.s3_key`. Cadence: monthly is
   reasonable; the bucket is small (≤100 MB per study by default,
   `backend/app/routers/audio.py:91`). F-05-005 is documented as
   operator-side.
6. **Schedule `cleanup_consumed_email_tokens.py`** (F-03-003). The script
   exists at `backend/scripts/cleanup_consumed_email_tokens.py` and deletes
   `consumed_email_tokens` rows older than 7 days. On Scalingo, use the
   Scheduler addon with a daily 04:00 UTC entry; on other platforms use
   your equivalent cron.
7. **Schedule the abandoned-draft sweeper** (Wave 4b backlog) once shipped.
   The intended script (`backend/scripts/cleanup_abandoned_sessions.py`)
   removes participants with `status='started' AND submitted_at IS NULL AND
   last_step_reached_at < now() - SESSION_TTL_DAYS`. Until shipped, the
   consent-text promise on partial-data retention depends on operator
   memory — manually run anonymise-bulk on stalled participants
   periodically.
8. **Document the discard policy in the study's privacy notice if discard
   is used.** `is_discarded` is a soft flag; the discarded participant's
   PII still resides on the row and survives until anonymisation. If the
   participant *requested* removal, anonymise instead of (or in addition
   to) discarding.

### 6.5 Audit-log sink

`app.audit` entries are the legal trail of admin actions on personal data
(anonymise, erase, role changes, study-state transitions). Operators must
route this logger to a tamper-evident sink (file with rotation + integrity
hash, or external SIEM). All five lifecycle-mutation sites emit audit rows
since F-05-008 (`mode` discriminator distinguishes `admin_mediated`,
`participant_self`, `bulk_anonymise`).

---

## 7. Art. 32 security checklist

GDPR Art. 32 requires "appropriate technical and organisational measures."
The table below maps the obligation to what Qualis provides and what the
operator must add. Cross-reference with `SECURITY.md` "Security-relevant
practices".

| Control area | Art. 32 requirement | Qualis feature | Operator obligation |
|---|---|---|---|
| **Pseudonymisation** | Art. 32(1)(a) | IP hashed at write (SHA-256 + salt, F-03-surface, `submission_service.py:53`); UA hashed at write (F-05-002); audio S3 prefix hashed (F-05-004). | Set `IP_HASH_SALT` (long random). Do not rotate. |
| **Encryption at rest** | Art. 32(1)(a) | None at app layer. | Configure encrypted DB volume (Scalingo: managed; AWS: EBS encryption; on-prem: LUKS). Configure S3 bucket-level SSE. |
| **Encryption in transit** | Art. 32(1)(a) | HTTPS everywhere; HSTS via `SecurityHeadersMiddleware`; TLS to SMTP via `_send_or_log`. | Terminate TLS at edge proxy with valid cert; enforce HSTS preload list. |
| **Confidentiality** | Art. 32(1)(b) | `require_project_role` + `check_*_permission` (`backend/app/dependencies.py:170-293`); 95-case IDOR harness (F-04-001) as CI regression guard; log-scrub regex `(token\|otp\|code)` IGNORECASE on `uvicorn.access`, `app.middleware.errors`, `app.routers.logs` (F-03-013); `lint_logger_urls.py` AST gate prevents new leaks. | Per-deployment access policy; rotate researcher 2FA; offboard departing staff (delete `User` row or set `is_superuser=False`). |
| **Integrity** | Art. 32(1)(b) | Access-token revocation on password change (`iat` claim + `password_changed_at`, F-03-010); email-change dual-confirmation (F-03-011); CSP `script-src 'self'`; DOMPurify on user-submitted HTML; `frame-ancestors 'none'`. | Trust the password-change flow; do not weaken CSP. |
| **Availability** | Art. 32(1)(b) | Application-level rate limits (slowapi) bound DoS at credential-grade endpoints (F-06-001); per-study `max_storage_mb` quota; per-file `AUDIO_MAX_FILE_SIZE_MB` cap. | Backup strategy (DB dumps, S3 versioning); capacity planning; CDN/edge protection. (Operator infra; out of audit scope.) |
| **Resilience** | Art. 32(1)(b) | Stateless backend; idempotent submit (F-06-006); fail-open S3 anonymisation (legal erasure not blocked by infra outage). | Multi-replica deployment; failover plan. |
| **Regular testing** | Art. 32(1)(d) | `security-scans.yml` CI workflow (gitleaks + pip-audit + npm-audit + semgrep + logger-URL lint, Wave 6); 95-case IDOR harness (F-04-001); 15-test log-scrub regression (F-03-013); Dependabot weekly; this audit (Waves 1-7). | Annual external pen-test; review SECURITY.md disclosure inbox. |
| **Container hardening** | Art. 32(1)(b) | Backend `Dockerfile` runs as non-root `app` user (F-02-006); nginx host-allowlist (F-02-007). | Container-host kernel patching; rootless runtime if available. |
| **Supply chain** | Art. 32(1)(b) | GitHub Actions third-party SHA-pinned (Wave 6); direct-pin floors for CVE-fixed transitives (`pygments`, `python-dotenv`, `requests`); pip-audit + npm-audit gates. | Review Dependabot PRs weekly; subscribe to GitHub security advisories. |
| **Audit logging** | Art. 32(1)(b), Art. 5(2) accountability | `app.audit` structured rows for every state-mutating admin path; lifecycle audit (F-05-008) covers anonymise / erase / discard / bulk_anonymise / participant self-erase. | Route `app.audit` to tamper-evident sink (file-with-rotation-and-hash or SIEM). |
| **Breach detection** | Art. 32(1)(b), Art. 33 | Optional Sentry integration (`SENTRY_DSN`) with `send_default_pii=False`; structured exception logs. | Monitor logs; subscribe to Sentry alerts; have a 24/7 contact path. |
| **Access control** | Art. 32(4) | Role-based access (`ProjectMember.role`); owner-immutable on PATCH (F-04-001 §B_VALID_HEADER); DB-level partial-unique index `project_members_one_owner_per_project`. | Set `MAX_MEMBERS_PER_PROJECT` if your deployment requires; review role assignments quarterly. |

**14 control areas** map to specific Qualis features citing **20 finding IDs**
(F-02-006, F-02-007, F-03-004, F-03-010, F-03-011, F-03-013, F-04-001,
F-05-002, F-05-004, F-05-008, F-05-010, F-06-001, F-06-006, F-06-007 plus
the cross-cutting Wave 6 deliverables).

---

## 8. Breach notification (Art. 33-34)

Operator playbook. The 72-hour clock starts at the controller's awareness,
not at the incident occurrence (Art. 33(1)).

### 8.1 Detect

- Monitor `app.audit` for unexpected mutations (mass anonymise that you did
  not run; role changes on accounts that should not be touched).
- Monitor `app.middleware.errors` 5xx spikes.
- Monitor Sentry (if configured) for unhandled exceptions.
- Subscribe to GitHub security advisories on `pyjwt`, `bcrypt`, `fastapi`,
  `sqlalchemy`, `dompurify`, `exceljs`.
- Subscribe to Qualis maintainer security advisories (release notes / RSS).

### 8.2 Assess (within 72 hours)

Document:

1. **What happened.** Time of incident, time of detection, attack vector.
2. **What data is affected.** Cite §3 inventory categories. If audio is
   involved, this is Art. 9 special-category — escalates obligations.
3. **How many subjects.** From `participants` row count for the affected
   study/projects.
4. **Likely consequences.** Re-identification risk (do they still have an
   active session? was the salt leaked alongside the hashes?), financial
   risk, reputational risk, special-category implications.
5. **Mitigations applied or planned.** Password rotation? Token revocation?
   Bucket lockdown?

### 8.3 Notify supervisory authority (Art. 33)

- **Within 72 hours** if likely to result in risk to subjects.
- **In France:** CNIL via the `Notif-violations` portal.
- **In Belgium:** APD/GBA via the breach notification form.
- **In Finland:** Tietosuojavaltuutettu via online portal.
- Other Member States: relevant DPA's online portal.
- Late notification requires justification (Art. 33(1) second sentence).

### 8.4 Notify subjects (Art. 34)

Required if **high risk** to rights and freedoms. Communicate in plain
language, including:

- Nature of the breach.
- Name and contact of the DPO.
- Likely consequences.
- Measures taken or proposed.

Exceptions (Art. 34(3)): if encryption rendered the data unintelligible to
unauthorised access (e.g., bucket leak of objects that were encrypted with
a key not also leaked), notification may be waived. Qualis does NOT
encrypt audio at the application layer; bucket-level SSE is operator
configuration. If you rely on this exception, document the SSE config.

### 8.5 Document everything

Keep an internal incident register (Art. 33(5)). Even breaches that did not
trigger external notification go in the register. Cite the audit-log row
IDs (`app.audit` correlates by timestamp, actor, action, resource).

### 8.6 Qualis features that support breach assessment

- `app.audit` (Wave 4 F-05-008) — lifecycle mutations attributable.
- `participants.anonymised_at`, `submitted_at` — temporal scoping.
- Wave 6 `security-scans.yml` — historical CI evidence of supply-chain
  hygiene at the time of the incident.
- The comprehensive security audit (Waves 1-7, 2026-05-03) — show the
  regulator that you ran a multi-wave audit.

---

## 9. DPIA inputs (Art. 35)

Drop-in risk register the operator can paste into their own DPIA. Risks
mirror the threat-model top-10 (`08-threat-model.md` §5). Likelihood and
impact are at the *post-mitigation* level shipped at commit `fe4efd2b`.

### 9.1 Risk: cross-tenant data access via IDOR

- **Description.** A researcher on project A reads project B's participants.
- **Likelihood.** Low — 95-case parametrised harness passes; `B_VALID_HEADER`
  variant pins inline checks across all 89 admin endpoints.
- **Impact.** Very high (confidentiality breach across multiple projects).
- **Qualis mitigation.** F-04-001 IDOR harness as CI regression guard;
  `require_project_role` + service-side ownership filters.
- **Operator obligation.** Run the security battery on every release;
  do not weaken role gates locally.
- **Residual risk.** Low — pinned by regression test.

### 9.2 Risk: JWT theft + post-password-change validity

- **Description.** Attacker lifts an access JWT and uses it after the
  victim has rotated their password.
- **Likelihood.** Low-medium (XSS / leaked log line / shared device).
- **Impact.** High (8h account control after primary remediation).
- **Qualis mitigation.** F-03-010 — `iat` claim + `password_changed_at`
  check on every request rejects stale tokens.
- **Operator obligation.** Communicate "rotate your password if you
  suspect a leak" to researchers.
- **Residual risk.** Low — refresh-token rotation deferred to Wave 2b
  reduces residual to the 8h window between leak and rotation.

### 9.3 Risk: OTP brute-force defeating email-channel 2FA

- **Description.** Attacker who already has the password brute-forces
  email-OTP.
- **Likelihood.** Medium (credential-stuffing corpora abound).
- **Impact.** High (full account control bypassing 2FA).
- **Qualis mitigation.** F-03-004 — per-account 24h cap of 30 wrong
  attempts; per-row `attempts ≥ 5` lockout; 30s resend cooldown.
- **Operator obligation.** Encourage TOTP over email-channel 2FA where
  possible.
- **Residual risk.** Low (~0.003 %/day across 24h cap).

### 9.4 Risk: email-change account takeover

- **Description.** Transient session compromise → silent permanent
  control transfer.
- **Likelihood.** Low.
- **Impact.** Very high.
- **Qualis mitigation.** F-03-011 — dual-confirmation flow:
  confirm-link to NEW + cancel-link to OLD; `pending_email` parking.
- **Operator obligation.** None (backend-only fix).
- **Residual risk.** Very low.

### 9.5 Risk: email enumeration → targeted phishing campaign

- **Description.** Probing `/api/token`, `/email/verify/resend`,
  `/2fa/disable/request`, `/register` to confirm whether an email
  is on the platform.
- **Likelihood.** High (rate-limited but scaling across IPs).
- **Impact.** Medium (feeds downstream credential stuffing).
- **Qualis mitigation.** F-03-005/006/007 (timing parity);
  F-06-007 / F-03-008 (always-201 register).
- **Operator obligation.** Do not log or expose distinguishable error
  bodies via custom middleware.
- **Residual risk.** Low (residual ~130 ms minimum-floor on
  password-reset, F-03-009; below remediation threshold).

### 9.6 Risk: audio S3 bucket-list re-identification

- **Description.** Operator-side IAM misconfiguration leaks bucket
  listing; attacker reconstructs (study, participant) pairs from keys.
- **Likelihood.** Low (operator-controlled).
- **Impact.** Medium (special-category data).
- **Qualis mitigation.** F-05-004 — hashed prefix
  `audio/<sha256(slug|token|salt)[:32]>/...`; metadata stripped to
  question key only.
- **Operator obligation.** Bucket-policy review; private bucket;
  rotate IAM keys quarterly. Cite operator obligation §6.4 #5.
- **Residual risk.** Low — pre-existing rows retain legacy keys until
  anonymised; operator orphan-sweep covers stragglers.

### 9.7 Risk: consent-text drift on pre-submission abandonment

- **Description.** Most participants close the browser without explicit
  withdrawal; their `draft_responses` (free-text) persist indefinitely.
- **Likelihood.** High (UX reality).
- **Impact.** Medium (consent integrity / reputational).
- **Qualis mitigation.** F-05-001 — `DELETE /api/study/{slug}/draft`
  endpoint shipped (backend half).
- **Operator obligation.** Schedule the abandoned-draft sweeper once
  shipped (Wave 4b); meanwhile run anonymise-bulk on stalled
  participants periodically.
- **Residual risk.** Medium-low until Wave 4b lands.

### 9.8 Risk: member-quota TOCTOU race

- **Description.** Concurrent member invites bypass `MAX_MEMBERS_PER_PROJECT`.
- **Likelihood.** Very low (default = 0 = unlimited in OSS).
- **Impact.** Low (over-fill is bounded, recoverable, no security boundary
  crossed).
- **Qualis mitigation.** None (deferred F-04-006); recommended
  `SELECT … FOR UPDATE` on project sentinel row.
- **Operator obligation.** If you set `MAX_MEMBERS_PER_PROJECT > 0`,
  monitor; the over-fill is recoverable post-hoc.
- **Residual risk.** Low.

### 9.9 Risk: supply-chain transitive dep regression

- **Description.** A transitive dep introduces a CVE between Qualis releases.
- **Likelihood.** Medium (transitive churn in lockfile).
- **Impact.** Medium-high (depends on the surface of the dep).
- **Qualis mitigation.** Direct-pin floors for high-blast-radius
  transitives (Wave 6); pip-audit gate in `security-scans.yml`;
  Dependabot weekly cadence; SHA-pinned third-party GHA actions.
- **Operator obligation.** Apply Qualis releases promptly; review
  Dependabot PRs.
- **Residual risk.** Medium — depends on operator update cadence.

### 9.10 Risk: operator misconfiguration leaks

- **Description.** Raw IP in `uvicorn.access`; missing S3 lifecycle;
  missing scheduler for cleanup_consumed_email_tokens.
- **Likelihood.** Medium-high (operator-dependent).
- **Impact.** Medium (slow-burn re-identification or capacity issue).
- **Qualis mitigation.** F-05-010 (frontend_error IP hashed); F-03-003
  (operator-side scheduler doc); F-05-005 (operator obligation).
- **Operator obligation.** Implement operator obligations §6.4
  (eight items).
- **Residual risk.** Medium.

---

## 10. Records of processing (Art. 30)

Template the operator fills in. One record per processing activity (per
study, typically). Cite the §3 inventory categories rather than copying
column names verbatim.

```
# Record of processing — Study "<study slug>"

## Controller identity
- Name: <institution name>
- Address: <institutional address>
- Representative (if applicable): <name>
- DPO contact: <dpo@institution.tld>

## Processing purposes
- Q-methodology research on <topic>.
- Lawful basis: <Art. 6(1)(a) / Art. 6(1)(e) — see §4>
- If special-category: <Art. 9(2)(j) + national authorising law>

## Categories of data subjects
- Volunteer participants in <topic> Q-sort study.
- Inclusion criteria: <as stated in recruitment material>.

## Categories of personal data
- Hashed network identifiers (IP hash, UA hash) — Qualis §3.1.
- Session/resume tokens — Qualis §3.1.
- Free-text responses (presort, postsort, per-card comments) — Qualis §3.1.
- (If audio enabled) audio recordings — Qualis §3.1, Art. 9 special-category.
- (If recruitment-link join enabled) email — Qualis §3.1.

## Recipients
- Researchers on the study's owning project.
- Qualis maintainers: NONE — no SaaS layer in the request path
  (SECURITY.md "Self-hosted by design").
- Hosting provider: <Scalingo / AWS / on-prem> — DPA on file dated <YYYY-MM-DD>.
- S3 provider (if separate): <provider> — DPA on file dated <YYYY-MM-DD>.
- SMTP provider (if separate): <provider> — DPA on file dated <YYYY-MM-DD>.

## International transfers
- See §11 of the GDPR memo. <Region pinned to EU / SCCs in place / N/A>.

## Retention periods
- Active study phase: until follow-up phase ends.
- Post follow-up: anonymised via /anonymise-bulk; only research metadata
  + qsort entries retained as anonymous data.
- Audit log: <operator's retention period, e.g. 7 years>.

## Security measures
- Cite GDPR memo §7 (Art. 32 checklist).
- Cite SECURITY.md "Security-relevant practices".
- Cite the comprehensive security audit (Waves 1-7, 2026-05-03).

## Last reviewed
- <YYYY-MM-DD> by <DPO name>.
```

---

## 11. International transfers (Art. 44+)

Relevant if any sub-processor (S3 region, SMTP provider, hosting region) is
outside the EU/EEA or outside an adequacy-decision territory.

### 11.1 Choice points the operator owns

| Sub-processor | Choice point | EU-friendly default |
|---|---|---|
| **Hosting** | Scalingo region (Paris / Osaka) | Paris (`region=osc-fr1`). |
| **S3 / object storage** | Cellar region; AWS S3 region | Cellar `eu-fr1`; AWS `eu-west-3` (Paris) or `eu-central-1` (Frankfurt). |
| **SMTP** | Provider + region | Institutional MX in operator's country, or EU-region SES (`eu-west-1`). |
| **Sentry (optional)** | Sentry-EU vs Sentry-US | `https://sentry.io/regions/eu/`. |
| **CDN (if used)** | Provider region | Cloudflare EU-data-localisation; or a CDN with Article 49 derogations. |

### 11.2 Transfer mechanism if non-EU is unavoidable

- **Adequacy decision** (Art. 45) — UK (post-Brexit decision active);
  Switzerland; Japan; specific frameworks for the US (Data Privacy
  Framework — verify currency at transfer time).
- **Standard Contractual Clauses (SCCs)** — Annex of Commission Implementing
  Decision (EU) 2021/914. Sign with the sub-processor; add the transfer to
  your records of processing.
- **Binding Corporate Rules (BCRs)** — for intra-group transfers within a
  multinational.
- **Derogations (Art. 49)** — case-by-case; explicit consent; not a
  long-term solution.

### 11.3 Document in §10

Update the records of processing whenever the transfer mechanism changes
(provider switch, region change, adequacy-decision shift). The CNIL,
APD/GBA, and Tietosuojavaltuutettu all expect a current record on demand.

---

## 12. Maintainer obligations

What the Qualis project commits to (the maintainer side of the
controller / vendor relationship):

- **Security advisory publication.** Vulnerability disclosure inbox
  documented in `SECURITY.md`. Acknowledgement target: 5 working days.
- **30-day high-severity fix window.** For vulnerabilities classified as
  high severity (~CVSS 7.0+), the maintainers ship a fix or documented
  mitigation within 30 days (`SECURITY.md` "Reporting a vulnerability").
- **CVE coordination.** Severity follows CVSS; embargo period negotiated
  with reporters; release notes link the CVE on the relevant version.
- **Audit history.** A seven-wave comprehensive security audit (2026-05-03)
  and a prior multi-axis audit (2026-04-25) were conducted; their
  security-relevant outcomes are summarised in `SECURITY.md`.
- **Audit cadence.** No fixed annual cadence committed; audits run when
  scope warrants (typically before a major release). Operators can fund
  additional audit work via their DPA with
  the institution that maintains Qualis.
- **No SaaS layer in the request path.** Qualis is self-hosted by design;
  no traffic flows through any maintainer-operated endpoint at request
  time. The maintainers cannot be served a subpoena that would yield
  participant data because they never see it. (`SECURITY.md` "Self-hosted
  by design".)
- **Dependency hygiene.** Dependabot weekly; pip-audit + npm-audit gates
  in CI; direct-pin floors for known-CVE transitives.
- **Open development.** All PRs reviewed; security-sensitive changes go
  through the additional code-reviewer gate documented in the
  `superpowers/specs` directory.

What the maintainers do **not** commit to:

- A specific support window per release. We patch the latest tagged
  release; older releases are best-effort (`SECURITY.md` "Supported
  versions").
- A 24/7 on-call rotation. Vulnerability reports are reviewed during
  business hours.
- Hosting any operator's deployment.
- Acting as a data processor for any operator. The maintainers do not
  enter DPAs with operators because they do not process operator data.

---

## Appendix: cross-references

Each section traces back to the audit material that produced it:

| Section | Source |
|---|---|
| §1 Roles | `SECURITY.md`; this memo. |
| §2 Data flows | `05-consent-anonymisation.md` §"Data lifecycle map"; `08-threat-model.md` §3. |
| §3 Personal-data inventory | `05-consent-anonymisation.md` §"GDPR-memo material" (a). |
| §4 Lawful-basis menu | New (this memo); cites Member-State law. |
| §5 Subject-rights playbook | `05-consent-anonymisation.md` Findings F-05-001, F-05-007, F-05-008, F-05-009; `backend/app/routers/admin/exports.py:237-289`; `backend/app/routers/participants.py:286-352`; `backend/app/routers/admin/lifecycle.py:253-316`. |
| §6 Retention / anonymisation | `05-consent-anonymisation.md` §"GDPR-memo material" (b)+(c); `99-action-backlog.md` Wave 4 (F-05-001/002/003/004/005/008/010); `backend/app/services/study_data_service.py:73-160`. |
| §7 Art. 32 checklist | `08-threat-model.md`; `SECURITY.md`; `07-supply-chain.md` Wave 6 deliverables; cumulative findings in `99-action-backlog.md`. |
| §8 Breach notification | `SECURITY.md` "Reporting a vulnerability"; `08-threat-model.md` §4 STRIDE per boundary; F-05-008 lifecycle audit. |
| §9 DPIA inputs | `08-threat-model.md` §5 Top-10 ranked risks. |
| §10 Records of processing | New template (this memo). |
| §11 International transfers | New (this memo). |
| §12 Maintainer obligations | `SECURITY.md`; `99-action-backlog.md` audit history. |

**End of memo.** Last reviewed: 2026-05-03.
