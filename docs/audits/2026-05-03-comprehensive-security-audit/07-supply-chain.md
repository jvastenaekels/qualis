# Wave 6 — Supply Chain

**Date:** 2026-05-03
**Auditor:** Claude Opus 4.7
**Codebase ref:** commit `e46a66f6` of `audit/6-supply-chain`

## Scope

Operational hardening across:
- CI workflows (gitleaks gate, pip-audit gate, npm-audit gate, semgrep)
- GitHub Actions third-party SHA pinning
- Dockerfile USER directive
- nginx `$host` validation
- CSP `style-src 'unsafe-inline'` tightening
- Direct-pin promotion of CVE-fixed transitive deps
- `consumed_email_tokens` cleanup scheduling
- `request.url`-in-loggers lint rule
- Dependabot / Renovate config

Wave 6 closes 9 carry-overs from prior waves. Uses **F-07-NNN** for any net-new findings.

No mandatory code-reviewer gate per spec.

## Inventory

### CI workflows

#### `.github/workflows/ci.yml`

Six jobs: `documentation-check`, `backend-lint`, `backend-tests`, `frontend-lint`,
`frontend-tests`, `e2e-study`, `e2e-admin`. Triggers: `workflow_dispatch`, `push` on
`main` / `develop`, `pull_request` on `main` / `develop`.

GitHub Actions used (extracted via `grep 'uses:'`):

| Action | Owner | Type | Pinning |
|--------|-------|------|---------|
| `actions/checkout@v4` | github (first-party) | first-party | tag-pinned |
| `actions/setup-node@v4` | github (first-party) | first-party | tag-pinned |
| `actions/cache@v4` | github (first-party) | first-party | tag-pinned |
| `actions/upload-artifact@v4` | github (first-party) | first-party | tag-pinned |
| `astral-sh/setup-uv@v5` | astral-sh | **third-party** | tag-pinned (NOT SHA) |
| `lycheeverse/lychee-action@v1.9.0` | lycheeverse | **third-party** | tag-pinned (NOT SHA) |

**`backend-lint` security battery in CI:** Bandit, pip-audit (with five `--ignore-vuln`
entries mirroring `Makefile` and rationalised in `SECURITY.md`), Radon, import-linter,
deptry, vulture. **pip-audit is already wired in `ci.yml` step at line 47.** Wave 6
Task 3 still adds a dedicated `security-scans.yml` because (a) `ci.yml` runs only when
the lint job runs (skipped on docs-only changes), (b) gitleaks and semgrep are missing
from the existing battery, (c) a separate workflow keeps the security gate visible.

**`frontend-lint` battery:** Biome, dependency-cruiser, tsc, jscpd, knip, npm-audit
(with two accepted xlsx GHSAs), i18n-check, API sync.

**Postgres service** spec is locked at `image: postgres:16` for both test jobs and both
e2e jobs. Floating major-tag — acceptable because Postgres binary compatibility is
maintained within a major.

#### `.github/workflows/release-please.yml`

Single job invoking `googleapis/release-please-action@v4`. **Third-party (Google), tag-pinned.**

### GitHub Actions pinning summary

- 4 distinct first-party actions (`actions/{checkout,setup-node,cache,upload-artifact}`)
  → tag-pinned (acceptable: GitHub-trusted).
- 3 distinct third-party actions:
  - `astral-sh/setup-uv@v5` (used in 4 places in `ci.yml`)
  - `lycheeverse/lychee-action@v1.9.0` (used once)
  - `googleapis/release-please-action@v4` (used once in `release-please.yml`)
  → all tag-pinned, NOT SHA-pinned. **Task 4 fixes this.**

### Procfile

Two entries:
- `postdeploy: cd backend && ENVIRONMENT=${ENVIRONMENT:-production} python scripts/postdeploy.py`
  — runs Alembic migrations + seed data (executed once per deploy by Scalingo).
- `web: cd backend && ENVIRONMENT=${ENVIRONMENT:-production} gunicorn app.main:app --workers 2 --worker-class uvicorn.workers.UvicornWorker --bind 0.0.0.0:$PORT --access-logfile - --error-logfile - --timeout 120`
  — long-running web process, gunicorn supervising 2 uvicorn workers.

**No `worker` line.** F-03-003 (consumed_email_tokens cleanup) has nowhere to attach a
periodic schedule via Procfile; Scalingo's recurring scheduler is the standard fit.
Task 8 documents the operator config.

### Dockerfiles

#### `backend/Dockerfile`

```Dockerfile
FROM python:3.13-slim
WORKDIR /app
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev
COPY . .
CMD ["sh", "-c", "uv run python init_db.py && uv run uvicorn app.main:app --host 0.0.0.0 --port 8000"]
EXPOSE 8000
```

**Issues for Wave 6:**
- No `USER` directive — container runs as root (F-02-006). Task 5 fixes.
- `uv:latest` floating — minor risk; the build context isolates this and uv
  invocations are deterministic via `uv.lock`.
- `python:3.13-slim` floating-minor — acceptable; floor versioning per Python team.
- `init_db.py` runs at container start (i.e. on every replica), not at deploy. Test
  for races was implicit; not in scope here.

#### `frontend/Dockerfile`

```Dockerfile
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
```

**Issues for Wave 6:**
- Multi-stage. Production image is `nginx:alpine` which runs as `nginx` user by default
  (UID 101 in Alpine images). No explicit `USER` directive needed; Task 5 verifies and
  notes.
- `nginx:alpine` floating tag.

### nginx config (`frontend/nginx.conf`)

```
server {
    listen 80;
    root /usr/share/nginx/html;
    index index.html;

    location /api/ {
        proxy_pass http://backend:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

**Issues for Wave 6:**
- `proxy_set_header Host $host;` forwards whatever `Host` header the client sent
  (F-02-007). The backend trusts `Host` for CORS / URL-construction. Mitigation: an
  allowlist guard before any handler. Task 5 fixes (configurable for self-hosters).
- `listen 80;` (HTTP only) — TLS terminates at the Scalingo edge proxy. HSTS comes from
  the backend via `SecurityHeadersMiddleware`.
- No security headers added in nginx — they all come from the backend.

### Migration scripts

- `backend/scripts/migrate.py` — invoked by `Procfile postdeploy` (via
  `backend/scripts/postdeploy.py`); thin Alembic `upgrade head` wrapper. Trust boundary:
  runs at the application service's privilege level on the deploy host. The migration
  chain is in CLAUDE.md (21 migrations, head `cb2c7f6f0cfe`).
- Four legacy one-off migration scripts (`migrate_add_study_updated_at.py`,
  `migrate_process_steps.py`, `migrate_projects_config.py`, `migrate_projects_data.py`)
  — dormant, kept for historical reference, not in the deploy path.

### Cleanup scripts

- `backend/scripts/cleanup_consumed_email_tokens.py` — exists; deletes
  `consumed_email_tokens` rows older than 7 days. **Not scheduled** (F-03-003). Task 8
  documents Scalingo cron operator config.

### Dependency-update bots

`.github/` contents: `pull_request_template.md`, `workflows/`. **No `dependabot.yml`,
no `renovate.json`.** Task 10 creates Dependabot config.

### Top-blast-radius dependencies

#### Backend (`backend/pyproject.toml`)

Pinned to specific versions:
- `asyncpg==0.31.0`
- `pydantic==2.13.3`
- `sqlalchemy[asyncio]==2.0.45`

Floor-pinned (`>=`):
- `fastapi[standard]>=0.136.0,<0.137.0` — minor band, prevents 0.137.x breakages.
- `pyjwt>=2.12.0` — JWT token signing/verification (auth core).
- `bcrypt>=4.1.0` — password hashing.
- `gunicorn>=23.0.0` — WSGI process manager (production runtime).
- `httpx>=0.27.0` — async HTTP client (currently webhooks/external).
- `starlette>=0.40.0` — ASGI framework under FastAPI.
- `pyotp>=2.9.0` — TOTP secret generation.
- `slowapi>=0.1.9` — rate-limit middleware.
- `boto3>=1.36.17` — S3 audio storage.
- `sentry-sdk[fastapi]>=2.0.0` — error reporting.

**Transitive deps closed in Wave 1 (lockfile-only):**
- `pygments>=2.20.0` (CVE-2026-4539)
- `python-dotenv>=1.2.2` (CVE-2026-28684)
- `requests>=2.33.0` (CVE-2026-25645)

These three are NOT in the direct `dependencies` list; they're pulled by other deps and
the lockfile pins them at the fix versions. Wave 6 Task 7 promotes them to direct entries.

#### Frontend (`frontend/package.json`)

Top-blast-radius (caret-pinned, allowing minor updates):
- `react@^19.2.3`, `react-dom@^19.2.3` — UI runtime.
- `@dnd-kit/core@^6.3.1`, `@dnd-kit/sortable@^10.0.0`, `@dnd-kit/modifiers@^9.0.0` — drag-and-drop kernel.
- `react-i18next@^17.0.4` — i18n.
- `react-router-dom@^7.11.0` — routing.
- `@radix-ui/react-*` (15 packages) — accessibility primitives.
- `@tanstack/react-query@^5.90.16` — server cache.
- `framer-motion@^12.23.26` — animation.
- `dompurify@^3.4.1` — HTML sanitisation (security-critical).
- `xlsx@^0.18.5` — accepted-risk CVE per `SECURITY.md`.
- `zod@^3.22.0` — schema validation.

`package-lock.json` pins exact versions transitively. Caret floors prevent minor-version
drift backwards on `npm ci`.

### CSP context (for Task 6)

`backend/app/middleware/security.py:25-33`:

```python
self._csp = (
    f"default-src 'self'; script-src 'self'; "
    f"style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
    f"img-src 'self' data: https:; "
    f"font-src 'self' data: https: https://fonts.gstatic.com; "
    f"connect-src 'self' https:; "
    f"media-src {media_sources}; "
    f"frame-ancestors 'none'; upgrade-insecure-requests;"
)
```

`grep -rn 'style=' frontend/src/ | wc -l` → **73 inline-style sites**, predominantly:
- framer-motion `MotionValue` style props (`style={{ x, y, rotate }}`) — cannot be
  refactored to Tailwind classes (they're imperative animation values).
- Dynamic per-element layout (`style={{ height: ${pct}% }}`) — Tailwind arbitrary
  values cover most but not the framer-motion case.

Task 6 conclusion (preview): keep `'unsafe-inline'`; defer nonce-based CSP to Wave 6b.

### `request.url` logger surface (for Task 9)

`app/middleware/log_scrub.py:_TARGET_LOGGER_NAMES`:
- `uvicorn.access`
- `app.middleware.errors`
- `app.routers.logs`

Task 9 adds an AST-walk script that flags `logger.{info,warning,error,exception,debug}(…
request.url …)` outside files registered for those loggers.

## Summary

No new blockers/majors/minors filed in Wave 6. The wave's deliverable is
operational hardening — closing existing carry-overs and adding CI gates
that prevent regressions. F-07-NNN ID space remains unused.

| Severity | Count |
|----------|-------|
| blocker | 0 |
| major | 0 |
| minor | 0 |
| observation | 0 |

## Findings

No net-new findings filed. The eight wave items below are infrastructure
deliverables, not vulnerabilities.

### Wave 6 deliverables (cross-reference)

| Item | Closes | Commit |
|------|--------|--------|
| Inventory of CI/deploy/dep surface | — (Task 2) | `734d0077` |
| Pin third-party GHA actions by SHA | Wave 6 plan-time observation | `bb5ac9ac` |
| Backend Dockerfile USER + nginx host allowlist | F-02-006, F-02-007 | `f4c4dd65` |
| Direct-pin promotion (pygments, python-dotenv, requests) | Wave 1 NEW observation | `a264d740` |
| `security-scans.yml` (gitleaks, pip-audit, npm audit, semgrep, logger-URL lint) | F-01-002 partial fix, pip-audit gate, npm-audit gate, request.url lint | `76763853` |
| F-03-003 cleanup script — operator cron documented | F-03-003 | `b6f20c84` |
| Dependabot config | Wave 6 spec item | `2ba66121` |

## Carry-overs status

- **F-01-002** partial-fix gap (gitleaks CI gate) — **closed** in `76763853`
  via `.github/workflows/security-scans.yml` `gitleaks` job (CLI install,
  `gitleaks detect --source . --redact --verbose` on every PR + push).
- **F-01-013** (CSP `style-src 'unsafe-inline'`) — **deferred to Wave 6b**.
  Rationale: `grep -rn 'style=' frontend/src/ | wc -l` returns 73 inline-style
  sites; ~6 are framer-motion `MotionValue` props (`style={{ x, y, rotate }}`
  in `CardStack.tsx`, `SortingAnimation.tsx`) which **cannot** be refactored
  to Tailwind classes — they're imperative animation values bound to motion
  state. The remaining ~60 sites mix dynamic per-element layout
  (`style={{ height: '${pct}%' }}`) and CSS-variable assignments. The proper
  fix is a nonce-based CSP (per-request nonce attached to every `<style
  nonce="…">` and to the header `style-src 'self' 'nonce-…'`). This requires
  per-render nonce wiring through React (custom Vite plugin + ASGI
  middleware emitting the nonce + every Tailwind/inline-style site
  inheriting it), exceeding Wave 6's plan budget. **Status:** keep
  `'unsafe-inline'` for now; CSP nonce work scheduled for Wave 6b.
- **F-02-004** (pip 26.0 CVE-2026-3219) — **still deferred** (no upstream
  fix as of 2026-05-03; mirrored in `pip-audit --ignore-vuln` lists).
- **F-02-006** (Dockerfile `USER`) — **closed** in `f4c4dd65`. Backend:
  `groupadd app && useradd app` + `chown -R app:app /app` + `USER app`
  before `CMD`. Frontend: documented that `nginx:alpine` already drops
  to UID 101 for workers (master must remain root to bind :80).
- **F-02-007** (nginx `$host`) — **closed** in `f4c4dd65`. `if ($host !~
  ^(qualis\.example\.org|localhost|127\.0\.0\.1)$) { return 444; }` —
  operator-editable allowlist; 444 is the documented host-header probe
  response.
- **F-03-003** (`consumed_email_tokens` cleanup not scheduled) — **closed**
  in `b6f20c84`. Documented Scalingo Scheduler addon + `cron.json` daily
  04:00 UTC run; manual one-off invocation also documented; deferred to
  the operator on platforms other than Scalingo with the same intent.
- **pip-audit CI gate** (Wave 1 NEW observation) — **closed** in `76763853`
  via `security-scans.yml` `pip-audit` job (mirrors the existing
  ci.yml backend-lint ignore list).
- **direct-pin promotion** (Wave 1 NEW observation) — **closed** in
  `a264d740`. `backend/pyproject.toml` now lists `pygments>=2.20.0`,
  `python-dotenv>=1.2.2`, `requests>=2.33.0` as direct deps. Regression:
  `test_supply_chain_pinning.py::test_pyproject_pins_wave1_cve_floors`.
- **request.url-in-loggers lint** (Wave 2 NEW observation) — **closed** in
  `76763853`. `backend/scripts/lint_logger_urls.py` AST-walks
  `backend/app/**/*.py`, fails on any `logger.<level>(... .url ...)` /
  `... .query_string ...` outside `middleware/errors.py` and
  `routers/logs.py` (the two files whose loggers are in
  `_TARGET_LOGGER_NAMES`). Wired into `security-scans.yml`. 9 unit tests
  in `test_lint_logger_urls.py` cover positional, f-string, %-format,
  kwarg, and `self.logger` variants plus an end-to-end live-tree run.

## Resolved since prior

Six of the nine carry-overs are closed by Wave 6 commits (see table above).
F-01-013 is deferred to Wave 6b with documented rationale; F-02-004
remains deferred indefinitely until an upstream pip fix lands. The Wave 6
spec items (Dependabot config, GHA SHA pinning, dep-update bot presence)
are also delivered.

## Wave 6b backlog

- **F-01-013** CSP nonce-based `style-src` — see deferral rationale above.
  Estimated scope: Vite plugin to inject nonce into every `<style>`,
  `<link>`, and `style={…}` site; ASGI middleware to emit the per-request
  nonce header; React context to thread the nonce through component tree;
  e2e regression covering animated components (CardStack, SortingAnimation,
  framer-motion-driven UI). Plan a dedicated wave doc when scheduled.

## False positives — not filed
