# Your First Study

In this tutorial, you will create a complete Q-methodology study from scratch using Qualis. By the end, you will have a fully configured study ready for participants to complete -- including a welcome page, consent form, presort questionnaire, forced-distribution grid, statements, and post-sort questions.

We will build a study called **"Attitudes Toward Remote Work"** with 12 example statements. This is a small study designed for learning; a real Q study typically has 30-60 statements.

> **A few terms used throughout this tutorial.** A *Q-sort* is the act of rank-ordering a set of *statements* (a few dozen short claims about the topic) into a *forced-distribution grid* — a pyramid-shaped table that requires a near-normal distribution of placements. The forced shape compels participants to trade statements off against each other rather than agreeing with everything. The *Condition of Instruction* is the prompt that fixes the mental frame of the sort (e.g., "sort these statements according to your *personal experience* of remote work"). For a fuller introduction, see [`../explanation/q-methodology.md`](../explanation/q-methodology.md).

**What you will learn:**

- How to create a project and a study
- How to configure the General tab (welcome message, process introduction, consent form)
- How to write a Condition of Instruction
- How to add statements and design a forced-distribution grid
- How to add presort and post-sort questions
- How to validate and activate your study

**Time required:** ~30 minutes

**Prerequisites:** A running Qualis instance and an account with Owner or Member access to a project (the roles that can create studies). For the quickest local start, use the [Docker quick start](../../README.md#quick-start-docker). For a development environment with hot reload, use the [Development Workflow guide](../contributing/development.md).

> **Following the English labels.** The administration interface initially follows your browser language. If it is not in English, use the language selector near the bottom of the left sidebar and select **EN — English**. The participant-facing language is configured separately for each study.

---

## Step 1: Create a Project

Projects in Qualis organize your studies and team members. Think of a project as a research lab or project group.

1. Log in to Qualis. You will land on your last project dashboard, or on the Researcher Hub if you do not have a project yet.
2. From the Hub, click **New project**. From a project dashboard, open the **Project Switcher** at the top of the left sidebar and select **New project**.
3. Fill in the form:
   - **Project name:** `Remote Work Research Lab`
   - **Project URL:** `remote-work-lab` (this auto-generates from the name; you can customize it)
4. Click **Create project**. Qualis opens **Project settings**; select **Dashboard** in the sidebar to continue.

**Expected result:** you are now inside **Remote Work Research Lab**, and the sidebar shows project-level navigation.

---

## Step 2: Create a New Study

1. From your project dashboard, click **Create study** (or use the Study Switcher in the sidebar).
2. In the **Create new study** dialog, fill in:
   - **Study title:** `Attitudes Toward Remote Work`
   - **URL slug:** `remote-work-attitudes` (auto-generated; must be lowercase letters, numbers, and hyphens only)
   - **Languages:** Check **English**. You can add French or Finnish later if you want a multilingual study.
3. Click **Create study**.

**Expected result:** Qualis opens the **Study Designer** with a **Draft** badge. The designer has seven tabs:

- **General** 👋 — welcome message, process introduction, consent form
- **Pre-sort** 📋 — pre-sorting questionnaire (demographics, eligibility)
- **Condition** 🎯 — Condition of Instruction, plus the rough-sort toggle
- **Q-sort** 🧩 — statements and the distribution grid (forced, free, or flexible)
- **Post-sort** 💬 — post-sorting questionnaire
- **Theme** 🎨 — logo, colors, partner logos
- **Interface** ✨ — UI label and terminology customization

---

## Step 3: Configure the Welcome Page (General Tab)

The General tab is where you define what participants see before they begin.

1. Make sure the **General** tab is selected and expand **Welcome message**.
2. Fill in the following fields:

   **Study title:** `Attitudes Toward Remote Work`

   **Subtitle** (optional): `A Q-methodology study on workplace preferences`

   **Study objective:**
   > To identify distinct viewpoints on remote work among knowledge workers, and understand the values, concerns, and priorities that shape those viewpoints.

3. Expand **Study steps overview**. In **Introduction**, replace the default text with:

   > This study explores how people think and feel about remote work arrangements. You will be asked to sort a set of statements according to how much you agree or disagree with each one. There are no right or wrong answers -- we are interested in your personal perspective.

   Leave the default process steps in place. Qualis will automatically hide the rough-sort step later when you disable it.

4. Expand **Consent form**:

   **Consent title:** `Informed Consent`

   **Legal text / agreement** (supports Markdown):
   > By participating in this study, you agree to the following:
   > - Your responses will be recorded anonymously.
   > - No personally identifiable information is collected.
   > - You may withdraw at any time by closing your browser.
   > - Your data will be used solely for academic research purposes.
   > - The study takes approximately 15-20 minutes to complete.

5. Click **Save** (or press Ctrl+S / Cmd+S), then wait for the toolbar to show **Saved**.

**Expected result:** the General tab contains your public title, subtitle, objective, process introduction, and consent text.

---

## Step 4: Add Presort Questions (Pre-sort Tab)

Presort questions collect demographic or background information before participants begin sorting.

> Each question's field key is assigned automatically and appears in the exported data; you choose the type, label, and options, but you do not enter a key in the UI.

1. Click the **Pre-sort** tab. **Enable pre-sort survey** is on by default.
2. Under **Add a new field** → **Choice fields**, click **Dropdown**. Expand the **New question** card if necessary, then configure:
   - **Question label:** `What is your current work arrangement?`
   - **Required field:** On
   - **Options:** replace the two defaults with `Fully remote` and `Hybrid (some days remote, some in office)`, then click **Add option** twice and enter `Fully in-office` and `Freelance / Self-employed`.
3. Click **Dropdown** again and configure the second question:
   - **Question label:** `How many years of professional experience do you have?`
   - **Required field:** On
   - **Options:** `Less than 2 years`, `2-5 years`, `6-10 years`, `More than 10 years`.
4. Click **Save**, then wait for **Saved**.

**Expected result:** two expanded or collapsed question cards appear in the Pre-sort tab, both marked as required.

---

## Step 5: Write the Condition of Instruction (Condition Tab)

The Condition of Instruction tells participants the mental frame through which they should sort the statements.

1. Click the **Condition** tab.
2. In **Q-Sort instruction**, replace the default text with the following (Markdown supported):

   > Please sort the following statements based on **your personal experience and opinion about remote work**. Think about how strongly you agree or disagree with each statement as it relates to your own working life. There are no right or wrong answers. Sort the statements from **most disagree** (left) to **most agree** (right).

   The separate **Preliminary sort instruction** applies only while the 3-pile preliminary sort is enabled. You will disable that step in Step 8.

3. Click **Save**, then wait for **Saved**.

**Expected result:** the **Q-Sort instruction** contains the remote-work prompt; **Test run** remains unavailable until the statements and grid are valid.

> **Writing a non-leading Condition of Instruction.**
>
> The CoI is the most consequential single sentence in your study. A small phrasing change shifts the entire viewpoint participants surface. Some heuristics:
>
> - **Anchor the sort in lived experience or position**, not in evaluation: *"sort according to your personal experience of remote work"* invites a phenomenological frame; *"sort by what is true about remote work"* invites a normative frame and constrains the viewpoints you'll discover.
> - **Avoid moral framings** (*"good vs bad"*, *"right vs wrong"*) unless that is exactly the question — they collapse subjectivity onto a single axis.
> - **Pilot the CoI on three or four colleagues** and ask them to paraphrase it back. If three of them paraphrase differently, the CoI is ambiguous.
>
> Treat CoI design as a research decision worth documenting: the choice of frame shapes what you can discover, so record why you phrased it as you did. The Condition tab is also where the **rough-sort toggle** lives — see Step 8 for a discussion of when to enable rough-sort.

---

## Step 6: Add Statements and Configure the Grid (Q-sort Tab)

This is the core of your Q study.

### 6a: Add Statements

1. Click the **Q-sort** tab.
2. In the **Statements** subtab, leave **Replace all** selected in **Bulk editor (quick paste)**.
3. Paste the following block into the editor:

   ```text
   S01: Remote work gives me more control over my daily schedule.
   S02: I feel more productive when I work from home.
   S03: I miss the social interactions that come with working in an office.
   S04: Remote work makes it harder to separate work from personal life.
   S05: Video calls are an adequate substitute for in-person meetings.
   S06: I feel more trusted by my employer when I can work remotely.
   S07: Career advancement is harder when working remotely.
   S08: Remote work reduces my commuting stress significantly.
   S09: I find it difficult to stay motivated without colleagues around me.
   S10: Remote work tools (Slack, Zoom, etc.) create too many distractions.
   S11: Working remotely has improved my overall quality of life.
   S12: In-person collaboration is essential for creative work.
   ```

4. Check that the editor reports **12 statements detected**, then click **Process & replace statements**.

**Expected result:** the list heading reads **Q-set (12)**. The capacity warning remains until you resize the grid.

### 6b: Configure the Distribution Grid

1. Open the **Distribution** subtab. The default grid has nine columns and 34 slots.
2. Leave **Symmetry lock** on and click **Reduce** once. The grid now has seven columns, from -3 to +3.
3. Use the **Decrease capacity** button above these columns:
   - `-3`: click twice, reducing it from 3 slots to 1;
   - `-2`: click three times, reducing it from 4 slots to 1;
   - `-1`: click three times, reducing it from 5 slots to 2;
   - `0`: click twice, reducing it from 6 slots to 4.

   With symmetry locked, Qualis applies the same changes to the corresponding positive columns. The final grid is:

| Score | -3 | -2 | -1 |  0 | +1 | +2 | +3 |
|-------|----|----|----|----|----|----|----|
| Slots |  1 |  1 |  2 |  4 |  2 |  1 |  1 |

4. Leave **Distribution mode** set to **Forced**.

The pyramid shape is intentional: it has more slots in the middle and fewer at the extremes. The total slot count must equal the statement count — 12 slots, 12 statements.

**Expected result:** the grid summary reads **12 statements vs 12 slots**, and the capacity mismatch warning disappears.

> **Forced vs free vs flexible distribution — the methodological choice.**
>
> Qualis supports three distribution modes (the default is **forced**):
>
> - **Forced** — participants must fit their sort into the per-column slot counts; columns fill exactly. Compels trade-offs ("you can only have one statement at +3"), which makes Q-sorts comparable across participants in classical Brown-school analysis (Brown 1980; Watts & Stenner 2012).
> - **Free** — slot counts are upper hints; columns may absorb overflow at sort time. The total submitted count must still equal the Q-set size, but column capacities are not enforced. Some critical-Q practitioners argue forced distributions impose an artificial structure on subjectivity (Brown et al. 2015; Watts & Stenner 2012, ch. 4).
> - **Flexible** — total enforced, per-column hints are soft (designer warns but does not block). Qualis-specific compromise.
>
> For this tutorial we use **forced** — the most common starting point and the cleanest pedagogical example. The mode lives on the Q-sort tab and is reversible until activation. For the formal field reference, see [`configuration.md`](../reference/configuration.md#distribution_mode).

### 6c: Research Settings

Return to the **Statements** subtab. The **Research settings** card has two behavioral toggles. For this tutorial:

- Turn **Randomize statement order** on to reduce ordering bias.
- Leave **Show statement codes** off. Enable it later if you use think-aloud protocols.

Click **Save**, then wait for **Saved**. The toolbar's **Test run** button should now be enabled.

---

## Step 7: Add Post-Sort Questions (Post-Sort Tab)

1. Click the **Post-sort** tab. It contains two subtabs.
2. In **Step 1: feedback**, click **Add default extremes**. Qualis selects the grid's lowest and highest scores, here -3 and +3. Participants will be required to explain the statements they place in these columns.
3. Open **Step 2: questions**. Under **Add a new field** → **Basic fields**, click **Long text** and expand the **New question** card if necessary:
   - **Question label:** `Do you have any additional thoughts about remote work that were not captured in the statements?`
   - **Required field:** Off
   - Qualis assigns the exported field key automatically.
4. Click **Save**, then wait for **Saved**.

**Expected result:** Step 1 lists columns `-3` and `+3`; Step 2 contains one optional long-text question.

---

## Step 8: Decide on the rough-sort step

The **rough-sort** is a 3-pile triage (agree / neutral / disagree) that precedes the fine-sort grid. The toggle lives on the **Condition** tab as **Enable preliminary sort (3-pile triage)**. It is on by default.

> **Rough-sort: should you enable it?**
>
> Only ~38% of published Q studies use a rough-sort step (Dieteren et al. 2023). It lowers cognitive load before participants commit to specific positions, which can help on long Q-sets (40+ statements) or with younger / less experienced participants. On a short, well-instructed sort it adds friction without much benefit.
>
> For this tutorial (12 statements, brief CoI), **disable** the rough-sort: open the **Condition** tab, switch off **Enable preliminary sort (3-pile triage)**, click **Save**, and wait for **Saved**. Participants will go directly from pre-sort to the fine-sort grid via a horizontally-scrollable deck.

**Expected result:** the **Preliminary sort instruction** disappears, while the **Q-Sort instruction** remains.

## Step 9: Optional — Customize Theme and Interface

### Theme tab

Upload a **logo**, set an **accent color**, and add **partner logos** that appear on the welcome page.

### Interface tab

Customize the navigation button labels, sorting terminology, methodology hints, and per-step help text that participants see.

---

## Step 10: Test Your Study

1. In the designer toolbar, click **Test run**. This opens the study in a new tab in pilot mode.
2. Walk through the participant flow:
   - **Welcome:** review the page, scroll to the end, and click **Get started**.
   - **Consent:** select the consent checkbox and click **Get started** again.
   - **Pre-sort:** answer both dropdown questions, then click **Next step**.
   - **Fine Sort:** select a statement, then select an empty grid slot. Place all 12 statements and click **Confirm sort**.
   - **Post-sort, Step 1:** explain the statements placed at -3 and +3, then click **Next step**.
   - **Post-sort, Step 2:** optionally answer the additional-thoughts question, then click **Share my perspective**.

   If you re-enable rough-sort, an extra 3-pile step appears between Pre-sort and Fine Sort.
3. At the end, check that you receive a local `PILOT-XXXXX` confirmation code. Nothing is persisted to the database — you can preview as many times as you like without polluting the eventual dataset.

**Expected result:** the final page displays **Thank you for your participation!** and a confirmation code beginning with `PILOT-`.

---

## Step 11: Open a methodology memo

1. Return to the designer tab and click **Methodology memo** in the toolbar.
2. Click **Add entry**, enter `Design rationale` as the section title, and click **Save**.
3. Open **0 comments**, write a short note recording why you chose this CoI, a forced distribution, no rough-sort, and 12 statements, then click **Post**.

**Expected result:** the **Design rationale** entry shows **1 comment**.

Five minutes now, hours saved later when a co-author asks why forced over free, or when you write the methods section. Memos travel with the Research Package export, so the audit trail stays attached to the data.

> **Why this matters for both schools.** Classical Brown-school papers need a clear methodology memo because reviewers ask about extraction, rotation, and flagging. In critical-Q work, the memo is itself part of the analytical artefact: the design choices it records shape which subjectivities the study can surface.

---

## Step 12: Activate Your Study

1. Return to the Study Designer.
2. Use **Next step** until you reach the final **Interface** tab, then scroll to the bottom and click **Activate study**.
3. In **Activate this study?**, review the pre-flight checks. If an item is not ready, cancel and correct it.
4. Select **I have reviewed the consent text, the retention policy, and confirm this study is ready to receive real participants**, then click **Activate study** again.
5. Qualis runs server-side validation. If there are issues, a dialog lists them; otherwise the study state changes from **Draft** to **Active**.

Your study is now live: the status badge in the header turns green and reads **Active**, and the structural fields in the designer (grid, statements) become read-only. Translations and metadata remain editable.

---

## What You Built

You now have a fully configured Q-methodology study with:

- A project to organize your research
- A welcome page with title, process introduction, and objective
- An informed consent form
- Two pre-sort demographic questions
- A condition of instruction (with a methodology memo capturing why you chose it)
- 12 statements about remote work
- A 7-column forced-distribution grid (-3 to +3); rough-sort disabled
- Post-sort feedback for extreme placements
- Randomized statement order

## Next Steps

Continue to **[Collecting Responses](collecting-responses.md)** to learn how to create recruitment links and share your study.
