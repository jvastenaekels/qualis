# S3 Setup for Audio Recordings

This guide explains how to configure S3-compatible object storage for Qualis's audio recording feature. Audio recordings allow participants to provide spoken responses during the post-sort phase.

---

## Overview

When S3 is configured, Qualis enables audio response fields in post-sort questionnaires. Participants can record voice responses directly in their browser, and the audio files are uploaded to S3. Only metadata (bucket, key, duration, MIME type) is stored in the database.

If S3 is not configured, audio recording features are disabled and text-only responses are used.

---

## Prerequisites

- An AWS account (or S3-compatible provider like MinIO, Backblaze B2, Cloudflare R2)
- An S3 bucket created for audio storage
- IAM credentials with read/write access to the bucket

---

## Step 1: Create an S3 Bucket

```bash
aws s3 mb s3://qualis-audio --region eu-west-1
```

### Recommended Bucket Settings

- **Block all public access**: Enabled (audio is served via presigned URLs)
- **Versioning**: Optional but recommended for data integrity
- **Encryption**: Enable server-side encryption (SSE-S3 or SSE-KMS)

---

## Step 2: Create IAM Credentials

Create an IAM user or role with the following policy:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject",
        "s3:DeleteObject",
        "s3:ListBucket"
      ],
      "Resource": [
        "arn:aws:s3:::qualis-audio",
        "arn:aws:s3:::qualis-audio/*"
      ]
    }
  ]
}
```

---

## Step 3: Configure Environment Variables

Set the following environment variables in your deployment:

```bash
S3_ENDPOINT_URL=https://s3.eu-west-1.amazonaws.com
S3_BUCKET_NAME=qualis-audio
S3_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE
S3_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
S3_REGION=eu-west-1
```

`S3_ENDPOINT_URL` is required for **every** provider, including AWS S3 (use the regional endpoint, e.g. `https://s3.eu-west-1.amazonaws.com`). The audio feature stays disabled if it is unset. `S3_REGION` is optional and defaults to `us-east-1`; it is not part of the enablement gate.

For Scalingo:

```bash
scalingo --app qualis env-set S3_ENDPOINT_URL=https://s3.eu-west-1.amazonaws.com
scalingo --app qualis env-set S3_BUCKET_NAME=qualis-audio
scalingo --app qualis env-set S3_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE
scalingo --app qualis env-set S3_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
scalingo --app qualis env-set S3_REGION=eu-west-1
```

---

## Step 4: Verify Configuration

After setting the environment variables and restarting the application:

1. Create or edit a study in Draft mode.
2. Go to the **Post-sort** tab in the study designer.
3. Audio response options should now be available for post-sort questions.
4. Run a test submission and verify audio uploads succeed.

---

## How Audio Storage Works

1. **Upload**: When a participant records audio, the browser captures it as WebM/Opus. The frontend uploads the audio blob to `POST /api/audio/upload`, identifying the participant via a `session_token` form field (no participant ID in the path).
2. **Storage**: The backend generates a unique S3 key, uploads the file, and stores metadata in the `audio_recordings` table.
3. **Playback**: When a researcher views a participant's detail page, the backend generates presigned URLs at `GET /api/audio/{recording_id}/url` that expire after a fixed 1 hour.
4. **Export**: Audio recordings can be downloaded as a ZIP from the participant detail view.

---

## S3-Compatible Providers

Qualis uses the standard AWS S3 SDK (boto3). Any S3-compatible provider should work:

| Provider | Notes |
|----------|-------|
| **AWS S3** | Native support |
| **MinIO** | Set `S3_ENDPOINT_URL` to your MinIO server URL |
| **Backblaze B2** | Use S3-compatible API endpoint |
| **Cloudflare R2** | Use S3-compatible API endpoint |

`S3_ENDPOINT_URL` is mandatory for every provider — set it to the provider's S3-compatible endpoint (for AWS S3, use the regional endpoint, e.g. `https://s3.eu-west-1.amazonaws.com`).

### Split internal / public endpoint (`S3_PUBLIC_ENDPOINT_URL`)

When the object-storage host the **backend** reaches differs from the
host the **participant's browser** must reach for playback, set the
optional `S3_PUBLIC_ENDPOINT_URL`. Presigned playback URLs are then
minted against it while server-side uploads keep using
`S3_ENDPOINT_URL`. Presigning is an offline SigV4 operation, so the
backend never has to reach the public host itself.

The canonical case is the bundled `docker-compose.yml`, which runs a
local MinIO so the demo has working audio out of the box:

| Variable | Value | Used by |
|----------|-------|---------|
| `S3_ENDPOINT_URL` | `http://minio:9000` | backend upload (internal Docker network) |
| `S3_PUBLIC_ENDPOINT_URL` | `http://localhost:9000` | browser playback (host-published port) |

Leave `S3_PUBLIC_ENDPOINT_URL` unset for normal single-endpoint
deployments (AWS, Cellar, R2) — presigning then reuses the one client.
The bucket itself is created and configured automatically by the
`bucket-init` service via `scripts/create_bucket.py`.

---

## Upload Reliability

The backend implements automatic retry logic for S3 uploads to handle transient network issues:

- **Retried errors**: `RequestTimeout`, `ServiceUnavailable`, `InternalError`, `SlowDown`
- **Retry strategy**: Exponential backoff with delays of 1s then 2s, up to 3 total attempts (the third/final attempt is not followed by a delay).
- **Non-retried errors**: Permission errors (403), invalid bucket (404), and other client errors fail immediately.

### Audio Validation

Before uploading, each audio file is validated in three steps:

1. **File size check**: Rejects files exceeding `AUDIO_MAX_FILE_SIZE_MB` (default: 10 MB).
2. **MIME type verification**: Validates the file's magic bytes (not just the extension) to prevent uploading disguised files.
3. **Storage quota check**: Each study has a configurable storage quota (default: 100 MB, set via `postsort_config.audio.max_storage_mb`). If the quota is exceeded, the upload returns HTTP 507 (Insufficient Storage).

---

## Troubleshooting

### Audio upload fails with 403

Check that your IAM credentials have `s3:PutObject` permission on the bucket and that the bucket name and region are correct.

### Audio playback shows "URL expired"

Presigned URLs have an expiration time. Refresh the page to generate new URLs.

### Audio recording not available in study designer

Verify that all four gating S3 environment variables (`S3_ENDPOINT_URL`, `S3_BUCKET_NAME`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`) are set. `S3_REGION` is a fifth, optional variable (default `us-east-1`) that does not gate the feature. The audio feature is enabled only when all four of `S3_ENDPOINT_URL`, `S3_BUCKET_NAME`, `S3_ACCESS_KEY_ID`, and `S3_SECRET_ACCESS_KEY` are set.
