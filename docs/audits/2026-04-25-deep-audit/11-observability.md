# Axis 11 — Observability

**Date:** 2026-04-25
**Pass:** light (≤45 min manual, ≤6 findings)
**Auditor:** Claude (sonnet-4-6)

---

## Summary

| Severity | Count |
|----------|-------|
| blocker | 0 |
| major | 2 |
| minor | 1 |
| observation | 2 |
| **Total** | **5** |

**Structured logging present:** Partially — Python `logging` module used consistently across services with `%(name)s` loggers, but format is plain text (not JSON). No structlog/python-json-logger.

**Audit trail present:** No — admin operations (study edit, user create/delete, role change, project member management) do not log the acting user's identity.

**Error reporter wired (prod):** No — no Sentry, Rollbar, Datadog or equivalent is configured in backend or frontend. The `/api/logs` endpoint provides a custom frontend→backend channel, but it has no production sink beyond stdout.

---

## Thematic grouping

- **A. Error sink for production** — F-11-001, F-11-002
- **B. Audit trail for admin operations** — F-11-003
- **C. Logging format / structured output** — F-11-004
- **D. Residual print() in production path** — F-11-005

---

### F-11-001 : No error reporting sink wired for production (backend + frontend)

- **Severity:** major
- **Audience:** [Prod]
- **Location:** `backend/app/main.py` (logging config), `frontend/src/api/client.ts` (`reportBug`), `backend/app/routers/logs.py`
- **Observation:** The backend uses Python's `logging.basicConfig` with a plain-text stdout handler. In production on Scalingo, logs go to ephemeral container stdout — accessible via `scalingo logs` but with no alerting, aggregation, or persistence beyond the rolling buffer. No Sentry, Datadog, Rollbar or equivalent is configured in either backend (`pyproject.toml` has no `sentry-sdk`, no `structlog`) or frontend (`package.json` has no `@sentry/react` or equivalent). The frontend `reportBug()` helper (`frontend/src/api/client.ts:50-75`) posts errors to `/api/logs`, which in turn logs to the same ephemeral stdout. `frontend_logger.setLevel(logging.ERROR)` discards warn/info entries entirely at the logger level.
- **Impact:** In production, any unhandled exception, 500 error, or frontend crash is invisible unless someone actively monitors the Scalingo log stream. Research sessions during a study run can fail silently, with no operator notification. This is the primary gap blocking confident prod deployment; cross-referenced by F-01-010 ("no breach detection or audit trail exists for token misuse — see axis 11").
- **Recommendation:** Wire Sentry (free tier) to both backend (`sentry-sdk[fastapi]`) and frontend (`@sentry/react`). Minimum: DSN via env var, `sentry_sdk.init()` before app creation, `SentryAsgiMiddleware` wrapping the FastAPI app. Frontend: `Sentry.init()` in `main.tsx` and replace the `reportBug` custom POST with `Sentry.captureException`. The custom `/api/logs` endpoint can remain for user-controlled diagnostics; Sentry covers operator-side alerting. Effort is small: ~2h for a minimal wiring.
- **Effort:** M

---

### F-11-002 : `print()` in production request path (`/api/logs` router)

- **Severity:** minor
- **Audience:** [Prod] [Maintenance]
- **Location:** `backend/app/routers/logs.py:51-53`
- **Observation:** The `POST /api/logs` endpoint handler calls `print()` directly for error-level entries, bypassing the Python logging subsystem:
  ```python
  print(f"[FRONTEND ERROR] {entry.message} | URL: {entry.url}")
  if entry.stack:
      print(f"Stack: {entry.stack}")
  ```
  A comment in the file acknowledges this is "for immediate visibility during dev/docker logs". All other `print()` occurrences are in `backend/app/utils/script_utils.py` (a CLI utility, not a request handler) — those are acceptable.
- **Impact:** `print()` output bypasses log level filtering, log formatting, and any future handler that might route logs to a structured sink (Sentry, CloudWatch). The stack trace appears on stdout without timestamps or severity tags, making it harder to correlate with surrounding log lines in production.
- **Recommendation:** Replace the two `print()` calls with `frontend_logger.error(…)` calls (already present on line 49 for the message). The stack can be included via `extra` or as part of the message string. Remove the comment that justifies the `print()`.
- **Effort:** S

---

### F-11-003 : No audit trail for security-relevant admin operations

- **Severity:** major
- **Audience:** [Prod] [Maintenance]
- **Location:** `backend/app/routers/admin/users.py`, `backend/app/routers/admin/projects.py`, `backend/app/routers/admin/studies.py`
- **Observation:** Admin operations that modify security-relevant state — user creation/deletion (`admin/users.py`), project member role changes (`admin/projects.py:update_member_role`, `remove_member`), study state transitions (`admin/studies.py:change_state`) — do not log the acting user's identity. The `current_user` (or `_admin`) dependency is resolved and checked for authorization, but its email/ID is never included in any log message. Example from `admin/users.py:create_user`: no `logger.*` call at all. Example from `admin/projects.py`: error logs include the exception but not `current_user.id`. The `/api/logs` endpoint also has no authentication (`backend/app/routers/logs.py` has no `Depends(get_current_user)`), making it unsuitable as an audit channel.
- **Impact:** If a role escalation or data deletion occurs, there is no server-side record of which admin account performed the action and when. This is both a security gap (no forensic trail for incident response) and a minor RGPD accountability concern (Art. 5(2) accountability principle). Cross-referenced by F-01-010 which notes the absence of breach detection. The gap is especially relevant because there is no 2FA enforcement for admin accounts (see security axis).
- **Recommendation:** Add `logger.info` calls at the success path of each destructive/privilege-changing admin operation, including `current_user.email` (or hashed ID for RGPD-sensitive deployments) and the affected resource ID. Example: `logger.info("User %s created by admin %s", new_user.email, _admin.email)`. This does not require a separate audit table (that would be L/XL effort); structured log lines with `user=` and `actor=` fields are sufficient for a first pass and compatible with a future log aggregator.
- **Effort:** M

---

### F-11-004 : Logging format is plain text — not JSON-structured for production log aggregators

- **Severity:** observation
- **Audience:** [Prod]
- **Location:** `backend/app/main.py:41-45`
- **Observation:** The root logger is configured with a human-readable format:
  ```python
  logging.basicConfig(
      level=logging.INFO,
      format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
      datefmt="%Y-%m-%d %H:%M:%S",
  )
  ```
  Several log messages use f-strings with embedded structured data (e.g., `logger.error(f"Service error on {request.method} {request.url}: {exc.message}")`), meaning the structured fields are not machine-parseable from the log line. No `structlog` or `python-json-logger` is installed.
- **Impact:** On Scalingo, logs can be forwarded to a log drain (Datadog, Papertrail, Logtail). Plain-text format requires regex parsing to extract method, URL, status, etc. This is an ops nuisance, not a correctness issue. For the current research-lab deployment scale, the impact is low.
- **Recommendation:** When wiring Sentry (F-11-001), also consider switching to `python-json-logger` for the root handler. A single `JSONFormatter` registration in `main.py` and `scripts/migrate.py` is sufficient. This is a pre-condition for meaningful log queries in any aggregator. Defer until F-11-001 is addressed.
- **Effort:** S

---

### F-11-005 : Frontend `console.*` calls are unrouted — not forwarded to the backend sink

- **Severity:** observation
- **Audience:** [Prod] [Maintenance]
- **Location:** transverse — 80+ occurrences across `frontend/src/`
- **Observation:** The frontend has a `reportBug()` function in `frontend/src/api/client.ts` and `ErrorBoundary` components that call it on uncaught errors. However, the 80+ `console.error` / `console.warn` calls scattered across components, hooks, pages, and the audio recorder are not wired to `reportBug`. They remain visible only in the browser DevTools and are invisible to the operator in production. Representative examples: audio upload failures (`AudioRecorder.tsx:372`), submission retry failures (`useSubmitStudy.ts:158`), Q-sort drag errors (`useFineSortDrag.ts:179`), loader failures across admin pages.
- **Impact:** In production, audio upload failures, submission errors, and Q-sort drag failures are silently invisible to the operator. The `ErrorBoundary` captures unhandled React tree crashes, but all caught errors inside `try/catch` blocks are swallowed by `console.error`. For a research platform where data loss during submission is critical, this is a meaningful gap. Note: this finding is observational — the immediate fix (F-11-001, wiring Sentry) would automatically capture unhandled errors; the `console.*` residuals would then surface through Sentry's breadcrumb mechanism without needing individual replacement.
- **Recommendation:** After wiring Sentry (F-11-001), add `Sentry.captureException(error)` in the most critical `catch` blocks: `useSubmitStudy.ts` (submission retry exhaustion), `AudioRecorder.tsx` (upload failure), `useFineSortDrag.ts` (drag error). Do not mechanically replace all 80+ `console.*` — keep `console.warn` for developer-facing internals (grid sanity, storage quota) and route only user-impacting failures to Sentry.
- **Effort:** M
