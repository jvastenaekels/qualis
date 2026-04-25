# Axis 12 — Submission Package + SoftwareX Compliance

**Auditor:** Claude (Sonnet 4.6)
**Date:** 2026-04-25
**Pass depth:** Deep
**Sources consulted:**
- `.raw/repo-state.txt` (captured this session)
- `.raw/citation-validation.txt` (cffconvert, schema 1.2.0)
- `.raw/openapi-sync.log`
- `.raw/lychee-links.json` (2 errors, 0 from README/docs)
- `README.md`, `CITATION.cff`, `LICENSE`, `.github/workflows/ci.yml`
- `docs/explanation/q-methodology.md`, `docs/explanation/architecture.md`
- `docs/guides/deployment.md`, `docs/tutorials/local-development.md`
- `docs/contributing/agent-instructions.md`
- SoftwareX Guide for Authors (fetched 2026-04-25): 3,000-word max, GitHub-only, LaTeX/Word template required, 6 figure max, copy archived to journal GitHub on acceptance
- JOSS Review Criteria (fetched 2026-04-25): OSI license, README, statement of need, state of field, software design, research impact, AI usage disclosure, development history (6+ months open), automated tests + CI, contribution guidelines

---

## Compliance Track

### F-12-001 : No git tag — submitted version is not frozen

- **Severity:** blocker
- **Audience:** [SoftwareX]
- **Location:** transverse (git history, `CITATION.cff:12`)
- **Observation:** `git tag -l` returns no output. No version tag exists in the repository. `CITATION.cff` records `version: "0.1.0"` with a comment `# TODO: update to actual release date when v0.1.0 is tagged`, and `date-released: "2026-04-16"` (a past date that predates the current HEAD). The `repo-state.txt` confirms zero tags.
- **Impact:** SoftwareX requires a citable, pinned software version linked to the manuscript. Without a tag: (1) reviewers cannot verify they are evaluating the exact code described in the manuscript; (2) Zenodo cannot auto-archive the release; (3) the CITATION.cff `version` field is a promise that does not yet correspond to any real repository state. This alone is sufficient for desk rejection.
- **Recommendation:** Cut tag `v0.1.0` (or `v0.1.0-softwarex`) on a commit where all CI checks pass locally. Then update `CITATION.cff` `date-released` to the actual tag date. Do this before any other submission-prep work — all other steps depend on the tag existing.
- **Effort:** S

---

### F-12-002 : No Zenodo archive — DOI missing

- **Severity:** blocker
- **Audience:** [SoftwareX]
- **Location:** `CITATION.cff:16–17`, root (`.zenodo.json MISSING`)
- **Observation:** `.zenodo.json` is absent from the repository root. `CITATION.cff` has `doi` commented out with placeholder `10.5281/zenodo.XXXXXXX`. `CITATION.cff` preferred-citation also has a placeholder `doi` commented out. SoftwareX requires the accepted version of the software/code to be archived; JOSS criteria explicitly require a software archive link with a DOI. While SoftwareX technically archives to the journal's own GitHub on acceptance, Zenodo is the community standard cited in JOSS and expected by reviewers to verify long-term preservation and citability.
- **Impact:** Without a Zenodo DOI: CITATION.cff is incomplete; the manuscript cannot include a software DOI; reviewers assessing the submission before acceptance have no stable archive to cite or inspect. This is a blocker for the CITATION.cff to be complete and for the manuscript DOI table.
- **Recommendation:** (1) Create `.zenodo.json` at the repository root with title, creators, description, keywords, and license. (2) After cutting tag `v0.1.0` (F-12-001), create a GitHub Release targeting that tag — Zenodo auto-imports it within minutes. (3) Paste the resulting DOI into `CITATION.cff` (uncomment `doi:` field) and into the manuscript metadata table.
- **Effort:** S (once tag exists)

---

### F-12-003 : CI not triggered on push/PR — badge is stale

- **Severity:** blocker
- **Audience:** [SoftwareX] [Prod] [Maintenance]
- **Location:** `.github/workflows/ci.yml:3–8`
- **Observation:** The `on:` block contains only `workflow_dispatch:`. The `push` and `pull_request` triggers are commented out. The CI badge in `README.md` links to the workflow but displays the status of the last manual run, not a live green/red state tied to the current codebase. Any SoftwareX or JOSS reviewer who opens the repository will see a badge whose state cannot be trusted as reflecting the current code.
- **Impact:** JOSS explicitly requires "An automated test suite hooked up to continuous integration." A CI badge that is not triggered by push/PR fails this criterion regardless of how comprehensive the test suite is. The badge becomes misleading rather than reassuring. For SoftwareX, a green badge frozen from a manual run weeks ago on a different commit is worse than no badge — it signals the project is not in active CI-driven development.
- **Recommendation:** Uncomment the `push` and `pull_request` triggers targeting `main` (and optionally `develop`). Verify CI passes on the current HEAD before enabling. This is a one-line change.
- **Effort:** S

---

### F-12-004 : CITATION.cff missing ORCIDs for both authors

- **Severity:** major
- **Audience:** [SoftwareX]
- **Location:** `CITATION.cff:23, 28`
- **Observation:** Both author entries have an ORCID line commented out with placeholder `0000-0000-0000-0000`. ORCIDs are not strictly required by SoftwareX's guide text, but they are expected in CITATION.cff (the schema supports and recommends them), and SoftwareX's editorial process uses them for disambiguation. The JOSS criteria do not flag missing ORCIDs as a blocker, but reviewers note their absence as a quality signal.
- **Impact:** Without ORCIDs, the CITATION.cff is incomplete by community standards. Reduced discoverability and attribution confidence for both authors.
- **Recommendation:** Add both ORCIDs. If an author does not yet have an ORCID, register at orcid.org (takes 5 minutes). Then uncomment the `orcid:` lines and replace the placeholder.
- **Effort:** S

---

### F-12-005 : Copyright headers inconsistently applied and mis-spell author name

- **Severity:** minor
- **Audience:** [SoftwareX] [Maintenance]
- **Location:** `backend/app/` (46/56 Python files missing header), `frontend/src/` (452/527 TS/TSX files missing header); headers present spell `Vastenekels` not `Vastenaekels`
- **Observation:** Of 56 Python files in `backend/app/`, 46 lack a copyright header. Of 527 TS/TSX files in `frontend/src/`, 452 lack a header. Among the 86 files that do carry headers (10 backend + 76 frontend), all use `Copyright (C) 2025 Julien Vastenekels` — misspelling the family name (missing the `a` between `Vast` and `ekels`; correct form per CITATION.cff: `Vastenaekels`). Year is 2025, but the project is submitted in 2026 — this will be noticed by reviewers scanning source files.
- **Impact:** Inconsistent headers do not by themselves cause rejection, but reviewers inspecting source files to verify license compliance will find the majority of files unlicensed at the file level. The name misspelling contradicts CITATION.cff and could create attribution ambiguity.
- **Recommendation:** (1) Use `sed` or a script to add a standardized header to all source files lacking one, with correct spelling `Vastenaekels` and year `2025–2026`. (2) Fix existing misspelled headers. A Makefile target `make add-headers` with `addlicense` or a Python script is efficient at scale.
- **Effort:** M

---

### F-12-006 : No CONTRIBUTING.md at repository root

- **Severity:** major
- **Audience:** [SoftwareX] [Maintenance]
- **Location:** repository root (file absent), `docs/contributing/` (contributing docs exist)
- **Observation:** There is no `CONTRIBUTING.md` at the repository root. Contributing documentation exists at `docs/contributing/` (with `coding-standards.md`, `backend-guidelines.md`, `frontend-guidelines.md`) and linked from the README. However, GitHub and most tooling (including JOSS review bots) look for `CONTRIBUTING.md` at the root. SoftwareX and JOSS criteria explicitly require "contribution, issue reporting, and support guidelines" to be accessible from the repo root.
- **Impact:** Automated reviewer tooling will flag "no CONTRIBUTING.md found." A reviewer landing on the repository will not immediately see a contribution path without drilling into `docs/`. The README mentions contributions ("Contributions are welcome. Please read the guidelines…") but the pointer goes to sub-docs, not a canonical root file.
- **Recommendation:** Create `/CONTRIBUTING.md` at the root with: a brief welcome, the code of conduct pointer, a "how to report issues" section, and links to the detailed guides in `docs/contributing/`. The file can be thin — the detail stays in `docs/` — but the root file must exist.
- **Effort:** S

---

### F-12-007 : No GitHub issue templates

- **Severity:** minor
- **Audience:** [SoftwareX] [Maintenance]
- **Location:** `.github/` (no `ISSUE_TEMPLATE/` directory)
- **Observation:** `.github/` contains only `pull_request_template.md` and `workflows/`. No issue templates exist (bug report, feature request, Q-methodology specific). JOSS criteria note "issue reporting guidelines" as required. Without templates, issues filed by users are free-form and harder to triage.
- **Impact:** Minor quality signal for reviewers; does not block submission but is expected for mature open-source projects. SoftwareX reviewers check whether the project is set up for community engagement.
- **Recommendation:** Add `/.github/ISSUE_TEMPLATE/bug_report.md` and `/.github/ISSUE_TEMPLATE/feature_request.md` with standard GitHub template content. Takes ~15 minutes.
- **Effort:** S

---

### F-12-008 : Broken internal link in `docs/contributing/agent-instructions.md`

- **Severity:** minor
- **Audience:** [Maintenance]
- **Location:** `docs/contributing/agent-instructions.md:17, 54` (links to `backend/app/schemas.py` which does not exist)
- **Observation:** Lychee link checker (`.raw/lychee-links.json`) reports 2 errors, both pointing to `file:///home/julien/libre-q/backend/app/schemas.py` from `agent-instructions.md`. The file `backend/app/schemas.py` was apparently split or renamed; schemas now live under `backend/app/schemas/`. This is a stale internal link.
- **Impact:** The link checker fails on this file (2 errors total). If lychee is integrated into CI and run on the submitted tag, this would cause a CI failure visible to reviewers. Also misleading for contributors reading agent instructions.
- **Recommendation:** Update links in `agent-instructions.md` to point to the correct location (e.g., `backend/app/schemas/` directory or a specific schema file). [parent: F-10-XXX if a documentation axis finding covers this]
- **Effort:** S

---

### F-12-009 : OpenAPI client in sync — no finding (positive)

- **Severity:** observation
- **Audience:** [SoftwareX]
- **Location:** `.raw/openapi-sync.log`
- **Observation:** `make generate-api` + `make check-api` ran cleanly with exit code 0. The `git diff` on `frontend/src/api/generated.ts` and `frontend/openapi.json` is empty, confirming the frontend API client matches the current backend schema. This is a positive signal for reviewer confidence in contract-first development.
- **Impact:** N/A (positive)
- **Recommendation:** None required. Ensure this check stays green after any backend schema change.
- **Effort:** —

---

## Package Readiness Track (Reviewer Perspective)

### F-12-010 : Critical Q positioning absent from all public-facing documentation

- **Severity:** major
- **Audience:** [SoftwareX]
- **Location:** `README.md` (entire file), `CITATION.cff:6–9`, `docs/explanation/q-methodology.md`
- **Observation:** Per the project's own stated design philosophy (MEMORY.md: "Libre-Q is critical Q-methodology oriented — design + audit + manuscript framing must benchmark against critical Q lit, not classical Q only"), Libre-Q is positioned for critical Q-methodology. However, the README contains zero mentions of "critical Q," emancipatory research, researcher voice, power, social justice, abductive reasoning, or any distinguishing feature of the critical Q tradition (Stainton Rogers 1997, Sneegas 2020, Stenner 2011, Ormerod 2019). The CITATION.cff `abstract` describes Libre-Q as "integrat[ing] the complete Q-methodology workflow" with no critical Q framing. `docs/explanation/q-methodology.md` describes classical Q (Stephenson 1935) and cites only Watts & Stenner 2012 and Brown 1993. The comparison table in the README covers capability dimensions (mobile, cloud, export) but says nothing about which tools support manual rotation, researcher-controlled flagging, or interpretive transparency — which are the critical Q differentiators.
- **Impact:** The "Statement of Need" in the SoftwareX manuscript must explain why Libre-Q exists vs. existing tools. If the critical Q orientation is absent from the README and CITATION.cff, the manuscript's statement of need will seem disconnected from the software itself. A reviewer reading the README will conclude Libre-Q is a convenient web-wrapper around PQMethod, not a tool designed for a different research paradigm. This significantly weakens the scientific originality claim.
- **Recommendation:** Add a "Research paradigm" or "Critical Q orientation" paragraph to the README (after the comparison table or in the statement of need section). Minimally: one sentence stating that Libre-Q is designed to support critical Q-methodology practices (researcher-controlled flagging, manual rotation, audit trail, participant voice through post-sort audio) and linking to the Q-methodology explanation doc. Update CITATION.cff `abstract` to include the critical Q framing. Update `docs/explanation/q-methodology.md` to include a section on critical vs. classical Q and cite Sneegas 2020 or Stainton Rogers 1997.
- **Effort:** M

---

### F-12-011 : Comparison table omits qmethod-R and KADE; incorrect "Open source" claim for Ken-Q

- **Severity:** major
- **Audience:** [SoftwareX]
- **Location:** `README.md:16–29`
- **Observation:** The comparison table includes FlashQ/HTMLQ, PQMethod, and Ken-Q. It omits: (1) **qmethod-R** — the R package by Zabala 2014, which is open source, has built-in factor analysis (PCA, centroid, varimax), and is widely cited in Q-methodology literature; its omission is conspicuous for any reviewer familiar with the field. (2) **KADE** — listed in the audit spec as a tool to compare against; not assessed here because its current status is uncertain, but omission should be deliberate and explained. The table also marks Ken-Q as "No" in the "Open source" column — Ken-Q Analysis is free-to-use but its source availability should be verified before publication. PQMethod is correctly labeled as not OSI-licensed open source (it is freeware). The "Export to PQMethod / R / Ken-Q" row shows "N/A" for alternatives, which is misleading since qmethod-R and PQMethod can export/import formats.
- **Impact:** A SoftwareX reviewer who uses qmethod-R (a common tool in the field) will immediately notice its absence and question whether the authors are aware of the literature. Missing qmethod-R from the comparison is equivalent to a data science tool paper omitting scikit-learn from its feature comparison. This weakens the "state of the field" section of the manuscript.
- **Recommendation:** Add a qmethod-R column to the comparison table. Verify Ken-Q's open source status. Add a footnote clarifying that "Open source" means OSI-approved license. Consider whether KADE should be included or explicitly excluded with a reason. The table rows should also include at least one critical-Q–relevant dimension (e.g., "Manual flagging control," "Manual rotation support") to make Libre-Q's differentiator visible.
- **Effort:** M

---

### F-12-012 : README "Why Libre-Q?" section is not a formal Statement of Need

- **Severity:** major
- **Audience:** [SoftwareX]
- **Location:** `README.md:14–29`
- **Observation:** SoftwareX and JOSS require an explicit "Statement of Need" that: (a) describes the problem, (b) identifies the target audience, (c) explains why existing tools are insufficient, and (d) positions the new tool in the research ecosystem. The README's "Why Libre-Q?" section is a feature comparison table — it shows capabilities but does not narrate the problem, does not mention who the target users are (critical Q researchers? social scientists? educators?), and does not articulate what research problem Libre-Q solves that PQMethod + HTMLQ + qmethod-R cannot. The table format is useful but insufficient as a standalone statement of need.
- **Impact:** JOSS review criteria: "Authors must describe the need for their software in terms of the problem it solves, for whom, and how it relates to existing work." Without this prose, the manuscript's statement of need will be weak, and any attempt to copy the README "Why Libre-Q?" section into the manuscript will need substantial rewriting.
- **Recommendation:** Add a brief prose paragraph (3–5 sentences) above or below the comparison table in the README. This paragraph should: (1) identify the gap (no single tool integrates browser-based collection + analysis + critical Q support for distributed teams), (2) name the target audience (Q-methodology researchers, especially those conducting online or multi-site studies), (3) state Libre-Q's core value proposition. This prose can then form the basis of the manuscript's statement of need.
- **Effort:** M

---

### F-12-013 : README Quick Start omits required environment variable setup

- **Severity:** major
- **Audience:** [SoftwareX] [Prod]
- **Location:** `README.md:94–127`
- **Observation:** The "Quick Start" section shows `git clone`, `make install`, `make run-backend`, `make run-frontend`. It does not mention that the backend requires a `DATABASE_URL` and `SECRET_KEY` environment variable before `make run-backend` will succeed. Without these, the backend exits immediately. The environment variable setup is documented in `docs/tutorials/local-development.md` (Step 4), but the README Quick Start does not mention this dependency or link to it. There is also no `.env.example` file at the repository root or in `backend/`.
- **Impact:** A reviewer following only the README Quick Start will fail to launch the backend. "Install from zero" fails in under 2 minutes. For SoftwareX, the reviewer's ability to install and verify core functionality is a mandatory assessment step. This is the most likely single point of failure for a reviewer attempting to run Libre-Q cold.
- **Recommendation:** (1) Add a `.env.example` file to `backend/` (or the repo root) with all required and optional environment variables, documented with comments. (2) Add a step in README Quick Start: "Before running: copy `backend/.env.example` to `backend/.env` and fill in your PostgreSQL credentials and a random `SECRET_KEY`." The full tutorial can remain at `docs/tutorials/local-development.md` — the README just needs to not silently skip a prerequisite.
- **Effort:** S

---

### F-12-014 : Hero screenshot missing from README

- **Severity:** minor
- **Audience:** [SoftwareX]
- **Location:** `README.md:10`
- **Observation:** `README.md` line 10 contains `<!-- TODO: Add hero screenshot of the Q-sort grid interface -->`. No screenshot exists anywhere in the repository (`docs/screenshots/` directory does not exist). For a browser-based research tool, visual evidence of the interface is the fastest way for a reviewer to understand what the software does. SoftwareX allows up to 6 figures; at least one should be a screenshot of the core Q-sort interface.
- **Impact:** Reviewers assessing the software without running it will have no visual context. The README looks unfinished (visible TODO comment). Minor negative first impression.
- **Recommendation:** Add 1–2 screenshots: (1) the participant Q-sort grid (FineSortPage) showing the drag-and-drop interface, (2) optionally the analysis dashboard showing factor loadings. Place in `docs/screenshots/` and embed in README, replacing the TODO comment. These screenshots are also required for the SoftwareX manuscript figures.
- **Effort:** S

---

### F-12-015 : No Acknowledgments section in README

- **Severity:** minor
- **Audience:** [SoftwareX]
- **Location:** `README.md` (section absent)
- **Observation:** The README has no "Acknowledgments" section. JOSS paper requirements include acknowledgments of funding, institutional support, or contributors. SoftwareX manuscripts also typically include an acknowledgments section. The README does not mention URCA (Université de Reims Champagne-Ardenne), any funding sources, or any collaborators beyond the two named authors. The LICENSE file names only J. Vastenaekels, not both co-authors (though AGPL permits this).
- **Impact:** Minor quality signal; absence of acknowledgments in a journal submission is noted but not a desk-reject trigger. However, if the work is funded (e.g., by ANR or institutional support), missing the acknowledgment violates journal ethics policies.
- **Recommendation:** Add a brief "Acknowledgments" section to the README and manuscript. Include: institutional affiliation (URCA), any funding sources if applicable, and tools/libraries that should be credited (uv, dnd-kit, FastAPI, qmethod-R for validation reference). Check with co-author whether any grants apply.
- **Effort:** S

---

### F-12-016 : No AI usage disclosure

- **Severity:** major
- **Audience:** [SoftwareX]
- **Location:** `README.md` (absent), manuscript (not yet written)
- **Observation:** JOSS review criteria (fetched 2026-04-25) explicitly require: "An explicit statement of whether generative AI was used in development, documentation, or paper authoring." SoftwareX follows Elsevier's AI disclosure policy (authors must declare use of AI/LLM tools in the Methods or Acknowledgments section). Per the project's CLAUDE.md and session context, Claude (Anthropic) was used as a co-developer and auditor throughout this project. The CITATION.cff, README, and codebase contain no disclosure.
- **Impact:** Failure to disclose AI use when submitting to SoftwareX or JOSS is a policy violation that can result in retraction post-publication. This is a new but strict requirement that must be addressed in the manuscript.
- **Recommendation:** Add an "AI Usage Disclosure" subsection to the manuscript (in Methods or Acknowledgments): state that Claude Code (Anthropic) was used for code development, documentation drafting, and audit assistance; that all outputs were reviewed and verified by the human authors. Add a brief note in the README (one sentence, optional but good practice). Elsevier's policy requires this be in the manuscript, not just the README.
- **Effort:** S

---

### F-12-017 : `requirements.txt` is a redirect — may confuse pip users

- **Severity:** observation
- **Audience:** [SoftwareX] [Maintenance]
- **Location:** `requirements.txt:1`
- **Observation:** `requirements.txt` at the repository root contains only `-r backend/requirements.txt`. The file exists but `backend/requirements.txt` was not found in this audit scope. The pattern is unusual: `uv` manages dependencies via `pyproject.toml` and `uv.lock`, so a `requirements.txt` redirect is likely a compatibility shim. A reviewer or contributor trying `pip install -r requirements.txt` may get unexpected results or nothing.
- **Impact:** Observation only. The project correctly uses `uv` as documented; `requirements.txt` is a legacy compatibility artifact. Low risk.
- **Recommendation:** Either (1) document in README that `pip install` is not the correct install path (use `make install` / `uv sync`), or (2) add a note in `requirements.txt` explaining its purpose. Avoid confusion for Python users who expect `requirements.txt` to be the canonical install method.
- **Effort:** S

---

### F-12-018 : Development history: no visible commit history timeline public signal

- **Severity:** observation
- **Audience:** [SoftwareX]
- **Location:** transverse (git history, GitHub repo)
- **Observation:** JOSS criteria require "commit history spanning an extended period (6+ months minimum)" and the repository being public with releases, issues, and external engagement for 6+ months. The git history in this local clone cannot be assessed for public GitHub visibility timeline. This is flagged as an observation — not a finding — because: (1) the public GitHub repo's age and commit history must be verified on GitHub itself; (2) if the repo was made public recently (within 6 months of submission), this would be a major JOSS issue but not a blocker for SoftwareX, which has no explicit development history requirement.
- **Impact:** If the GitHub repo `jvastenaekels/libre-q` was created or made public recently, JOSS submission would face "insufficient development history" rejection. SoftwareX does not enforce this criterion explicitly.
- **Recommendation:** Verify the GitHub repository creation date and public visibility history. If the repo is less than 6 months public, note this explicitly in the manuscript's "state of the field" section as context, and consider whether a JOSS submission is feasible before a SoftwareX one.
- **Effort:** S (verification only)

---

## Summary Table

| ID | Title | Severity | Effort |
|:---|:------|:---------|:-------|
| F-12-001 | No git tag — submitted version not frozen | blocker | S |
| F-12-002 | No Zenodo archive — DOI missing | blocker | S |
| F-12-003 | CI not triggered on push/PR — badge stale | blocker | S |
| F-12-004 | CITATION.cff missing ORCIDs | major | S |
| F-12-005 | Copyright headers inconsistent + name misspelled | minor | M |
| F-12-006 | No CONTRIBUTING.md at repository root | major | S |
| F-12-007 | No GitHub issue templates | minor | S |
| F-12-008 | Broken internal link in agent-instructions.md | minor | S |
| F-12-009 | OpenAPI client in sync (positive) | observation | — |
| F-12-010 | Critical Q positioning absent from all docs | major | M |
| F-12-011 | Comparison table omits qmethod-R and KADE | major | M |
| F-12-012 | "Why Libre-Q?" is not a formal Statement of Need | major | M |
| F-12-013 | Quick Start omits required env var setup | major | S |
| F-12-014 | Hero screenshot missing from README | minor | S |
| F-12-015 | No Acknowledgments section | minor | S |
| F-12-016 | No AI usage disclosure | major | S |
| F-12-017 | `requirements.txt` is a redirect shim | observation | S |
| F-12-018 | Development history public signal unverified | observation | S |

**Totals:** 3 blocker · 6 major · 4 minor · 3 observation (+ 1 positive observation F-12-009)

---

## Key SoftwareX Guide Requirements Mapped

| Requirement | Status | Finding |
|:------------|:-------|:--------|
| GitHub-hosted (not GitLab) | Confirmed | — |
| LICENSE file present, OSI-approved | Present (AGPL-3.0) | — |
| README well-written, explains use/install/purpose | Partial | F-12-012, F-12-013 |
| Tagged version matching manuscript | Missing | F-12-001 |
| Zenodo archive + DOI | Missing | F-12-002 |
| CITATION.cff valid per schema | Valid (cffconvert) | — |
| CITATION.cff ORCIDs | Missing | F-12-004 |
| CI active on push | Disabled | F-12-003 |
| CONTRIBUTING.md accessible | Not at root | F-12-006 |
| Statement of need | Table only, not prose | F-12-012 |
| Comparison to alternatives | Incomplete (missing qmethod-R) | F-12-011 |
| AI disclosure | Absent | F-12-016 |
| Screenshot / figures | Missing from README | F-12-014 |
| Critical Q positioning | Absent | F-12-010 |

---

## Reviewer Simulation: First-10-seconds Test

A SoftwareX reviewer landing on `github.com/jvastenaekels/libre-q`:

1. **Sees:** CI badge (status unknown — last manual run), AGPL badge, tagline "Open-source platform for Q-methodology research." No screenshot. **Verdict: clean but static.**
2. **Reads "Why Libre-Q?" table:** Understands the capability landscape but is missing qmethod-R from the comparison. No prose. **Verdict: incomplete.**
3. **Clicks "Quick Start":** Tries `make install` then `make run-backend` → backend crashes silently (no DATABASE_URL). **Verdict: install fails without prior knowledge.** This is the single highest-risk reviewer moment.
4. **Checks tags:** Zero tags. No Zenodo link. **Verdict: no pinned version.** Reviewer cannot verify the manuscript's described version.
5. **Checks CI:** Badge shows stale status (manual-only trigger). **Verdict: does not confirm passing tests.**

**Estimated time-to-first-running-instance from README alone:** > 30 minutes for an experienced developer; likely fails for a domain expert without Docker/PostgreSQL experience unless they find the tutorial.

---

## Cross-References to Other Axes

- F-12-008 (broken link) shares root cause with documentation axis (axis 10) finding on stale schema path in agent-instructions.
- F-12-013 (missing .env.example) shares root cause with axis 09 (reproducibility) finding on environment documentation if one exists.
- F-12-003 (CI not triggered on push) shares root cause with axis 09 (reproducibility) finding on CI reliability if one exists.
