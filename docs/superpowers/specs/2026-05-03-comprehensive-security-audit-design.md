# Comprehensive Security Audit — Design

**Date:** 2026-05-03
**Author:** Claude Opus 4.7 (brainstormed with @jvastenaekels)
**Baseline:** `docs/audits/2026-04-25-deep-audit/01-security.md` (commit `4e53e1f`)

## Goal

Refresh, deepen, and remediate Qualis's security posture, and produce
publishable artifacts for OSS contributors and self-hosting operators.
Combines three modes: **A** refresh of the prior audit, **B** deep dive into
five axes that were thin or new, and **D** publishable deliverables with a
GDPR focus for self-hosters.

## Non-goals

- Penetration testing of any production deployment. All exercises run against
  a local/dev instance.
- GDPR posture for a hosted reference deployment. Qualis maintainers ship
  software, not a service; the operator is the controller.
- Performance-as-DoS analysis (separate axis in the prior audit).
- Cryptographic-primitive review (libraries trusted absent a CVE).
- Frontend visual / UX security beyond what scanners surface.

## Methodology

Verification depth per finding: **static + scanners + dynamic verification +
regression tests**. Every fix lands with a pytest/vitest test that fails on
the vulnerable code and passes on the fixed code. `blocker` and `major`
findings additionally ship a checked-in exploit script under
`.raw/exploits/` with PRE-FIX and POST-FIX assertions.

## Sequencing — seven waves, each shipped as a separate PR

Branch convention: `audit/<wave-num>-<axis>` off `main`. PR title:
`audit(<axis>): <wave name>`. Each wave's branch rebases onto `main` if a
prior wave merged ahead of it.

### Wave 1 — Refresh + scanners

- Run from project root: `gitleaks detect`, `uv run pip-audit`,
  `uv run bandit -r backend/app`, `semgrep --config p/owasp-top-ten`,
  `npm audit --prefix frontend`.
- Diff outputs against `.raw/` of 2026-04-25.
- For each of the 14 prior findings: locate fix commit (or its absence) via
  `git log -G '<sentinel>'`; classify `fixed / regressed / still-open / n/a`;
  re-run the prior exploit if one was documented.
- Fix newly-surfaced dependency CVEs (one-line bumps only).
- Out of scope here: anything requiring code review beyond a version
  pin — defer to its proper wave.

### Wave 2 — Auth-email flows (new since prior audit)

Scope files: `app.services.email_token_consume_service`,
`app.services.email_otp_service`, `app.middleware.log_scrub`,
`app.routers.auth`, migrations `add_auth_email_flows` and
`fix_password_changed_at_default`.

Verification checks:
- JTI denylist replay-window race.
- OTP brute-force: rate-limit + entropy (digits × attempts × window).
- Email enumeration via response differential / timing on
  `/auth/password-reset`, `/auth/login`, email-change.
- Session invalidation when `password_changed_at` advances.
- Email-change confirmation on both old and new addresses.
- Clock-skew tolerance on token expiry.
- Log-scrub regex coverage against a synthetic-log corpus
  (token, OTP, password, email-change blob).

Exploit scripts: 1 per `blocker`/`major`. Expect at least replay-race and
OTP brute-force scripts.

### Wave 3 — Multi-tenant isolation

Highest-risk wave for blast radius. Code-reviewer (Opus) gate is
non-negotiable here.

Scope files: every admin router (`app.routers.admin.*`),
`app.services.quotas`, `app.dependencies` (membership checks), migration
`rename_researcher_to_member_and_owner_uniqueness`.

Verification checks:
- For every admin endpoint: IDOR via path-param swap (Project A member
  calls Project B's resource).
- Cross-project enumeration via list endpoints.
- Recruitment-token replay across studies.
- Audio-upload ownership-claim tampering.
- Resume-code lookup scoping (global vs study-scoped).
- Bulk-export filter correctness.
- Quota state consistency under concurrent member-add.

Output: a parametrised exploit/test that loops every `/api/admin/**` route
and asserts cross-project access denial, plus a coverage report
(route × isolation-class).

### Wave 4 — Consent & anonymisation pipeline

Outputs feed Wave 7's GDPR memo §5 (subject-rights mechanics) and §6
(retention/anonymisation).

Scope files: `app.routers.participants` (record_consent),
`app.services.submission_service`, `app.services.storage_service`,
`app.services.export_service`, `app.routers.audio`; models touching
`anonymised_at` / consent / `is_discarded`.

Verification checks: end-to-end trace of one participant's data — capture
path, storage location (DB rows + S3 keys), what `anonymised_at` flips on
each table, what audio key naming reveals, withdrawal mechanism (does one
exist?), Art. 15 access path, Art. 17 erasure propagation to S3,
retention TTL, PII in audit logs, IP addresses in access logs, email
addresses in error traces.

### Wave 5 — Business-logic abuse

Resume-codes brute-force / cross-study replay / TOFU; draft-responses
isolation under shared-device scenarios; recruitment-quota bypass via
concurrent requests (race on the `quotas` row); `is_test_run`
impersonation; audio-upload size/MIME/filename traversal/ownership;
submission idempotency (double-submit, submit-on-behalf); export quotas
where any.

### Wave 6 — Supply chain

`uv.lock` and `package-lock.json` pin verification; top-blast-radius deps
deep-look (pyjwt, fastapi, sqlalchemy, react, dnd-kit, react-i18next);
GitHub Actions third-party action SHA pinning; `Procfile` release-phase +
`scripts/migrate.py` trust boundary; docker / Scalingo build-time env;
Dependabot/Renovate config presence and cadence.

Output: maintenance recommendation block in `99-action-backlog.md` (CI
gate suggestions: gitleaks pre-commit, pip-audit-on-PR, npm-audit-on-PR,
semgrep-on-PR, dep-update-bot config).

### Wave 7 — Deliverables

`docs/audits/2026-05-03-comprehensive-security-audit/08-threat-model.md`
- Actors: anonymous internet, participant, researcher member, researcher
  owner, super-admin, ops/SRE, attacker with stolen JWT, attacker with
  DB read access.
- Assets: Q-sort data, audio recordings, consent records, PII, JWT
  signing key, S3 credentials, DB credentials.
- Trust boundaries: internet↔SPA, SPA↔API, API↔DB, API↔S3, API↔SMTP,
  member↔other-project.
- STRIDE per boundary; top-10 ranked risks; one full attack tree for the
  worst-case path (goal = exfiltrate all participant data across all
  projects).

`SECURITY.md` (repo root)
- Supported versions; vuln-report contact (email + GPG fingerprint
  placeholder marked `<TODO operator>`); 90-day disclosure policy;
  in-scope and out-of-scope statement.

`docs/reference/gdpr-self-hosters.md` (operator-facing memo)
1. Roles: operator = controller, Qualis maintainers = software vendor
   (not processor).
2. Data-flows diagram.
3. Personal-data inventory (participant identifiers, Q-sort data, audio,
   IP addresses in logs, …).
4. Lawful-basis menu (Art. 6(1)(a) consent, Art. 6(1)(e) public-interest
   task, Art. 9(2)(j) research exemption for special-category data).
5. Subject-rights operator playbook (Art. 15/16/17/20/21 with concrete
   Qualis steps).
6. Retention / anonymisation behaviour mapping `anonymised_at` to GDPR
   semantics.
7. Art. 32 security checklist mapped to Qualis features.
8. Breach playbook (Art. 33–34).
9. DPIA inputs (Art. 35) — Qualis-specific risk register.
10. Records of processing (Art. 30) template.
11. International transfers (Art. 44+) — relevant if S3 region is non-EU.

`00-executive-summary.md`: severity counts before/after, risk delta vs
2026-04-25, top 5 residual risks if any, compliance posture statement.

## Output layout

```
docs/audits/2026-05-03-comprehensive-security-audit/
  00-executive-summary.md         # written last, in wave 7
  01-prior-findings-status.md     # wave 1
  02-scanner-pass.md              # wave 1
  03-auth-email-flows.md          # wave 2
  04-multi-tenant-isolation.md    # wave 3
  05-consent-anonymisation.md     # wave 4
  06-business-logic-abuse.md      # wave 5
  07-supply-chain.md              # wave 6
  08-threat-model.md              # wave 7
  99-action-backlog.md            # cumulative; emptied at audit close
  .raw/
    scanners/wave-<n>/            # gitleaks, pip-audit, bandit, semgrep, npm-audit
    exploits/F-<id>.{sh,py}       # one per blocker/major

SECURITY.md                       # repo root, wave 7
docs/reference/gdpr-self-hosters.md   # wave 7
```

Finding IDs continue the prior convention: `F-<axis>-<seq>` where
`<axis>` is the section number above (`F-03-001`, `F-04-001`, …).
Severities: `blocker / major / minor / observation`. Audiences:
`[Prod] [SoftwareX] [OSS] [Self-hoster]`.

## Per-wave PR contents

1. The wave's finding document (`0X-<axis>.md`).
2. For each `blocker`/`major` finding fixed in this PR: an exploit script
   under `.raw/exploits/F-<id>.{sh,py}` that fails on `main` (PRE-FIX
   assertion holds) and passes after the fix (POST-FIX assertion).
   `minor`/`observation` get a regression test only, no exploit script.
3. The fix.
4. A regression test next to existing tests:
   `backend/tests/security/<wave>/` for backend pytest;
   `frontend/src/<area>/__tests__/` for vitest unit tests adjacent to the
   component; `frontend/tests/<flow>.spec.ts` for playwright.
5. `99-action-backlog.md` updated: items closed, items deferred with rationale.
6. `make ci` green; `make ci-fast` between iterations.

## Per-wave definition of done

- All findings in scope have a section in the wave doc with: location,
  observation, impact, recommendation, severity, audience, effort.
- Every `blocker`/`major` has an exploit script under `.raw/exploits/`
  with PRE-FIX and POST-FIX assertions.
- Every fix lands with a regression test.
- `make ci` passes locally on the wave branch.
- Scanner outputs (where applicable) archived under
  `.raw/scanners/wave-<n>/`.
- `99-action-backlog.md` updated.

## Gates

- **Code-reviewer gate** (Opus, `superpowers:code-reviewer`) — mandatory
  before merge on waves 2, 3, 4. Brief includes the wave doc, the diff,
  exploit scripts, regression tests, and an explicit ask to look for
  missed-propagation bugs and bypasses adjacent to the patched code.
- **Codex second-opinion** (`codex:codex-second-opinion`, `stress-test`
  mode) — used sparingly when an architectural call could lock in a
  posture (e.g., "JTI denylist is correct as-is").
- **Backlog-review subagent** (Sonnet) — fires once between wave 4 merge
  and wave 5 start. Brief: cumulative `99-action-backlog.md`, the four
  wave docs, threat-model skeleton, remaining-wave plans. Output: ranked
  drop-list with rationale, plus a tightened wave-5/6/7 scope. User
  approves the trim before wave 5 starts.

## Status reporting cadence

- Per-wave kickoff message: scope, file list, duration estimate.
- Per-wave close message: severity counts, scripts archived, PR link,
  residual items moved to backlog.
- No silent waves.

## Definition of done — overall audit

- All seven waves merged to `main`.
- `00-executive-summary.md` written and linked from `docs/audits/README.md`
  (cross-referenced by the prior 2026-04-25 audit's exec summary).
- `SECURITY.md` live at repo root.
- `docs/reference/gdpr-self-hosters.md` live and linked from the docs index.
- `99-action-backlog.md` either empty or contains only items explicitly
  deferred with user sign-off.
- `make ci` green on `main`.
- `make e2e` green on `main` (admin-flow-touching change set).
- Severity-count table: 0 unfixed `blocker`, 0 unfixed `major` from this
  audit's findings (or each is in the deferred list with rationale).

## Stop / abort criteria

- A wave that triples its initial estimate triggers a pause + user check.
- A finding requiring a breaking schema migration outside this audit's
  scope (e.g., re-keying audio storage) → backlog with rationale, not
  in-session fix.
- If the threat model in wave 7 reveals an attack class not covered by
  waves 2–6, that becomes an 8th wave proposed to the user, not silently
  absorbed.

## Out of scope

- Penetration testing of any production deployment.
- Hosted-deployment GDPR posture (self-hosters only per scoping decision).
- Frontend visual / UX security (clickjacking via iframe is covered as a
  scanner check only, not a deep dive).
- Performance-as-DoS analysis.
- Cryptographic-primitive review.
