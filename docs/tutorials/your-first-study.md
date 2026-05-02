# Your First Study

In this tutorial, you will create a complete Q-methodology study from scratch using Qualis. By the end, you will have a fully configured study ready for participants to complete -- including a welcome page, consent form, presort questionnaire, forced-distribution grid, statements, and post-sort questions.

We will build a study called **"Attitudes Toward Remote Work"** with 12 example statements. This is a small study designed for learning; a real Q study typically has 30-60 statements.

> **A few terms used throughout this tutorial.** A *Q-sort* is the act of rank-ordering a set of *statements* (a few dozen short claims about the topic) into a *forced-distribution grid* — a pyramid-shaped table that requires a near-normal distribution of placements. The forced shape compels participants to trade statements off against each other rather than agreeing with everything. The *Condition of Instruction* is the prompt that fixes the mental frame of the sort (e.g., "sort these statements according to your *personal experience* of remote work"). For a fuller introduction, see [`../explanation/q-methodology.md`](../explanation/q-methodology.md).

**What you will learn:**

- How to create a project and a study
- How to configure the General tab (title, description, consent form)
- How to write a Condition of Instruction
- How to add statements and design a forced-distribution grid
- How to add presort and post-sort questions
- How to validate and activate your study

**Time required:** ~30 minutes

**Prerequisites:** A Qualis account with researcher-level access. If you are running Qualis locally, see the [Development Workflow guide](../contributing/development.md) first.

---

## Step 1: Create a Project

Projects in Qualis organize your studies and team members. Think of a project as a research lab or project group.

1. Log in to Qualis. You will land on the admin dashboard.
2. In the left sidebar, look for the **Project Switcher** at the top. Click on it and select **Create Project**.
3. Fill in the form:
   - **Name:** `Remote Work Research Lab`
   - **URL slug:** `remote-work-lab` (this auto-generates from the name; you can customize it)
4. Click **Create Project**.

You are now inside your new project. The sidebar shows project-level navigation.

---

## Step 2: Create a New Study

1. From your project dashboard, click the **New Study** button (or use the Study Switcher in the sidebar).
2. In the "Create Study" dialog, fill in:
   - **Title:** `Attitudes Toward Remote Work`
   - **Slug:** `remote-work-attitudes` (auto-generated; must be lowercase letters, numbers, and hyphens only)
   - **Languages:** Check **English**. You can add French or Finnish later if you want a multilingual study.
3. Click **Create**.

Qualis creates the study in **Draft** state and takes you to the **Study Designer** page. The designer has seven tabs:

- **General** 👋 — title, description, consent form
- **Pre-sort** 📋 — pre-sorting questionnaire (demographics, eligibility)
- **Condition** 🎯 — Condition of Instruction, plus the rough-sort toggle and post-sort defaults
- **Q-sort** 🧩 — statements and the distribution grid (forced, free, or flexible)
- **Post-sort** 💬 — post-sorting questionnaire
- **Theme** 🎨 — logo, colors, partner logos
- **Interface** ✨ — UI label customization and behavioral options

---

## Step 3: Configure the Welcome Page (General Tab)

The General tab is where you define what participants see before they begin.

1. Make sure the **General** tab is selected.
2. Fill in the following fields:

   **Title:** `Attitudes Toward Remote Work`

   **Subtitle** (optional): `A Q-methodology study on workplace preferences`

   **Description:**
   > This study explores how people think and feel about remote work arrangements. You will be asked to sort a set of statements according to how much you agree or disagree with each one. There are no right or wrong answers -- we are interested in your personal perspective.

   **Objective:**
   > To identify distinct viewpoints on remote work among knowledge workers, and understand the values, concerns, and priorities that shape those viewpoints.

3. Scroll down to the **Consent Form** section:

   **Consent Title:** `Informed Consent`

   **Consent Description** (supports Markdown):
   > By participating in this study, you agree to the following:
   > - Your responses will be recorded anonymously.
   > - No personally identifiable information is collected.
   > - You may withdraw at any time by closing your browser.
   > - Your data will be used solely for academic research purposes.
   > - The study takes approximately 15-20 minutes to complete.

4. Click **Save** (or press Ctrl+S / Cmd+S).

---

## Step 4: Add Presort Questions (Pre-sort Tab)

Presort questions collect demographic or background information before participants begin sorting.

1. Click the **Pre-sort** tab.
2. Click **Add Question** and configure the first question:
   - **Field key:** `work_arrangement`
   - **Type:** Select (dropdown)
   - **Label:** `What is your current work arrangement?`
   - **Required:** Yes
   - **Options:** `Fully remote`, `Hybrid (some days remote, some in office)`, `Fully in-office`, `Freelance / Self-employed`

3. Click **Add Question** for a second question:
   - **Field key:** `experience_years`
   - **Type:** Select
   - **Label:** `How many years of professional experience do you have?`
   - **Required:** Yes
   - **Options:** `Less than 2 years`, `2-5 years`, `6-10 years`, `More than 10 years`

4. Click **Save**.

---

## Step 5: Write the Condition of Instruction (Condition Tab)

The Condition of Instruction tells participants the mental frame through which they should sort the statements.

1. Click the **Condition** tab.
2. Enter the following (Markdown supported):

   > Please sort the following statements based on **your personal experience and opinion about remote work**. Think about how strongly you agree or disagree with each statement as it relates to your own working life. There are no right or wrong answers. Sort the statements from **most disagree** (left) to **most agree** (right).

3. Click **Save**.

> **Writing a non-leading Condition of Instruction.**
>
> The CoI is the most consequential single sentence in your study. A small phrasing change shifts the entire viewpoint participants surface. Some heuristics:
>
> - **Anchor the sort in lived experience or position**, not in evaluation: *"sort according to your personal experience of remote work"* invites a phenomenological frame; *"sort by what is true about remote work"* invites a normative frame and constrains the viewpoints you'll discover.
> - **Avoid moral framings** (*"good vs bad"*, *"right vs wrong"*) unless that is exactly the question — they collapse subjectivity onto a single axis.
> - **Pilot the CoI on three or four colleagues** and ask them to paraphrase it back. If three of them paraphrase differently, the CoI is ambiguous.
>
> Critical Q-methodologists treat CoI design as a reflexive moment in itself: the choice of frame is a research decision worth documenting. The Condition tab is also where the **rough-sort toggle** and the post-sort defaults live — see Step 8 for a discussion of when to enable rough-sort.

---

## Step 6: Add Statements and Configure the Grid (Q-sort Tab)

This is the core of your Q study.

### 6a: Add Statements

1. Click the **Q-sort** tab.
2. Add each statement with a code and text:

| Code | Statement Text |
|------|----------------|
| S01  | Remote work gives me more control over my daily schedule. |
| S02  | I feel more productive when I work from home. |
| S03  | I miss the social interactions that come with working in an office. |
| S04  | Remote work makes it harder to separate work from personal life. |
| S05  | Video calls are an adequate substitute for in-person meetings. |
| S06  | I feel more trusted by my employer when I can work remotely. |
| S07  | Career advancement is harder when working remotely. |
| S08  | Remote work reduces my commuting stress significantly. |
| S09  | I find it difficult to stay motivated without colleagues around me. |
| S10  | Remote work tools (Slack, Zoom, etc.) create too many distractions. |
| S11  | Working remotely has improved my overall quality of life. |
| S12  | In-person collaboration is essential for creative work. |

### 6b: Configure the Distribution Grid

For 12 statements, use a 7-column grid ranging from -3 to +3:

| Score | -3 | -2 | -1 |  0 | +1 | +2 | +3 |
|-------|----|----|----|----|----|----|----|
| Slots |  1 |  1 |  2 |  4 |  2 |  1 |  1 |

The pyramid shape is intentional: it has more slots in the middle and fewer at the extremes. The total slot count must equal the statement count — 12 slots, 12 statements. The designer shows a warning banner if these do not match.

> **Forced vs free vs flexible distribution — the methodological choice.**
>
> Qualis supports three distribution modes (the default is **forced**):
>
> - **Forced** — participants must fit their sort into the per-column slot counts; columns fill exactly. Compels trade-offs ("you can only have one statement at +3"), which makes Q-sorts comparable across participants in classical Brown-school analysis (Brown 1980; Watts & Stenner 2012).
> - **Free** — slot counts are upper hints; columns may absorb overflow at sort time. The total submitted count must still equal the Q-set size, but column capacities are not enforced. Some critical-Q practitioners argue forced distributions impose an artificial structure on subjectivity (Brown et al. 2015; Watts & Stenner 2012, ch. 4).
> - **Flexible** — total enforced, per-column hints are soft (designer warns but does not block). Qualis-specific compromise.
>
> For this tutorial we use **forced** — the most common starting point and the cleanest pedagogical example. The mode lives on the Q-sort tab and is reversible until activation. For the formal field reference, see [`configuration.md`](../reference/configuration.md#distribution_mode).

Click **Save**.

---

## Step 7: Add Post-Sort Questions (Post-Sort Tab)

1. Click the **Post-sort** tab.
2. Enable the extreme column feedback (on by default). Participants will be asked to explain their choices for statements placed at -3 and +3.
3. Optionally, add a custom question:
   - **Key:** `overall_thoughts`
   - **Type:** Textarea
   - **Label:** `Do you have any additional thoughts about remote work that were not captured in the statements?`
   - **Required:** No
4. Click **Save**.

---

## Step 8: Decide on the rough-sort step

The **rough-sort** is a 3-pile triage (agree / neutral / disagree) that precedes the fine-sort grid. The toggle lives on the **Condition** tab → *Rough-sort enabled*. It is **on by default**.

> **Rough-sort: should you enable it?**
>
> Only ~38% of published Q studies use a rough-sort step (Dieteren et al. 2023). It lowers cognitive load before participants commit to specific positions, which can help on long Q-sets (40+ statements) or with younger / less experienced participants. On a short, well-instructed sort it adds friction without much benefit.
>
> For this tutorial (12 statements, brief CoI), **disable** the rough-sort: open the Condition tab, find the *Rough-sort enabled* toggle, switch it off. Participants will go directly from pre-sort to the fine-sort grid via a horizontally-scrollable deck.

## Step 9: Optional — Customize Theme and Interface

### Theme tab

Upload a **logo**, set an **accent color**, and add **partner logos** that appear on the welcome page.

### Interface tab

- **Randomize statement order**: Recommended to reduce ordering bias.
- **Show statement codes**: Useful for think-aloud protocols.

---

## Step 10: Preview Your Study

1. In the designer toolbar, click the **Preview** button. This opens the study in a new tab in pilot mode.
2. Walk through the participant flow: **Welcome, Consent, Pre-sort, Fine Sort, Post-Sort.** (If you re-enabled rough-sort, an extra triage step appears between Pre-sort and Fine Sort.)
3. At the end you get a local `PILOT-XXXXX` confirmation code. Nothing is persisted to the database — you can preview as many times as you like without polluting the eventual dataset.

---

## Step 11: Open a methodology memo

Click the **Memos** button in the toolbar. A drawer opens. Add a methodology memo and write a short note — even one paragraph — recording the design decisions you just made: why this CoI, why forced distribution, why no rough-sort, why 12 statements.

Five minutes now, hours saved later when a co-author asks why forced over free, or when you write the methods section. Memos travel with the Research Package export, so the audit trail stays attached to the data.

> **Why this matters for both schools.** Classical Brown-school papers need a clear methodology memo because reviewers ask about extraction, rotation, and flagging. In critical-Q work, the memo is itself part of the analytical artefact: the design choices it records shape which subjectivities the study can surface.

---

## Step 12: Activate Your Study

1. Return to the Study Designer.
2. Click the **Activate Study** button.
3. Qualis runs server-side validation. If there are issues, a dialog will list them.
4. Once validated, the study state changes from **Draft** to **Active**.

Your study is now live: the status badge in the header turns green and reads **Active**, and the structural fields in the designer (grid, statements) become read-only. Translations and metadata remain editable.

---

## What You Built

You now have a fully configured Q-methodology study with:
- A project to organize your research
- A welcome page with title, description, and objective
- An informed consent form
- Two pre-sort demographic questions
- A condition of instruction (with a methodology memo capturing why you chose it)
- 12 statements about remote work
- A 7-column forced-distribution grid (-3 to +3); rough-sort disabled
- Post-sort feedback for extreme placements

## Next Steps

Continue to **[Collecting Responses](collecting-responses.md)** to learn how to create recruitment links and share your study.
