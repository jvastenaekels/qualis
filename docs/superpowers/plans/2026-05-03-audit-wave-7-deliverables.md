# Audit Wave 7 — Deliverables — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development.

**Goal:** Close the 2026-05-03 comprehensive security audit with publishable artefacts: threat model, extended SECURITY.md, GDPR memo for self-hosters, executive summary. **No new code findings expected** — this wave consolidates Waves 1-6 outputs into operator/reviewer-facing documents.

**Architecture:** Five document deliverables. Each ingests material produced by prior waves' inventories. The threat model is built from Wave 3's IDOR matrix + Wave 2's auth surface; the GDPR memo from Wave 4's lifecycle + Wave 6's operator obligations; SECURITY.md extension from the cumulative findings list. No code-reviewer gate (Wave 7 is not in spec's gate list).

**Tech Stack:** Markdown only. No runtime code. Brief regression test asserts the documents exist and link correctly.

---

## Reference

- **Spec:** `docs/superpowers/specs/2026-05-03-comprehensive-security-audit-design.md` (Wave 7 section).
- **Existing artefacts to extend:**
  - `SECURITY.md` (repo root, ~50 lines) — per Wave 1 inventory, this exists with bandit suppressions, xlsx accepted-risk, security-relevant practices, audit history. Wave 7 EXTENDS, not creates.
  - `docs/audits/2026-05-03-comprehensive-security-audit/` — Wave 1-6 audit docs.
- **Material to ingest:**
  - Wave 4's `05-consent-anonymisation.md` GDPR-memo material section (load-bearing).
  - Wave 6's `07-supply-chain.md` operator obligations.
  - Wave 3's `04-multi-tenant-isolation.md` cross-tenant access matrix.
  - Wave 2's `03-auth-email-flows.md` token lifecycles.

## File Structure

**Created:**
- `docs/audits/2026-05-03-comprehensive-security-audit/08-threat-model.md`
- `docs/audits/2026-05-03-comprehensive-security-audit/00-executive-summary.md`
- `docs/reference/gdpr-self-hosters.md` (operator-facing memo)
- `backend/tests/security/wave_7/__init__.py`
- `backend/tests/security/wave_7/test_deliverables_present.py` — assert all deliverables exist + cross-references resolve

**Modified:**
- `SECURITY.md` (repo root) — extend with disclosure-policy detail, Waves 2-6 audit history, new "Security-relevant practices" entries surfaced by the audit
- `docs/audits/2026-05-03-comprehensive-security-audit/99-action-backlog.md` — final state (Wave 7 entries; cumulative summary)
- `docs/audits/README.md` (or equivalent) — link to executive summary

**Branch:** `audit/7-deliverables` off `main`.

**Wave 7 ID space:** F-08-NNN (likely unused; this is documentation).

---

## Task 1: Scaffold

Wave doc skeleton + tests dir + commit. Same pattern.

---

## Task 2: Threat model (`08-threat-model.md`)

Per the spec, the threat model contains:

- **Actors:** anonymous internet, participant, researcher member, researcher owner, super-admin, ops/SRE, attacker with stolen JWT, attacker with DB read access.
- **Assets:** Q-sort data, audio recordings, consent records, PII, JWT signing key, S3 credentials, DB credentials.
- **Trust boundaries:** internet↔SPA, SPA↔API, API↔DB, API↔S3, API↔SMTP, member↔other-project.
- **STRIDE per boundary:** spoofing / tampering / repudiation / information disclosure / DoS / elevation of privilege.
- **Top-10 ranked risks** (informed by audit findings — F-04-006 quota race, F-03-008 reg enumeration etc.).
- **One full attack tree** for the worst-case path (goal: exfiltrate all participant data across all projects).

Aim for 400-700 lines. Use markdown tables and ASCII diagrams.

Cross-reference findings: every STRIDE row should have a "Mitigated by [F-NN-NNN]" or "Open: [F-NN-NNN]" link.

---

## Task 3: SECURITY.md extension

Read `SECURITY.md` (repo root, current ~50 lines). Add:

### Section: "Disclosure policy"
- Vulnerability report contact (already present; verify).
- Acknowledgement window (present).
- Fix/mitigation window for high-severity (present).
- **NEW:** add CVE-coordination guidance (CVSS scoring, embargo period).
- **NEW:** add a "scope" subsection — what's in-scope (latest release; reference deployment if any) vs. out-of-scope (dev branches, denial-of-service, social engineering).

### Section: "Audit history"
Add Waves 2-6 entries:
- 2026-05-03 comprehensive audit (Waves 1-6) — link to executive summary.

### Section: "Security-relevant practices in Qualis"
Add entries surfaced by the audit:
- **F-03-010 / F-03-012 / F-03-013** — access-token revocation on password change; JWT clock-skew leeway; URL-token log scrubbing across uvicorn.access + app.middleware.errors + app.routers.logs.
- **F-05-001 / F-05-008** — pre-submission withdrawal endpoint; lifecycle audit logging.
- **F-05-002 / F-05-004** — user_agent hashing at write; audio S3 keys hashed-prefix.
- **F-06-various** — security-scans CI workflow (gitleaks + pip-audit + npm-audit + semgrep + logger-URL lint); GHA SHA-pinning; Dockerfile USER; nginx host allowlist; Dependabot weekly cadence.

Keep tone factual, not promotional. Each bullet ~1-2 sentences.

---

## Task 4: GDPR memo for self-hosters (`docs/reference/gdpr-self-hosters.md`)

Per the spec, ~12 sections:

1. **Roles:** operator = controller; Qualis maintainers = software vendor (NOT processor).
2. **Data flows diagram** — ingest from Wave 4 §2.3 lifecycle map.
3. **Personal-data inventory** — ingest from Wave 4 §2.4 PII fields table.
4. **Lawful-basis menu** — Art. 6(1)(a) consent, Art. 6(1)(e) public-interest task, Art. 9(2)(j) research exemption for special-category data. Operator picks one per study.
5. **Subject-rights operator playbook** — Art. 15 / 16 / 17 / 20 / 21 with concrete Qualis steps (ingest from Wave 4 findings F-05-007/008/009).
6. **Retention / anonymisation behaviour** — mapping `anonymised_at` to GDPR semantics; F-05-002 (UA hashed at write); F-05-004 (audio S3 hashed prefix); F-05-005 (S3 lifecycle = operator obligation).
7. **Art. 32 security checklist** — mapping Qualis features to controls. Ingest from Wave 6 operator obligations + the SECURITY.md "Security-relevant practices" section.
8. **Breach playbook** (Art. 33-34) — 72h notification window; what info to include; sample timeline.
9. **DPIA inputs** (Art. 35) — Qualis-specific risk register the operator can drop into their own DPIA. Ingest from threat model (Task 2).
10. **Records of processing** (Art. 30) — template the operator fills in.
11. **International transfers** (Art. 44+) — relevant if S3 region is non-EU. Document the operator's choice points.
12. **Maintainer obligations** — what Qualis project commits to (security updates, advisory publication, etc.).

Aim for 500-900 lines. The operator should be able to drop sections of this directly into their compliance binder.

---

## Task 5: Executive summary (`00-executive-summary.md`)

A short (200-400 lines) document for SoftwareX reviewers / OSS contributors / future auditors:

- Audit scope and methodology (one paragraph).
- Severity counts table (cumulative across F-01 through F-07 ID spaces).
- Risk delta vs the 2026-04-25 audit (4 still-open out of 14 prior; 0 majors remaining).
- Top 5 residual risks with rationale.
- Compliance posture statement.
- Audit-team / methodology / tools used.
- Pointers to each wave doc.

---

## Task 6: Update audit-history index + final backlog

- `docs/audits/README.md` (or create one) — link to 2026-05-03 audit folder + 2026-04-25.
- `docs/audits/2026-05-03-comprehensive-security-audit/99-action-backlog.md` — add Wave 7 entries (likely `closed in commit <sha>` for each deliverable). Final cumulative summary table at the top: "X total findings filed across F-01-F-07; Y closed; Z deferred".

---

## Task 7: Final regression test + CI + push + PR

- Test asserts all 5 deliverables exist at expected paths and contain expected sections.
- `make ci` green.
- Push branch.
- Open PR titled `audit(wave-7): deliverables — threat model, SECURITY.md, GDPR memo, exec summary`.
- **No code-reviewer gate** per spec (Wave 7 not in gate list).

---

## Per-task discipline

Document-only wave. Each task: read prior wave's source material, ingest into the new doc, commit. Aim for:
- Truthful (every claim cites a finding ID or file:line).
- Operator-actionable (every "you should do X" has a concrete step).
- Cross-linked (findings references resolve; doc references resolve).

## Stop criteria

- Threat model balloons past 1000 lines → strip to top-N risks; defer full STRIDE matrix per-boundary if needed.
- GDPR memo legal disclaimer required → file as observation; recommend operator legal review (we're not lawyers).

## Out of scope

- Any new code changes (this is the closing documentation wave).
- Per-study consent_description audit (operator responsibility per Wave 4 finding).
- Backporting fixes to older releases.

---

## Self-Review

Spec coverage:
- ✅ Threat model with STRIDE + top-10 + attack tree → Task 2.
- ✅ SECURITY.md extension → Task 3.
- ✅ GDPR memo (12 sections) → Task 4.
- ✅ Executive summary → Task 5.
- ✅ Final action backlog state → Task 6.

ID-space: F-08-NNN reserved (likely unused).

## Execution Handoff

Plan complete. Subagent-driven recommended.
