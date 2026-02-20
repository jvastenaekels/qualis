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

**Prerequisites:** An active Libre-Q study (completed the [Your First Study](your-first-study.md) tutorial).

---

## Step 1: Navigate to the Recruitment Page

1. From the admin dashboard, make sure your workspace and study are selected.
2. In the left sidebar, click **Recruitment**.

You will see summary cards at the top: **Total Links**, **Started**, and **Submitted**.

---

## Step 2: Create a Public Recruitment Link

A public link can be used by multiple participants.

1. Click the **New Access Link** button.
2. Configure:
   - **Link Type:** Public (Multiple usage)
   - **Campaign Name:** `Social Media Campaign`
3. Click **Generate Links**.

A new row appears in the table with the campaign name, link type, token, and usage count.

---

## Step 3: Create Individual Recruitment Links

Individual links are single-use: each link can only be used for one submission.

1. Click **New Access Link** again.
2. Configure:
   - **Link Type:** Individual (Single usage)
   - **Campaign Name:** `Interview Panel Batch 1`
   - **Number of links to generate:** `10`
3. Click **Generate Links**.

---

## Step 4: Create a Limited Capacity Link

1. Click **New Access Link**.
2. Configure:
   - **Link Type:** Limited (Set capacity)
   - **Campaign Name:** `Department A`
   - **Participant Capacity:** `25`
3. Click **Generate Links**.

---

## Step 5: Share Your Study Links

Each recruitment link has a URL in the format:

```
https://your-instance.example.com/study/remote-work-attitudes?token=ABC123...
```

To share:
1. Find the link in the table and click the **QR Code** icon in the Actions column.
2. A dialog shows a QR code and the full URL. Click **Copy Link** to copy to clipboard.
3. Paste in an email, survey invitation, or social media post. Use the QR code for printed materials.

---

## Step 6: Understand the Participant Experience

When a participant opens your link, they experience:

1. **Welcome Page** -- Study title, description, and instructions
2. **Consent Page** -- Read and accept the consent form
3. **Presort Questionnaire** -- Answer demographic questions
4. **Rough Sort** -- Swipe/click to categorize statements into Agree / Neutral / Disagree
5. **Fine Sort** -- Drag statements into the forced-distribution grid
6. **Post-Sort** -- Explain extreme placements and answer follow-up questions
7. **Submission** -- Confirmation code is displayed

---

## Step 7: Monitor Responses from the Study Overview

1. Click **Overview** in the left sidebar.

The page shows: study status, participant statistics, completion rate, and recent submissions.

---

## Step 8: Explore the Data Page

1. Click **Data** in the left sidebar.

The Data page provides:
- **Participant Table**: Searchable, sortable table with status, duration, device type, test run flag, and discard status
- **Timeline Chart**: Submission trends over time
- **Device Breakdown**: Desktop vs. mobile vs. tablet distribution

---

## Step 9: Review Individual Participant Data

1. Click on a participant row in the Data page.
2. The detail view shows:
   - **Metadata**: Session info, device, language, duration
   - **Presort Responses**: Demographic answers
   - **Q-Sort Grid**: Visual reconstruction of their placement
   - **Post-Sort Responses**: Explanations and additional answers
   - **Audio Recordings**: Playback controls (if your study uses audio responses)

---

## Step 10: Flag or Discard Problematic Responses

If you identify a response that should be excluded:
1. Use the discard option on the participant row.
2. Enter a reason (e.g., "Completed in under 30 seconds -- likely random").

Discarded participants are excluded from exports and analysis by default, but the data is preserved.

---

## Step 11: Manage Your Study State

From the Study Overview, control the lifecycle:
- **Pause**: Temporarily stop accepting new participants.
- **Close**: End data collection permanently.
- **Draft**: Return to draft mode for configuration changes (structural changes locked once real data exists).

---

## What You Learned

You now know how to create public, individual, and limited recruitment links; share study URLs and QR codes; monitor live response rates; review individual submissions; flag problematic responses; and manage the study lifecycle.

## Next Steps

Once you have collected enough responses (typically 15-40+ for Q methodology), continue to **[Analyzing Results](analyzing-results.md)**.
