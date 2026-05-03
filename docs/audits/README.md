# Audits

Index of internal security and code audits conducted on Qualis.

## 2026-05-03 — Comprehensive security audit

Seven-wave audit refreshing the 2026-04-25 deep-pass audit and adding deep
dives across auth-email flows, multi-tenant isolation, the consent and
anonymisation pipeline, business-logic abuse, and supply chain. Closes with
publishable artefacts: threat model, SECURITY.md update, GDPR memo for
self-hosters, executive summary.

- **Executive summary:** [`2026-05-03-comprehensive-security-audit/00-executive-summary.md`](2026-05-03-comprehensive-security-audit/00-executive-summary.md)
- **Threat model:** [`2026-05-03-comprehensive-security-audit/08-threat-model.md`](2026-05-03-comprehensive-security-audit/08-threat-model.md)
- **GDPR memo for self-hosters:** [`/docs/reference/gdpr-self-hosters.md`](../reference/gdpr-self-hosters.md)
- **Action backlog (cumulative):** [`2026-05-03-comprehensive-security-audit/99-action-backlog.md`](2026-05-03-comprehensive-security-audit/99-action-backlog.md)

Per-wave docs:
- `01-prior-findings-status.md` — Wave 1 refresh of 2026-04-25 findings
- `02-scanner-pass.md` — Wave 1 scanner battery (gitleaks, pip-audit, bandit, npm-audit, semgrep)
- `03-auth-email-flows.md` — Wave 2 deep dive
- `04-multi-tenant-isolation.md` — Wave 3 deep dive (95-case IDOR harness)
- `05-consent-anonymisation.md` — Wave 4 deep dive (data lifecycle map; load-bearing for GDPR memo)
- `06-business-logic-abuse.md` — Wave 5 deep dive
- `07-supply-chain.md` — Wave 6 supply-chain hardening
- `08-threat-model.md` — Wave 7 (above)

## 2026-04-25 — Pre-submission deep-pass audit

Multi-axis pre-submission code audit. Findings refreshed during the
2026-05-03 audit's Wave 1 — see the prior-findings status doc for the
post-refresh state.

- [`2026-04-25-deep-audit/`](2026-04-25-deep-audit/)
