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

**Prerequisites:** A Qualis account with researcher-level access. If you are running Qualis locally, see the [Local Development Setup](local-development.md) tutorial first.

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

- **General** -- Title, description, consent form
- **Presort** -- Pre-sorting questionnaire
- **Instruction** -- Condition of instruction for the Q-sort
- **Grid & Q-Set** -- Statements and forced-distribution grid
- **Post-sort** -- Post-sorting questionnaire
- **Branding** -- Logo, colors, partner logos
- **Interface** -- UI label customization and behavioral options

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

## Step 4: Add Presort Questions (Presort Tab)

Presort questions collect demographic or background information before participants begin sorting.

1. Click the **Presort** tab.
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

## Step 5: Write the Condition of Instruction (Instruction Tab)

The Condition of Instruction tells participants the mental frame through which they should sort the statements.

1. Click the **Instruction** tab.
2. Enter the following (Markdown supported):

   > Please sort the following statements based on **your personal experience and opinion about remote work**. Think about how strongly you agree or disagree with each statement as it relates to your own working life. There are no right or wrong answers. Sort the statements from **most disagree** (left) to **most agree** (right).

3. Click **Save**.

---

## Step 6: Add Statements and Configure the Grid (Grid & Q-Set Tab)

This is the core of your Q study.

### 6a: Add Statements

1. Click the **Grid & Q-Set** tab.
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

### 6b: Configure the Forced-Distribution Grid

For 12 statements, use a 7-column grid ranging from -3 to +3:

| Score | -3 | -2 | -1 |  0 | +1 | +2 | +3 |
|-------|----|----|----|----|----|----|----|
| Slots |  1 |  1 |  2 |  4 |  2 |  1 |  1 |

The pyramid shape is intentional: it has more slots in the middle and fewer at the extremes. Participants are forced to commit to which statements are *most* and *least* representative of their view, rather than rating everything as a mild agreement. The total slot count must equal the statement count — 12 slots, 12 statements. The designer shows a warning banner if these do not match.

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

## Step 8: Optional -- Customize Branding and Interface

### Branding (Branding Tab)

Upload a **logo**, set an **accent color**, and add **partner logos** that appear on the welcome page.

### Interface (Interface Tab)

- **Randomize statement order**: Recommended to reduce ordering bias.
- **Show statement codes**: Useful for think-aloud protocols.

---

## Step 9: Preview Your Study

1. In the designer toolbar, click the **Preview** button. This opens the study in a new tab in pilot mode.
2. Walk through the entire participant flow: **Welcome, Consent, Presort, Rough Sort, Fine Sort, Post-Sort.** Qualis splits the sort into two stages: a quick triage (the *rough sort*: agree / neutral / disagree) followed by drag-into-grid placement (the *fine sort*). The rough sort lowers cognitive load before the participant has to commit to specific positions.
3. At the end you get a local `PILOT-XXXXX` confirmation code. Nothing is persisted to the database — you can preview as many times as you like without polluting the eventual dataset.

---

## Step 10: Activate Your Study

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
- Two presort demographic questions
- A condition of instruction
- 12 statements about remote work
- A 7-column forced-distribution grid (-3 to +3)
- Post-sort feedback for extreme placements

## Next Steps

Continue to **[Collecting Responses](collecting-responses.md)** to learn how to create recruitment links and share your study.
