# Deployment Guide

This guide covers deploying Qualis to production environments.

---

## Deployment Options

| Platform         | Difficulty | Cost                |
| ---------------- | ---------- | ------------------- |
| **Scalingo**     | Easy       | ~7 EUR/mo           |
| **Render**       | Easy       | Free tier available |
| **Heroku**       | Medium     | ~$7/mo              |
| **Docker + VPS** | Advanced   | Variable            |

---

## Scalingo Deployment (Unified)

Qualis is deployed as a single application where the FastAPI backend serves the pre-built React frontend.

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

- Scalingo account and [Scalingo CLI](https://doc.scalingo.com/cli)
- Application repository pushed to GitHub/GitLab

### Steps

1. **Create the App**

   ```bash
   scalingo create libre-q
   ```

2. **Add PostgreSQL Resource**

   ```bash
   scalingo --app libre-q addons-add postgresql postgresql-starter-512
   ```

3. **Set Environment Variables**

   ```bash
   scalingo --app libre-q env-set DATABASE_URL=$SCALINGO_POSTGRESQL_URL
   scalingo --app libre-q env-set SECRET_KEY=$(openssl rand -hex 32)
   scalingo --app libre-q env-set ALLOWED_ORIGINS=https://libre-q.osc-fr1.scalingo.io
   ```

4. **Deploy**
   Push your code to the Scalingo remote. The buildpack will automatically detect the Python environment.
   ```bash
   git push scalingo main
   ```

### Post-Deployment Automation

Qualis uses the `postdeploy` phase in `Procfile` to automate critical tasks after every successful build:

- **Schema Migration**: Executes `alembic upgrade head` to ensure all database tables are up to date.
- **Admin Setup**: Creates the initial admin account if the database is empty.

You can monitor these tasks in the deployment logs:

```bash
scalingo --app libre-q logs --n 100
```

---

## Environment Variables

| Variable            | Description                                           | Required |
| ------------------- | ----------------------------------------------------- | -------- |
| `DATABASE_URL`      | Connection string (PostgreSQL with asyncpg)           | Yes      |
| `SECRET_KEY`        | Application secret for JWT token security             | Yes      |
| `ALLOWED_ORIGINS`   | Comma-separated list of allowed CORS origins          | Yes      |
| `SMTP_HOST`         | SMTP server hostname for invitations                  | No       |
| `SMTP_PORT`         | SMTP server port (usually 587)                        | No       |
| `SMTP_USER`         | SMTP username                                         | No       |
| `SMTP_PASSWORD`     | SMTP password or API Key                              | No       |
| `EMAILS_FROM_EMAIL` | Sender email address                                  | No       |
| `ENVIRONMENT`           | Runtime environment (`development` or `production`)   | No       |
| `IP_HASH_SALT`          | Salt for hashing participant IP addresses             | Yes      |
| `FRONTEND_URL`          | Frontend URL for CORS and email links                 | No       |
| `S3_BUCKET_NAME`        | S3 bucket for audio recordings                        | No       |
| `S3_REGION`             | S3 region (default: `us-east-1`)                      | No       |
| `S3_ACCESS_KEY_ID`      | S3 access key                                         | No       |
| `S3_SECRET_ACCESS_KEY`  | S3 secret key                                         | No       |
| `S3_ENDPOINT_URL`       | Custom S3 endpoint (for non-AWS providers)            | No       |
| `AUDIO_MAX_FILE_SIZE_MB`     | Max audio file size in MB (default: 10)          | No       |
| `AUDIO_MAX_DURATION_SECONDS` | Max audio duration in seconds (default: 300)     | No       |

---

## Manual Database Maintenance

Use `--` to separate Scalingo CLI flags from the command arguments.

### Run Database Migrations

```bash
scalingo --app libre-q run -- python backend/scripts/migrate.py
```

### Sync Study Configuration

```bash
scalingo --app libre-q run -- env API_BASE_URL=http://internal python backend/seed.py backend/data/example-study.json
```

---

## Database Reinitialization

> [!CAUTION]
> This will **permanently delete all data** in your production database.

If you need to perform a full "factory reset" of the database (e.g., during initial setup or prototyping):

1. **Reset Infrastructure**
   Wipe all tables and recreate the schema with default admin account:

   ```bash
   scalingo --app libre-q run -- python backend/init_db.py --reset
   ```

2. **Repopulate Content**
   Seed the default study data using the internal API bypass:
   ```bash
   scalingo --app libre-q run -- env API_BASE_URL=http://internal python backend/seed.py backend/data/example-study.json
   ```

> [!TIP]
> You can combine both steps:
>
> ```bash
> scalingo --app libre-q run -- bash -c "python backend/init_db.py --reset && env API_BASE_URL=http://internal python backend/seed.py backend/data/example-study.json"
> ```

---

## Health Checks

| Endpoint      | Purpose                                |
| ------------- | -------------------------------------- |
| `GET /`       | Verifies Frontend is correctly served  |
| `GET /health` | Backend API health check (returns `{"status": "ok"}`) |

---

## SSL/HTTPS

Scalingo provides automatic SSL certificates for all applications. No manual configuration is required.

---

## Rate Limiting

Qualis uses SlowAPI for request rate limiting with three operational modes:

| Mode         | When Active              | Storage                    |
| :----------- | :----------------------- | :------------------------- |
| **Disabled** | `TESTING=true`           | None (all requests pass)   |
| **Redis**    | `REDIS_URL` is set       | Redis (for production)     |
| **In-memory**| Default                  | Local process memory       |

In-memory mode is suitable for single-process deployments. For multi-process setups, configure `REDIS_URL` to share rate limit state across workers.

---

## Database Connection Pool

Connection pool sizing is tuned per environment:

| Setting            | Production | Development |
| :----------------- | :--------- | :---------- |
| `pool_size`        | 3          | 1           |
| `max_overflow`     | 2          | 1           |
| Pool pre-ping      | Enabled    | Enabled     |
| Statement timeout  | 30s        | 30s         |
| Idle TX timeout    | 60s        | 60s         |

Production pool sizing (3 + 2 = 5 max connections) is designed to fit within Scalingo's starter PostgreSQL plans (~5-10 connection slots). Statement timeout prevents runaway queries from blocking the pool.

---

## Startup Validation

On startup, the backend validates the database schema by checking for:

- Required tables (`projects`, `users`, `studies`, `participants`, etc.)
- Critical columns (e.g., `randomize_statement_order`, `random_seed`, `ui_labels`)

If validation fails, the application logs warnings with remediation steps (e.g., "Run `alembic upgrade head`"). This helps diagnose deployment issues when migrations haven't been applied.

---

## SMTP Fallback

When SMTP environment variables are not configured, invitation emails are logged to stdout instead of being sent. This is useful for development and testing — look for the invitation URL in the application logs.
