# Running Qualis without S3 / object storage

Qualis is fully usable without object storage. When any of
`S3_ENDPOINT_URL`, `S3_BUCKET_NAME`, `S3_ACCESS_KEY_ID`, or
`S3_SECRET_ACCESS_KEY` is unset, Qualis runs in **storage-optional
mode**: the audio subsystem is unavailable and studies degrade
gracefully to text-only responses.

A startup log line confirms the mode and lists the consequences. For the
canonical list of storage-related environment variables, see
[`deployment.md`](deployment.md#required-environment-variables).

---

## Capability matrix

| Flow | Without object storage |
|---|---|
| All non-audio study flows (presort, sort, postsort text, exports, analysis) | ✅ Work unchanged. |
| Study design — enabling audio | ⚙️ Allowed, but the designer shows a notice that audio will not be collected. |
| Participant audio recording (feedback step) | 🚫 The recorder is not shown; the participant answers in text only. |
| `text_audio` questions | ⚙️ Degrade to a plain text input; the question is satisfiable by text alone. |
| Existing audio recordings (if storage was later removed) | 🚫 Cannot be played back or downloaded until storage is restored. |

Legend: ✅ works unchanged · ⚙️ works with reduced capability · 🚫 disabled.

---

## What participants see

Nothing. Degradation is intentionally silent: an audio-enabled study
simply does not render the recorder, and `text_audio` questions show
their text field only. No error, no broken upload loop. A required
`text_audio` question remains satisfiable because its text input is
always present.

This means **no audio data is collected** for a study run in this mode,
even if the study has audio enabled. The designer notice and the startup
banner exist so the operator is never surprised by this.

## What the operator sees

- A startup log line: *"Object storage (S3) is not configured — Qualis
  runs in STORAGE-OPTIONAL mode"* followed by the consequences and the
  exact environment variables to set.
- In the study designer, under the audio toggle: a notice that audio
  responses will not be collected on this server.

## Safety net

If the audio API is somehow reached while storage is unconfigured (for
example a stale client), every audio endpoint returns a clean
`503 audio_storage_unavailable` rather than a server error.

---

## Enabling audio later

Set `S3_ENDPOINT_URL`, `S3_BUCKET_NAME`, `S3_ACCESS_KEY_ID`, and
`S3_SECRET_ACCESS_KEY` and restart. The startup banner disappears, the
designer notice clears, and the participant audio recorder reappears for
audio-enabled studies. No data migration is required.
