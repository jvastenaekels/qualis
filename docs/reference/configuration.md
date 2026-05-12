# Configuration Reference

Two layers of configuration apply to a Qualis deployment:

1. **Per-study configuration** — JSON stored in the `studies` table; controls the participant experience and the analytical pipeline. Documented in [Study fields](#study-fields).
2. **Application settings** — Environment variables read by the FastAPI backend at startup. Documented in [Environment / app settings](#environment--app-settings).

For the import/export wrapper around per-study configuration, see [`study-configuration-format.md`](study-configuration-format.md).

---

## Study fields

### `grid_config`

The shape of the Q-sort table. An array of column objects.

```json
[
  { "score": -4, "capacity": 2 },
  { "score": -3, "capacity": 3 },
  { "score": -2, "capacity": 4 },
  { "score": -1, "capacity": 5 },
  { "score":  0, "capacity": 6 },
  { "score":  1, "capacity": 5 },
  { "score":  2, "capacity": 4 },
  { "score":  3, "capacity": 3 },
  { "score":  4, "capacity": 2 }
]
```

| Field | Type | Description |
| ----- | ---- | ----------- |
| `score` | integer | Column value. |
| `capacity` | integer | Number of cards that fit in the column. |

The relationship between `sum(capacity)` and the statement count depends on `distribution_mode` (see below).

### `distribution_mode`

How strictly the grid enforces per-column capacities. Default `"forced"`.

| Value | Activation rule | Submission rule | Notes |
| ----- | --------------- | --------------- | ----- |
| `"forced"` | `sum(capacity) == len(statements)` | Each column holds exactly its declared capacity. | Classical Brown-school default (Brown 1980; Watts & Stenner 2012). |
| `"free"` | `sum(capacity) >= len(statements)` (the grid must fit every statement) | Total submitted count must equal the Q-set size; per-column capacities are not enforced — columns may absorb overflow at sort time. | Used when the slot constraint is itself viewed as an analytical artefact (Brown et al. 2015). |
| `"flexible"` | `sum(capacity) == len(statements)` | Total enforced; per-column capacities are soft hints (designer warnings only). | Qualis-specific compromise between forced and free. |

### `rough_sort_enabled`

Boolean. When true (default), participants go through a 3-pile triage (agree / neutral / disagree) before the fine-sort grid. When false, participants go directly from pre-sort to the fine-sort grid and place items from a single horizontally-scrollable deck. Only ~38% of published Q studies use rough-sorting (Dieteren et al. 2023).

### `presort_config`

Demographic / pre-sort fields. Supports `text`, `textarea`, `number`, `select`, `radio`, `checkbox`, `date`, and `email` field types. Definitions are open-ended JSON; the wire shape is not enforced at the schema level beyond validity.

```json
{
  "age": {
    "type": "number",
    "label": { "en": "Age", "fr": "Âge" },
    "required": true,
    "min": 18
  },
  "gender": {
    "type": "select",
    "options": [
      { "value": "Male",   "label": { "en": "Male",   "fr": "Homme" } },
      { "value": "Female", "label": { "en": "Female", "fr": "Femme" } }
    ],
    "label": { "en": "Gender", "fr": "Genre" },
    "required": true
  }
}
```

### `postsort_config`

Final phase of the participant experience.

```json
{
  "extreme_columns": [-4, 4],
  "ask_missing": true,
  "ask_general_comment": true,
  "audio": { "max_storage_mb": 100 }
}
```

| Field | Type | Description |
| ----- | ---- | ----------- |
| `extreme_columns` | int[] | Column scores for which participants are asked for comments. |
| `ask_missing` | boolean | If true, participants are nudged to fill any empty slots. |
| `ask_general_comment` | boolean | If true, shows a final free-text comment field. |
| `audio.max_storage_mb` | integer | Per-study quota for audio recordings (default 100 MB). Uploads exceeding the quota return HTTP 507. |

### `show_statement_codes`

Boolean. If true, statement identifiers (`S1`, `S2`, …) appear in the corner of each card and in zoom overlays. Default `false`.

### `randomize_statement_order`

Boolean. If true, statement order is shuffled deterministically per participant session token (stable across page refreshes). Default `false`.

### `symmetry_lock`

Boolean. If true, the designer enforces symmetric column capacities (`-3` capacity equals `+3` capacity, etc.). Default `true`.

### `default_language`

ISO 639-1 fallback language code. Resolution order:

1. The participant's requested language, if a translation exists.
2. The study's `default_language`.
3. The first available translation.

### `access_password`

Bcrypt hash. When set, participants must enter the correct password (verified via `POST /api/study/{slug}/unlock`) before the study renders. `null` = publicly accessible.

### `StudyTranslation`

Per-language content stored in `study_translations`.

| Field | Type | Description |
| ----- | ---- | ----------- |
| `language_code` | string | ISO 639-1 code (`"en"`, `"fr"`, …). |
| `title` | string | Study title. |
| `subtitle` | string \| null | Tagline shown on the welcome page. |
| `description` | string | Welcome page description. |
| `objective` | string \| null | Research objective. |
| `condition_of_instruction` | string \| null | Core sorting prompt. |
| `pre_instruction` | string \| null | Instructions for the rough-sort triage phase. |
| `instructions` | string \| null | Markdown content for the welcome page. |
| `consent_title` | string \| null | Title for the consent step. |
| `consent_description` | string \| null | Full text of the consent form. |
| `ui_labels` | object | Override default button text (e.g. `{"start_button": "Go!"}`). |
| `process_steps` | array | Custom step definitions for the progress indicator. |
| `methodology_tips` | array | Methodology tips shown during sorting. |
| `step_help` | object | Per-step help content for the help overlay. |

---

## Environment / app settings

All settings are read from the `Settings` Pydantic class in `backend/app/core/config.py`. Values come from `.env` at the repository root (and `../.env` as fallback). See `.env.example` for a template.

### Core

| ENV_VAR | Type | Default | Description |
| ------- | ---- | ------- | ----------- |
| `API_PREFIX` | string | `/api` | Prefix for API routes. |
| `PROJECT_NAME` | string | `Qualis API` | Application display name. |
| `ENVIRONMENT` | string | `production` | One of `production`, `development`, `test`. Controls test-router registration and a few defaults. |
| `FRONTEND_URL` | string | `http://localhost:5173` | Public frontend URL; used in outgoing emails. |

### Authentication

| ENV_VAR | Type | Default | Description |
| ------- | ---- | ------- | ----------- |
| `SECRET_KEY` | string | dev-only | JWT signing key. **Required in production.** Generate with `python3 -c 'import secrets; print(secrets.token_urlsafe(48))'`. |
| `ALGORITHM` | string | `HS256` | JWT signing algorithm. |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | int | `480` | Access token lifetime (minutes). |
| `IP_HASH_SALT` | string | dev-only | Salt for SHA-256 hashing of participant IPs. **Required in production.** |

### Database

| ENV_VAR | Type | Default | Description |
| ------- | ---- | ------- | ----------- |
| `DATABASE_URL` | string \| optional | dummy URL for CI | Async Postgres URL (`postgresql+asyncpg://…`). Required in real deployments. |
| `TEST_DATABASE_URL` | string \| optional | `postgresql+asyncpg://postgres:postgres@localhost:5432/qualis_test` | Separate URL used by the test suite. |

### CORS / proxies

| ENV_VAR | Type | Default | Description |
| ------- | ---- | ------- | ----------- |
| `ALLOWED_ORIGINS` | string (CSV) | localhost dev ports | Comma-separated list of allowed origins. Production must override. |
| `TRUSTED_PROXIES` | string (CSV) | empty | Reverse-proxy IPs trusted for `X-Forwarded-For`. Empty = use direct peer IP only. |

### Observability

| ENV_VAR | Type | Default | Description |
| ------- | ---- | ------- | ----------- |
| `SENTRY_DSN` | string \| optional | `None` | Server-side Sentry DSN. PII sending is hardcoded off. |
| `SENTRY_TRACES_SAMPLE_RATE` | float | `0.0` | Performance trace sampling rate (0–1). |

### Email (SMTP)

If `SMTP_HOST` is unset, the backend falls back to logging invitation URLs instead of sending email.

| ENV_VAR | Type | Default | Description |
| ------- | ---- | ------- | ----------- |
| `SMTP_HOST` | string \| optional | `None` | SMTP server hostname. |
| `SMTP_PORT` | int \| optional | `587` | SMTP server port. |
| `SMTP_TLS` | bool | `True` | Use TLS for SMTP. |
| `SMTP_USER` | string \| optional | `None` | SMTP authentication username. |
| `SMTP_PASSWORD` | string \| optional | `None` | SMTP authentication password. |
| `EMAILS_FROM_EMAIL` | string \| optional | `None` | Sender address. |
| `EMAILS_FROM_NAME` | string \| optional | falls back to `PROJECT_NAME` | Sender display name. |

### Audio

| ENV_VAR | Type | Default | Description |
| ------- | ---- | ------- | ----------- |
| `AUDIO_MAX_FILE_SIZE_MB` | int | `10` | Max audio file size (MB). |
| `AUDIO_MAX_DURATION_SECONDS` | int | `300` | Max audio recording duration (seconds). |
| `AUDIO_ALLOWED_MIME_TYPES` | list[string] | `["audio/webm", "video/webm", "audio/mp4", "audio/mpeg"]` | Accepted MIME types. |

### Object storage (S3 / S3-compatible)

| ENV_VAR | Type | Default | Description |
| ------- | ---- | ------- | ----------- |
| `S3_ENDPOINT_URL` | string \| optional | `None` | Custom endpoint (e.g. Cellar, MinIO, R2). Empty = use AWS default. |
| `S3_REGION` | string | `us-east-1` | AWS / compatible region code. |
| `S3_BUCKET_NAME` | string \| optional | `None` | Bucket for audio. Empty disables audio recording. |
| `S3_ACCESS_KEY_ID` | string \| optional | `None` | Access key. |
| `S3_SECRET_ACCESS_KEY` | string \| optional | `None` | Secret key. |

### Bootstrap script variables

These are read by the `init_db.py` and `script_utils.py` helpers, not by the Pydantic settings class.

| ENV_VAR | Type | Default | Description |
| ------- | ---- | ------- | ----------- |
| `ADMIN_EMAIL` | string | `admin@example.com` | Initial admin account email. |
| `ADMIN_PASSWORD` | string | `admin123` | Initial admin password. Override before any production bootstrap. |

### Frontend build-time (Vite)

Read at build time by Vite, not by the backend.

| ENV_VAR | Type | Default | Description |
| ------- | ---- | ------- | ----------- |
| `VITE_SENTRY_DSN` | string \| optional | empty | Browser-side Sentry DSN, baked into the bundle. |
| `VITE_ENVIRONMENT` | string \| optional | falls back to Vite `MODE` | Environment tag used by the browser Sentry init. |
