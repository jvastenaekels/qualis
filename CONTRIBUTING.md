# Contributing to Qualis

Thanks for your interest in contributing! Qualis is an open-source platform for Q-methodology research and welcomes contributions of all sizes — bug reports, documentation fixes, feature pull requests, and methodological feedback.

This file is a quick orientation. The full contributor documentation lives under [`docs/contributing/`](docs/contributing/) and [`docs/guides/`](docs/guides/).

---

## Quick start for contributors

1. **Set up the project** — follow the [Quick Start in the README](README.md#quick-start), then [`docs/contributing/development.md`](docs/contributing/development.md) for the full development environment (database, migrations, seed data).
2. **Read the guidelines** below before writing code.
3. **Open an issue first** for non-trivial changes (>50 lines or any new feature) so we can align on approach.
4. **Run `make ci` locally** before pushing; CI runs the same checks on push and PR.

---

## Where things live

| What you want to do | Read this first |
|---------------------|-----------------|
| Fix a bug or add a feature | [`docs/contributing/coding-standards.md`](docs/contributing/coding-standards.md) |
| Touch backend code | [`docs/contributing/backend-guidelines.md`](docs/contributing/backend-guidelines.md) |
| Touch frontend code | [`docs/contributing/frontend-guidelines.md`](docs/contributing/frontend-guidelines.md) |
| Set up a dev environment | [`docs/contributing/development.md`](docs/contributing/development.md) |
| Run tests | [`Makefile`](Makefile) targets `test`, `e2e`, `ci`, `ci-full` |
| Add a database migration | [`CLAUDE.md`](CLAUDE.md) "Database Migrations" section + `make migration-new` |
| Use AI assistants effectively | [`docs/contributing/agent-instructions.md`](docs/contributing/agent-instructions.md) and [`docs/contributing/prompting-strategy.md`](docs/contributing/prompting-strategy.md) |

---

## Pull request checklist

Before opening a PR, verify:

- [ ] `make ci` passes locally (lint + type-check + tests + build)
- [ ] New or changed user-facing strings use `useTranslation()` / `t()` and exist in all three locales (`en`, `fr`, `fi`)
- [ ] If you changed backend schemas/routes, you ran `make generate-api` and committed the regenerated `frontend/src/api/generated.ts`
- [ ] If you added a database column, you generated and reviewed an Alembic migration (`make migration-new`)
- [ ] Tests cover the new behaviour (Vitest for frontend, pytest for backend)
- [ ] Commit messages follow the existing style (lowercase scope, imperative present tense; see `git log` for examples)
- [ ] You did not commit `.env`, `*.pyc`, build artefacts, or anything in `library/`

---

## Code review

The maintainer reviews PRs as soon as time permits. Expect ~1 week turnaround. Reviews focus on:

- Correctness of the change against the stated intent
- Consistency with existing patterns
- Test coverage (no test for non-trivial behaviour = blocker)
- i18n completeness (en/fr/fi)
- No regression in `make ci`

---

## Reporting issues

For bugs: open an issue with reproduction steps, expected vs. actual behaviour, and your environment (OS, Python/Node versions, browser if frontend).

For methodological questions about Q-methodology: include the relevant references (Brown, Watts & Stenner, Sneegas, etc.) so the discussion is grounded.

For security issues: please email the maintainer (see `CITATION.cff`) rather than opening a public issue.

---

## License and contributor agreement

By contributing to Qualis you agree that your contribution will be released under the [GNU Affero General Public License v3.0](LICENSE), the same license as the rest of the project.

There is no separate CLA. Your `git commit --author` line is the record of your contribution.

---

## Email flows in dev (SMTP unset)

When `SMTP_HOST` is empty, all `app.utils.email` send_* functions log a `MOCK EMAIL` block to the `app.utils.email` logger instead of sending. To use the email-driven auth flows locally:

- Sign up → fetch the verification URL from the backend logs (search `email-verification`), open it.
- Forgot password → fetch the reset URL (`password-reset`).
- 2FA email-OTP → the 6-digit code appears in the `2fa-login-otp` log line.
- Lost 2FA → the disable URL appears in the `2fa-disable-link` log line.

The verification gate is **automatically disabled** when SMTP is not configured (`settings.email_verification_active = EMAIL_VERIFICATION_REQUIRED AND is_smtp_configured`). This means a fresh dev environment without SMTP just works — sign-ups create immediately-active accounts, login is not blocked. Set `EMAIL_VERIFICATION_REQUIRED=False` explicitly only if you want to test the unverified-account UX with SMTP configured.

---

## Acknowledgments

See [README ## Acknowledgments](README.md#acknowledgments) for current contributor credits and the project's methodological grounding.
