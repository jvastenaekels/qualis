# Collecting Responses

In this tutorial, you will learn how to share your active study with participants, create and manage recruitment links, and monitor responses in real time from the researcher dashboard.

This tutorial continues from [Your First Study](your-first-study.md).

**What you will learn:**

- How to create different types of recruitment links (public, individual, limited)
- How to share links and QR codes with participants
- How to monitor live response data from the dashboard
- How to review individual participant submissions
- How to flag or discard problematic responses

**Time required:** ~15 minutes

**Prerequisites:** An active Qualis study (completed the [Your First Study](your-first-study.md) tutorial).

---

## Step 1: Navigate to the Recruitment Page

1. From the admin dashboard, make sure your project and study are selected.
2. In the left sidebar, click **Access** (this opens the `/recruitment` route).

The page shows the study URL, the access rules, and the recruitment-links table (with per-link started and submitted counts).

---

## Step 2: Create a Public Recruitment Link

A public link can be used by multiple participants.

1. Click the **New access link** button.
2. In the **Create access links** dialog, configure:
   - **Access strategy:** Open access (public)
   - **Channel / campaign name:** `Social Media Campaign`
3. Click **Provision links**.

A new row appears in the table with the campaign name, link type, token, and usage count.

---

## Step 3: Create Individual Recruitment Links

Individual links are single-use: each link can only be used for one submission.

1. Click **New access link** again.
2. Configure:
   - **Access strategy:** Single-use passcode
   - **Channel / campaign name:** `Interview Panel Batch 1`
   - **Batch size:** `10`
3. Click **Provision links**.

---

## Step 4: Create a Limited Capacity Link

1. Click **New access link**.
2. Configure:
   - **Access strategy:** Capped participation
   - **Channel / campaign name:** `Department A`
   - **Max submissions:** `25`
3. Click **Provision links**.

---

## Step 5: Share Your Study Links

Each recruitment link has a URL in the format:

```
https://your-instance.example.com/study/remote-work-attitudes?token=ABC123...
```

To share:
1. Find the link in the table and click the **Show QR code** icon in the **Manage** column.
2. The **Share via QR** dialog shows a QR code and the full URL. Click **Copy URL** to copy to clipboard.
3. Paste in an email, survey invitation, or social media post. Use the QR code for printed materials.

---

## Step 6: Walk One Link Yourself

Open the public link from Step 2 in a private window (so it does not pick up your admin session) and complete the study end-to-end as a participant would. You will go through Welcome → Consent → Presort → Fine Sort → Post-Sort → Submission, and land on a confirmation code.

This is the single best way to spot rough edges in instructions, statement wording, or grid sizing before recruiting real people. It also creates a row in the **Responses** table that you will use in the next steps.

---

## Step 7: Monitor Responses from the Study Overview

1. Click **Overview** in the left sidebar.

The page shows: the study status, three metric cards (**Number of participants (P-Set)**, **Completion rate**, **Median duration**), a recent-activity card, and a **Share study** module with the public study URL and a QR code. Per-link started and submitted counts are shown in the recruitment-links table on the Access page (from each link's start and usage counts).

---

## Step 8: Explore the Data Page

1. Click **Data** in the left sidebar.

The Data page provides:
- **Responses**: Searchable, sortable table with language, status, consent, flags, duration, and discard status, plus the **Export data** menu
- **Submissions timeline**: Submission trends over time
- **Device distribution**: Desktop vs. mobile vs. tablet distribution

---

## Step 9: Review Individual Participant Data

1. Click on a participant row in the Data page.
2. The detail view has four tabs:
   - **Metadata**: Session info, device, language, duration
   - **Pre-sort**: Demographic answers
   - **Q-sort grid**: Visual reconstruction of their placement
   - **Post-sort**: Explanations and additional answers, with playback controls if your study uses audio responses

---

## Step 10: Flag or Discard Problematic Responses

If you identify a response that should be excluded:

1. In the Data page, click the participant row to open the detail page.
2. In the metadata card, click the **Discard** button. A confirmation dialog opens.
3. Optionally enter a reason in the **Reason (optional)** field (e.g., "Completed in under 30 seconds — likely random"), then confirm.

Discarded participants are excluded from exports and analysis by default, but the data is preserved for audit. To restore, reopen the same participant's detail page and click the **Restore** button (the same button, now labelled **Restore**).

For the full set of state transitions a study goes through (Active → Paused → Closed → Archived), see [`../reference/admin-dashboard.md#general`](../reference/admin-dashboard.md#general). For now, leave your tutorial study Active.

> **Sharing access with team members.** To give a colleague access to monitor responses, invite them via the project **Team members** page (`/app/<projectSlug>/members`). An invitation offers two roles: `Viewer` (read-only) and `Member` (run analyses, manage recruitment). `Owner` (full access including member management) is not offered. See [Admin Dashboard — Members](../reference/admin-dashboard.md#members).

---

## What You Learned

You now know how to create public, individual, and limited recruitment links; share study URLs and QR codes; monitor live response rates; review individual submissions; flag problematic responses; and manage the study lifecycle.

## Next Steps

Once you have collected enough responses (typically 15-40+ for Q methodology), continue to **[Analyzing Results — Foundations](analyzing-results-foundations.md)**.
