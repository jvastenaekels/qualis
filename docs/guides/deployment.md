# Deployment

How to deploy Qualis to production. The application ships as a single FastAPI service that also serves the built React frontend, plus a Postgres database. Audio, when used, lives in S3-compatible object storage.

For the canonical list of environment variables (with types and defaults), see [`../reference/configuration.md#environment--app-settings`](../reference/configuration.md#environment--app-settings). This guide covers how to wire them on each supported platform.

---

## Supported platforms

| Platform | Difficulty | Status |
| -------- | ---------- | ------ |
| **Scalingo** | Easy | Documented below; primary supported target. |
| **Docker (self-host)** | Medium | `docker-compose.production.yml` in repo root; see [Docker](#docker). |
| **Render** | Easy | Generic Python + Postgres app; same env vars as Scalingo. |
| **Heroku** | Medium | Generic Python buildpack; same env vars and `Procfile` apply. |

The Scalingo path is the one used in production by the maintainer; the others are known to work with the standard Python buildpack but are not documented step-by-step.

---

## Scalingo

Qualis is deployed as a single application; the FastAPI backend serves the pre-built React frontend.

```mermaid
graph LR
    subgraph Scalingo
        App[Qualis App]
        DB[(PostgreSQL)]
    end

    User([Users]) --> App
    App --> DB
```

### Prerequisites

- A Scalingo account and the [Scalingo CLI](https://doc.scalingo.com/cli).
- The repository pushed to GitHub or GitLab.

### Steps

1. **Create the app**

   ```bash
   scalingo create qualis
   ```

2. **Add PostgreSQL**

   ```bash
   scalingo --app qualis addons-add postgresql postgresql-starter-512
   ```

3. **Set environment variables**

   Choose the email for the first owner account and generate a password. Save
   the printed password in your password manager before continuing: it is the
   credential you will use for the first login.

   ```bash
   QUALIS_ADMIN_EMAIL="you@institution.example" # replace with your email
   QUALIS_ADMIN_PASSWORD="$(openssl rand -base64 24)"
   printf 'Initial Qualis password: %s\n' "$QUALIS_ADMIN_PASSWORD"

   scalingo --app qualis env-set SECRET_KEY=$(openssl rand -hex 32)
   scalingo --app qualis env-set IP_HASH_SALT=$(openssl rand -hex 32)
   scalingo --app qualis env-set "ADMIN_EMAIL=$QUALIS_ADMIN_EMAIL"
   scalingo --app qualis env-set "ADMIN_PASSWORD=$QUALIS_ADMIN_PASSWORD"
   scalingo --app qualis env-set FRONTEND_URL=https://qualis.osc-fr1.scalingo.io
   scalingo --app qualis env-set ALLOWED_ORIGINS=https://qualis.osc-fr1.scalingo.io
   scalingo --app qualis env-set TRUSTED_PROXIES=\*
   scalingo --app qualis env-set ENVIRONMENT=production
   ```

   The PostgreSQL addon already creates `DATABASE_URL` as an alias of
   `SCALINGO_POSTGRESQL_URL`; do not copy the connection string into another
   variable. Keeping the alias lets Scalingo rotate the database URL safely.

4. **Deploy**

   ```bash
   git push scalingo main
   ```

The Python buildpack picks up `pyproject.toml` and `package.json` automatically.

### Post-deploy automation

`Procfile` runs the following on every successful build:

- `alembic upgrade head` — applies pending migrations.
- An admin bootstrap step that creates the initial admin account (using `ADMIN_EMAIL` / `ADMIN_PASSWORD`) if the database is empty.

The bootstrap fails closed on an empty production database when either admin
variable is missing or uses a documented demo value. Existing databases, where
an account already exists, are unaffected.

Watch the logs:

```bash
scalingo --app qualis logs -n 100
```

---

## Docker

The root `docker-compose.yml` is deliberately a **local demo**: it contains
public credentials and development secrets. Use it only through `make demo-up`.
Do not expose that stack to a network or adapt it for production.

For a self-hosted production deployment, use the separate, fail-closed Compose
file. It binds Qualis to the host loopback interface so that a TLS reverse proxy
can be the only public entry point.

### Prerequisites

- A Linux server with Git, Docker, and the `docker compose` plugin.
- A public domain pointing to the server.
- A TLS reverse proxy such as Caddy, Traefik, or nginx.

### Steps

1. **Create the private environment file**

   ```bash
   cp .env.production.example .env.production
   openssl rand -hex 32 # QUALIS_DB_PASSWORD
   openssl rand -hex 32 # SECRET_KEY
   openssl rand -hex 32 # IP_HASH_SALT
   openssl rand -base64 24 # ADMIN_PASSWORD
   ```

   Edit `.env.production`: paste each generated value, choose `ADMIN_EMAIL`,
   and replace `qualis.example.org` in `FRONTEND_URL`, `ALLOWED_ORIGINS`, and
   `QUALIS_ALLOWED_HOST_PATTERN`. Use `[.]` for literal dots in the host regex.
   The generated hexadecimal database password is URL-safe.

2. **Validate before starting anything**

   ```bash
   docker compose --env-file .env.production \
     -f docker-compose.production.yml config --quiet
   ```

   This fails when a required value is empty. It must finish without output.

3. **Build and start the stack**

   ```bash
   docker compose --env-file .env.production \
     -f docker-compose.production.yml up --build -d
   docker compose --env-file .env.production \
     -f docker-compose.production.yml ps
   ```

   Configure the reverse proxy to forward the public HTTPS domain to
   `http://127.0.0.1:3000` (or the `QUALIS_HTTP_PORT` you chose). For example,
   a minimal Caddyfile is:

   ```caddyfile
   qualis.example.org {
       reverse_proxy 127.0.0.1:3000
   }
   ```

   Replace the domain and restart Caddy; it obtains the TLS certificate
   automatically. Then sign in with `ADMIN_EMAIL` and `ADMIN_PASSWORD`.

4. **Stop without deleting data**

   ```bash
   docker compose --env-file .env.production \
     -f docker-compose.production.yml down
   ```

   Do not add `--volumes`: the `qualis-pgdata` volume contains the database.
   Back up that volume or PostgreSQL on a schedule before collecting real data.

This baseline does not enable audio uploads, SMTP, or Redis. Add their variables
from the [Configuration reference](../reference/configuration.md#environment--app-settings)
when needed; audio also requires S3-compatible object storage.

---

## Required environment variables

The minimum set for any production deployment:

| Variable | Required | Notes |
| -------- | :------: | ----- |
| `DATABASE_URL` | yes | `postgresql+asyncpg://user:pass@host:5432/db`. |
| `SECRET_KEY` | yes | JWT signing key. Generate with `openssl rand -hex 32`. |
| `IP_HASH_SALT` | yes | Salt for participant IP hashing. Generate the same way. |
| `ALLOWED_ORIGINS` | yes | Comma-separated origin allow-list for CORS. No wildcards. |
| `ENVIRONMENT` | yes | Set to `production`; the test routes (`/api/test/*`) are wired only for `development` / `test`. |
| `FRONTEND_URL` | yes | Public HTTPS origin, used in account and invitation links. |
| `ADMIN_EMAIL` | first deploy | Email of the initial owner created when the database is empty. |
| `ADMIN_PASSWORD` | first deploy | Unique initial password. Demo/template values are rejected in production. |
| `TRUSTED_PROXIES` | behind a proxy | Set to `*` on Scalingo; use explicit proxy IPs on infrastructure you control. |

For the full set (audio, S3, SMTP, Sentry, rate-limiting), see [`../reference/configuration.md#environment--app-settings`](../reference/configuration.md#environment--app-settings).

---

## Manual database operations

Use `--` to separate Scalingo CLI flags from the command arguments.

### Apply migrations

```bash
scalingo --app qualis run -- python backend/scripts/migrate.py
```

### Seed a study

```bash
scalingo --app qualis run -- env API_BASE_URL=http://internal python backend/seed.py backend/data/example-study.json
```

### Database reinitialisation

> [!CAUTION]
> Permanently deletes all data. Use only during initial setup or in a throwaway prototyping environment, before any real data exists.

```bash
scalingo --app qualis run -- python backend/init_db.py --reset
```

To wipe and reseed in one step:

```bash
scalingo --app qualis run -- bash -c "python backend/init_db.py --reset && env API_BASE_URL=http://internal python backend/seed.py backend/data/example-study.json"
```

---

## Health checks

| Endpoint | Purpose |
| -------- | ------- |
| `GET /` | Verifies the frontend is being served. |
| `GET /health` | Backend liveness probe; returns `{"status": "ok"}`. |

---

## SSL

Scalingo provisions SSL certificates automatically. For Docker / VPS deployments, terminate TLS at a reverse proxy (Caddy, Traefik, nginx) and forward to the app on its internal port; if the proxy adds `X-Forwarded-For`, set `TRUSTED_PROXIES` to the proxy's IP so that rate limiting keys on the real client.

---

## Runtime behaviour reference

The following sections document runtime defaults for operators who need to size or tune a deployment. They are reference material, not setup steps.

### Rate limiting

Qualis uses SlowAPI in three modes:

| Mode | When active | Storage |
| ---- | ----------- | ------- |
| Disabled | Test environment | None. |
| Redis | `REDIS_URL` is set | Redis (production with multiple workers). |
| In-memory | Default | Local process memory. |

For multi-process deployments, configure `REDIS_URL` to share rate-limit counters across workers.

### Database connection pool

Pool sizes are tuned per environment:

| Setting | Production | Development |
| ------- | ---------- | ----------- |
| `pool_size` | 3 | 1 |
| `max_overflow` | 2 | 1 |
| Pool pre-ping | enabled | enabled |
| Statement timeout | 30 s | 30 s |
| Idle TX timeout | 60 s | 60 s |

The production sizing (3 + 2 = 5 connections) is designed to fit Scalingo's starter PostgreSQL plans (5–10 slots).

### Startup validation

On startup the backend checks for required tables (`projects`, `users`, `studies`, `participants`, …) and critical columns. If something is missing, it logs a warning with the remediation step (typically `alembic upgrade head`) and continues — it does not fail closed.

### SMTP fallback

When `SMTP_HOST` is unset, invitation emails are logged to stdout instead of being sent. The invitation URL appears in the application logs and in the dashboard.

---

## Email transport (auth flows)

Email-driven auth flows (sign-up verification, password reset, 2FA email-OTP, 2FA self-serve disable) degrade gracefully when SMTP is not configured — sign-ups create immediately-active accounts and none of the email-gate checks block login. Configure the following variables when enabling email auth in production:

| Variable | Default | Notes |
| -------- | ------- | ----- |
| `SMTP_HOST` | — | Required to send any email. Unset = mock-log mode. |
| `SMTP_PORT` | `587` | Standard submission port with STARTTLS. |
| `SMTP_USER` | — | SMTP credentials username. |
| `SMTP_PASSWORD` | — | SMTP credentials password. |
| `EMAILS_FROM_EMAIL` | — | Sender address shown to recipients. Required for a valid From header. |
| `EMAILS_FROM_NAME` | — | Display name for the sender. |
| `EMAIL_VERIFICATION_REQUIRED` | `true` | Enforce email verification on sign-up when SMTP is active. Set to `false` only to test the unverified-account UX with SMTP configured. |
| `EMAIL_VERIFY_TOKEN_EXPIRE_HOURS` | `24` | Validity window for the sign-up verification link. |
| `PASSWORD_RESET_TOKEN_EXPIRE_HOURS` | `1` | Validity window for the password-reset link. |
| `TWOFA_DISABLE_TOKEN_EXPIRE_MINUTES` | `15` | Validity window for the 2FA self-serve disable link. |
| `TWOFA_EMAIL_OTP_EXPIRE_MINUTES` | `5` | Validity window for each 2FA email-OTP code. |
| `TWOFA_EMAIL_OTP_RESEND_COOLDOWN_SECONDS` | `30` | Minimum interval between OTP resend requests per user. |

**Cron cleanup (F-03-003):** consumed email tokens (2FA-disable JTIs, sign-up verification JTIs, password-reset JTIs, email-change JTIs) accumulate in the `consumed_email_tokens` table. The script `backend/scripts/cleanup_consumed_email_tokens.py` deletes rows older than 7 days and is safe to run while the app is live.

> [!IMPORTANT]
> This cleanup is **operator-side**. The application does not auto-schedule it. On Scalingo, configure the [Scalingo Scheduler addon](https://doc.scalingo.com/platform/app/task-scheduling/scalingo-scheduler) (free) with a daily cron entry. Other platforms: add the equivalent system cron / scheduled-task entry.

### Scalingo cron config

Add the addon and a `cron.json` at the repo root:

```bash
scalingo --app qualis addons-add scheduler scheduler-sandbox
```

`cron.json`:

```json
{
  "jobs": [
    {
      "command": "0 4 * * * cd backend && uv --project . run python scripts/cleanup_consumed_email_tokens.py",
      "size": "S"
    }
  ]
}
```

Deploy normally. The job runs daily at 04:00 UTC and prints `deleted=<n>` to the scheduler log.

### Manual one-off run

```bash
scalingo --app qualis run -- bash -c "cd backend && uv --project . run python scripts/cleanup_consumed_email_tokens.py"
```

Without the cron, the table will grow proportionally to the rate of consumed email tokens (negligible risk for low-traffic deployments; meaningful storage drift over months at production scale).
