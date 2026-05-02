# API Reference

Qualis exposes a FastAPI HTTP API. All endpoints are documented here; live, interactive documentation is also available from the running backend.

---

## Interactive documentation

When the backend is running, visit:

| Endpoint | Description |
| -------- | ----------- |
| `/docs`  | Swagger UI — interactive API explorer |
| `/redoc` | ReDoc — alternative reference rendering |
| `/health` | Liveness probe (200 OK when the app is up) |

---

## Authentication

Two authentication models are in use:

- **Bearer JWT** — Most authenticated endpoints. Token is issued by `POST /api/token` and passed as `Authorization: Bearer <token>`.
- **Participant session token** — Public endpoints under `/api/study/{slug}/...` and `/api/audio/...` accept a per-participant session token in the request body. No JWT required.

### Obtain a token

`POST /api/token` (form-encoded `application/x-www-form-urlencoded`)

| Field | Location | Required | Notes |
| ----- | -------- | -------- | ----- |
| `username` | form | yes | The user's email |
| `password` | form | yes | |
| `X-TOTP-Token` | header | conditionally | Required only when 2FA is enabled on the account |

When the account has 2FA enabled and the header is missing, the response is `{"requires_2fa": true}`. Retry with a valid 6-digit TOTP code in `X-TOTP-Token`.

### Use the token

Pass the token on every authenticated request:

```
Authorization: Bearer <jwt>
```

For project-scoped endpoints (study, recruitment, concourse, export under `/api/admin/`), pass the active project as a header:

```
X-Project-ID: <project_id>
```

The middleware uses this to scope queries and to enforce project-membership permissions.

### Roles

Endpoints below indicate the minimum role required:

- **Project roles** (apply across the whole project): `Viewer` < `Researcher` < `Owner`.
- **Study roles** (apply per study, on top of project membership): `Viewer` < `Editor` < `Owner`.
- **Superuser** is a system-wide flag; it grants access to user-management endpoints and to a small set of destructive operations.

"Public" means no authentication at all.

---

## Endpoints

### Auth (`/api`)

| Method | Path | Auth | Rate limit | Purpose |
| --- | --- | --- | --- | --- |
| GET | `/api/me` | authenticated | — | Current user profile |
| PATCH | `/api/me` | authenticated | — | Update name / email |
| POST | `/api/me/password` | authenticated | — | Change password |
| POST | `/api/token` | public | 5/min | Login; returns JWT or `{requires_2fa: true}` |
| POST | `/api/register` | public | 5/min | Register new user (optional invitation token) |
| GET | `/api/me/2fa/setup` | authenticated | — | Generate TOTP secret + QR provisioning URI |
| POST | `/api/me/2fa/enable` | authenticated | — | Enable 2FA after verifying a TOTP code |
| POST | `/api/me/2fa/disable` | authenticated | — | Disable 2FA after re-verifying password |

### Public study + participant flow

These endpoints power the participant experience. None require a JWT; participant identity is bound to a session token in the request body or path.

| Method | Path | Auth | Rate limit | Purpose |
| --- | --- | --- | --- | --- |
| GET | `/api/study/{slug}` | public | 120/min | Fetch study config (statements, grid, presort/postsort, branding); password-gated if `access_password` is set |
| POST | `/api/study/{slug}/unlock` | public | 10/min | Validate access password |
| POST | `/api/study/{slug}/consent` | public | 60/min | Record participant consent (timestamp + language) |
| PATCH | `/api/study/{slug}/progress` | public | 120/min | Fire-and-forget progress update (`last_step_reached`) |
| PUT | `/api/study/{slug}/save-draft` | public | 120/min | Persist participant's in-progress draft for later resume |
| GET | `/api/study/{slug}/resume/{code}` | public | 30/min | Retrieve draft data using a resume code (cross-device continuation) |
| DELETE | `/api/study/{slug}/personal-data` | public | 10/min | Participant-initiated GDPR Art. 17 erasure (session-token-bound) |
| POST | `/api/submit` | public | 60/min | Final submission; validates against grid_config and persists the Q-sort |

### Audio (`/api/audio`)

| Method | Path | Auth | Rate limit | Purpose |
| --- | --- | --- | --- | --- |
| POST | `/api/audio/upload` | public (token-bound) | 10/min | Upload a recording; validates MIME, size, per-study quota |
| DELETE | `/api/audio/{recording_id}` | public (token-bound) | 10/min | Delete a recording before final submission |
| GET | `/api/audio/{recording_id}/url` | public (token-bound) | 30/min | Presigned S3 URL for playback (1-hour TTL) |

### Logs (`/api`)

| Method | Path | Auth | Rate limit | Purpose |
| --- | --- | --- | --- | --- |
| POST | `/api/logs` | public | — | Frontend error/log entries for server-side aggregation |

### Test endpoints (`/api/test`)

Wired only when `ENVIRONMENT in ("development", "test")`. The router is not registered in production.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/test/health` | Health check used by the test runner |
| POST | `/api/test/init` | Ensure tables exist |
| POST | `/api/test/seed` | Idempotent seed of base test user + project |
| POST | `/api/test/members` | Add a test user to a test project |
| POST | `/api/test/cleanup` | Clear participant/study data between tests |
| POST | `/api/test/cleanup-all` | Full database cleanup |

### Admin — studies (`/api/admin/studies`)

| Method | Path | Min role | Rate limit | Purpose |
| --- | --- | --- | --- | --- |
| POST | `/api/admin/studies` | Researcher | 30/min | Create a study (DRAFT) in the active project |
| GET | `/api/admin/studies` | Viewer | — | List studies in active project (paginated) |
| GET | `/api/admin/studies/{slug}` | Viewer | — | Study detail with statements + counts |
| PATCH | `/api/admin/studies/{slug}` | Editor | 30/min | Update study config (structural changes only in DRAFT) |
| POST | `/api/admin/studies/{slug}/validate` | Editor | 30/min | Pre-publish readiness check; returns validation errors |
| POST | `/api/admin/studies/{slug}/state` | Editor | 30/min | Transition state (draft ↔ active ↔ closed ↔ archived) |
| POST | `/api/admin/studies/{slug}/reset` | Owner | 30/min | Delete all participants for the study |
| DELETE | `/api/admin/studies/{slug}` | Superuser | 30/min | Permanent deletion (study must be archived) |
| POST | `/api/admin/studies/{slug}/import-concourse` | Editor | 10/min | Copy concourse items into the study as statements |
| GET | `/api/admin/studies/{slug}/stale-statements` | Editor | — | List statements whose source concourse item has changed |
| POST | `/api/admin/studies/{slug}/sync-statement/{statement_id}` | Editor | 30/min | Sync a single statement from its concourse source |
| POST | `/api/admin/studies/{slug}/sync-all-stale` | Editor | 10/min | Sync every stale statement |
| GET | `/api/admin/studies/{slug}/stats` | Viewer | — | Aggregated study statistics |

### Admin — analysis (`/api/admin/studies/{slug}/analysis`)

| Method | Path | Min role | Rate limit | Purpose |
| --- | --- | --- | --- | --- |
| GET | `.../eigenvalues` | Viewer | 30/min | Eigenvalues of the inter-participant correlation matrix (for the scree plot) |
| POST | `.../run` | Editor | 10/min | Run factor analysis; persists an `AnalysisRun` to the audit trail |
| GET | `.../runs` | Viewer | — | List persisted analysis runs |
| GET | `.../runs/{run_id}` | Viewer | — | Single run with full result payload (loadings, arrays, distinguishing/consensus) |
| PATCH | `.../runs/{run_id}` | Editor | — | Update researcher notes (result is immutable) |
| DELETE | `.../runs/{run_id}` | Editor | — | Delete a persisted run |
| GET | `.../audios` | Viewer | — | Audio recordings for flagged participants, with presigned playback URLs |
| GET | `.../comments` | Viewer | — | Card comments from flagged participants on each factor |
| POST | `.../preview-range` | Viewer | 10/min | Eigenvalue + variance preview for a configurable factor-count range (Explorer panel) |

### Admin — memos (`/api/admin/{studies\|concourses}/{id}/memo`)

Polymorphic memo subsystem attached to either a study or a concourse.

| Method | Path | Min role | Rate limit | Purpose |
| --- | --- | --- | --- | --- |
| GET | `/api/admin/{parent}/{id}/memo` | Viewer | — | Full memo (entries with comment threads) for a study or concourse |
| GET | `/api/admin/{parent}/{id}/memo/entries` | Viewer | — | List entries only (no comment payloads) |
| POST | `/api/admin/{parent}/{id}/memo/entries` | Editor | 30/min | Create a new memo entry |
| GET | `/api/admin/{parent}/{id}/memo/unread` | Viewer | — | Unread-mention count for the current user |
| PATCH | `/api/admin/memo-entries/{eid}` | Editor | 30/min | Update entry title, body, or position |
| DELETE | `/api/admin/memo-entries/{eid}` | Editor | 30/min | Delete an entry (cascades to comments) |
| GET | `/api/admin/memo-entries/{eid}/comments` | Viewer | — | List comments on an entry |
| POST | `/api/admin/memo-entries/{eid}/comments` | Editor | 60/min | Post a comment with optional `mentions: int[]` |
| PATCH | `/api/admin/memo-comments/{cid}` | author | 30/min | Edit a comment body |
| DELETE | `/api/admin/memo-comments/{cid}` | author | 30/min | Soft-delete a comment |
| POST | `/api/admin/memo-comments/{cid}/resolve` | Editor | 30/min | Mark a comment as resolved |
| POST | `/api/admin/memo-comments/{cid}/unresolve` | Editor | 30/min | Reopen a resolved comment |
| GET | `/api/admin/memo/templates` | Viewer | — | Preconfigured templates (e.g. methodology memo) |

### Admin — lifecycle (`/api/admin/studies/{slug}`)

| Method | Path | Min role | Rate limit | Purpose |
| --- | --- | --- | --- | --- |
| GET | `.../data-inventory` | Viewer | — | Read-only snapshot of the study's data footprint (counts, audio usage) |
| POST | `.../anonymise-bulk` | Editor | 5/min | Anonymise completed participants older than a cutoff date; audit-logged |

### Admin — exports (`/api/admin/studies/{slug}`)

| Method | Path | Min role | Rate limit | Purpose |
| --- | --- | --- | --- | --- |
| GET | `.../export/csv` | Editor | 10/min | Wide-format CSV (one row per non-discarded participant) |
| GET | `.../export/pqmethod` | Editor | 10/min | PQMethod ZIP (`.dat` + `.sta`); completed participants only |
| GET | `.../export/r-kit` | Editor | 10/min | R-Kit ZIP (CSV + auto-generated `qmethod` script) |
| GET | `.../export/package` | Editor | 10/min | Research package ZIP (CSV + JSON + codebook + metadata) |
| GET | `.../export/config` | Viewer | — | Study configuration only (no participant data) |
| POST | `/api/admin/studies/validate-import` | Researcher | 30/min | Dry-run validation of an exported config |
| POST | `/api/admin/studies/import` | Researcher | 30/min | Import a config; creates a new DRAFT study |
| GET | `.../dump` | Editor | 10/min | Full study + participant placements as JSON |
| GET | `.../storage-usage` | Viewer | — | Audio storage stats (bytes used, quota, % used) |
| GET | `.../participants/{participant_id}/export/csv` | Editor | 10/min | Single participant as CSV |
| GET | `.../participants/{participant_id}/export/json` | Editor | 10/min | Single participant as JSON |
| GET | `.../participants/{participant_id}/export/audio` | Editor | 10/min | All audio recordings for a participant as ZIP |

### Admin — participants (`/api/admin/studies/{slug}`)

| Method | Path | Min role | Rate limit | Purpose |
| --- | --- | --- | --- | --- |
| GET | `.../participants` | Viewer | — | List participants (paginated) |
| GET | `.../participants/{participant_id}` | Researcher | — | Detail: Q-sort entries, postsort answers, audio metadata |
| PATCH | `.../participants/{participant_id}/discard` | Researcher | 30/min | Flag/unflag a participant for exclusion (preserves the record) |
| DELETE | `.../participants` | Editor | 30/min | Delete all participants (study must be in DRAFT) |
| DELETE | `.../participants/{participant_id}/personal-data` | Editor | 30/min | Admin-mediated GDPR Art. 17 erasure (preserves Q-sort data) |

### Admin — projects (`/api/admin/projects`)

| Method | Path | Min role | Rate limit | Purpose |
| --- | --- | --- | --- | --- |
| GET | `/api/admin/projects` | authenticated | — | List projects the user is a member of, with their role |
| POST | `/api/admin/projects` | authenticated | 30/min | Create a project (creator becomes Owner) |
| GET | `/api/admin/projects/{slug}` | member | — | Project detail |
| PATCH | `/api/admin/projects/{slug}` | Owner | 30/min | Update project title or slug |
| DELETE | `/api/admin/projects/{slug}` | Owner | 30/min | Delete a project (must contain no studies) |
| GET | `/api/admin/projects/{slug}/members` | Viewer | — | List members and their roles |
| PATCH | `/api/admin/projects/{slug}/members/{user_id}` | Owner | 30/min | Update a member's role; audit-logged |
| DELETE | `/api/admin/projects/{slug}/members/{user_id}` | Owner | 30/min | Remove a member (cannot self-remove) |
| POST | `/api/admin/projects/{slug}/invitations` | Owner | 30/min | Send a project invitation by email; logs the URL if SMTP is unconfigured |

### Admin — invitations (`/api/admin/invitations`)

| Method | Path | Auth | Rate limit | Purpose |
| --- | --- | --- | --- | --- |
| GET | `/api/admin/invitations/verify` | public | — | Verify a token; returns email + project + role |
| POST | `/api/admin/invitations/accept` | authenticated | 30/min | Accept an invitation with an existing account (email must match the token) |

### Admin — recruitment (`/api/admin/recruitment`)

| Method | Path | Min role | Rate limit | Purpose |
| --- | --- | --- | --- | --- |
| GET | `/api/admin/recruitment/{slug}/links` | Viewer | — | List recruitment links for a study |
| POST | `/api/admin/recruitment/{slug}/links` | Editor | 30/min | Create one or more links (max 100 per call) |
| DELETE | `/api/admin/recruitment/links/{link_id}` | Editor | 30/min | Revoke a link |

### Admin — concourses (`/api/admin/concourses`)

| Method | Path | Min role | Rate limit | Purpose |
| --- | --- | --- | --- | --- |
| GET | `/api/admin/concourses` | member | — | List concourses in the active project |
| POST | `/api/admin/concourses` | Researcher | 30/min | Create a concourse |
| GET | `/api/admin/concourses/{concourse_id}` | member | — | Concourse with items and comment counts |
| PATCH | `/api/admin/concourses/{concourse_id}` | Researcher | 30/min | Update concourse title / description |
| DELETE | `/api/admin/concourses/{concourse_id}` | Owner | 30/min | Delete a concourse |
| POST | `/api/admin/concourses/{concourse_id}/items` | Researcher | 60/min | Create a single item |
| POST | `/api/admin/concourses/{concourse_id}/items/bulk` | Researcher | 10/min | Bulk-create items |
| POST | `/api/admin/concourses/{concourse_id}/items/import` | Researcher | 10/min | Parse + dedupe + create from a text block |
| PATCH | `/api/admin/concourses/{concourse_id}/items/{item_id}` | Researcher | 60/min | Update item text |
| DELETE | `/api/admin/concourses/{concourse_id}/items/{item_id}` | Researcher | 60/min | Delete an item |
| GET | `/api/admin/concourses/{concourse_id}/items/{item_id}/versions` | member | — | Item version history |
| GET | `/api/admin/concourses/{concourse_id}/items/{item_id}/comments` | member | — | Comments on an item |
| POST | `/api/admin/concourses/{concourse_id}/items/{item_id}/comments` | Researcher | 30/min | Add a comment |
| GET | `/api/admin/concourses/tags` | member | — | List tags in the active project |
| POST | `/api/admin/concourses/tags` | Researcher | 30/min | Create a tag |
| DELETE | `/api/admin/concourses/tags/{tag_id}` | Researcher | 30/min | Delete a tag |

### Admin — users (`/api/admin/users`)

| Method | Path | Auth | Rate limit | Purpose |
| --- | --- | --- | --- | --- |
| GET | `/api/admin/users` | superuser | — | List system users |
| POST | `/api/admin/users` | superuser | 30/min | Create a system user |
| DELETE | `/api/admin/users/{user_id}` | superuser | 30/min | Delete a user (cannot self-delete) |

---

## Common payload shapes

### `GET /api/study/{slug}` response

```json
{
  "slug": "example-study",
  "title": "Example Study",
  "description": "Study description...",
  "instructions": "Instructions for participants...",
  "statements": [
    { "id": 1, "text": "Statement text..." },
    { "id": 2, "text": "Another statement..." }
  ],
  "grid_config": [
    { "score": -3, "capacity": 2 },
    { "score": -2, "capacity": 3 }
  ],
  "presort_config": { },
  "postsort_config": { }
}
```

### `POST /api/submit` request

```json
{
  "study_slug": "example-study",
  "session_token": "123e4567-e89b-12d3-a456-426614174000",
  "language_used": "en",
  "presort_answers": { "age": 25, "gender": "female" },
  "qsort": [
    { "statement_id": 1, "grid_score": 3, "card_comment": "Resonates strongly" },
    { "statement_id": 2, "grid_score": -2, "card_comment": null }
  ],
  "postsort_answers": {
    "missing_statement": "",
    "general_comment": "Overall feedback..."
  }
}
```

Response: `{ "status": "success", "confirmation_code": "ABC123XYZ", "id": 42 }`

---

## Rate limiting

Rate limiting is enforced by `slowapi`. Limits are per-IP, per-time-window. The IP key is taken from the immediate TCP peer; `X-Forwarded-For` is honoured only when the peer is in `TRUSTED_PROXIES` (defaults to empty — see [configuration.md](configuration.md)).

Limits in production are set per-endpoint via `@limiter.limit(...)`. Endpoints without a decorator are unlimited at the slowapi layer; CORS / auth still apply. The per-endpoint table above is the source of truth; the table below summarises the highest-traffic public limits.

| Endpoint | Limit |
| --- | --- |
| `GET /api/study/{slug}` | 120/min |
| `POST /api/submit` | 60/min |
| `POST /api/study/{slug}/consent` | 60/min |
| `POST /api/audio/upload` | 10/min |
| `POST /api/study/{slug}/unlock` | 10/min |
| `POST /api/token` | 5/min |
| `POST /api/register` | 5/min |
| `POST /api/admin/studies/{slug}/anonymise-bulk` | 5/min |

Rate limiting is disabled in the test suite. In production with Redis configured (`REDIS_URL`), counters are shared across workers; otherwise an in-memory store is used per process.

---

## Error response format

All errors follow a single JSON schema:

```json
{
  "code": 422,
  "message": "Validation Error",
  "details": [
    {
      "loc": ["body", "qsort", 0, "grid_score"],
      "msg": "field required",
      "type": "value_error.missing"
    }
  ]
}
```

| Field | Type | Description |
| --- | --- | --- |
| `code` | integer | HTTP status code |
| `message` | string | Human-readable summary |
| `details` | array \| null | Validation entries (Pydantic) or conflict info |

Common codes:

| Code | Meaning |
| --- | --- |
| 400 | Bad request (malformed input) |
| 401 | Authentication required or invalid token |
| 403 | Insufficient permissions, or wrong study password |
| 404 | Resource not found |
| 409 | Conflict (duplicate slug, optimistic-locking conflict) |
| 422 | Validation error (missing or invalid fields) |
| 429 | Rate limit exceeded |
| 507 | Insufficient storage (audio quota exceeded) |

---

## Security headers

Sent on every response by the security middleware:

| Header | Value |
| --- | --- |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` |
| `Content-Security-Policy` | Restricts sources; allows the configured S3 endpoint for audio |
| `X-Frame-Options` | `DENY` |
| `X-Content-Type-Options` | `nosniff` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Permissions-Policy` | Restricts camera; allows microphone (self) |
