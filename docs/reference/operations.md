# Operations reference

Stable runtime facts for operators of a Qualis deployment. For deployment and
upgrade procedures, see the [Deployment guide](../guides/deployment.md). For the
canonical environment-variable list, see the [Configuration reference](configuration.md#environment--app-settings).

## Health endpoints

| Endpoint | Meaning |
| -------- | ------- |
| `GET /` | The production frontend is being served. |
| `GET /health` | Backend liveness; returns `{"status": "ok"}`. |

## Rate limiting

| Mode | When active | Storage |
| ---- | ----------- | ------- |
| Disabled | Test environment | None |
| Redis | `REDIS_URL` is set | Shared Redis counters |
| In-memory | Default | Counters local to each process |

Multi-process deployments require `REDIS_URL` for shared rate-limit counters.

## Database connection pool

| Setting | Production | Development |
| ------- | ---------- | ----------- |
| `pool_size` | 3 | 1 |
| `max_overflow` | 2 | 1 |
| Pool pre-ping | enabled | enabled |
| Statement timeout | 30 s | 30 s |
| Idle transaction timeout | 60 s | 60 s |

The production maximum of five connections is sized for small managed PostgreSQL
plans with five to ten available slots.

## Startup validation

At startup, the backend checks for required tables and critical columns. Missing
schema elements produce a warning with a remediation step, normally
`alembic upgrade head`; startup does not fail closed.

## Optional services

When `SMTP_HOST` is unset, invitation emails are logged instead of sent. Email
verification and recovery flows degrade as described in the
[without-SMTP guide](../guides/running-without-smtp.md).

When S3 variables are absent, Qualis uses storage-optional mode. See the
[without-S3 guide](../guides/running-without-s3.md) for the exact capability matrix.
