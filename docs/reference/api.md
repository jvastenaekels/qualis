# API Reference

Libre-Q uses **FastAPI** which auto-generates interactive API documentation.

---

## Interactive Documentation

When the backend is running, visit these endpoints:

| Endpoint | Description                           |
| -------- | ------------------------------------- |
| `/docs`  | Swagger UI — interactive API explorer |
| `/redoc` | ReDoc — alternative API documentation |

```bash
# Start the backend
cd backend
uvicorn app.main:app --reload

# Then visit:
# http://localhost:8000/docs
# http://localhost:8000/redoc
```

---

## Key Endpoints

### Study Configuration

#### `GET /api/study/{slug}`

Fetch study configuration including statements and grid layout.

**Response:**

```json
{
  "slug": "example-study",
  "title": "Example Study",
  "description": "Study description...",
  "instructions": "Instructions for participants...",
  "statements": [
    { "id": 1, "text": "Statement text..." },
    { "id": 2, "text": "Another statement..." }
  ],
  "grid_config": [
    { "score": -3, "capacity": 2 },
    { "score": -2, "capacity": 3 },
    ...
  ],
  "presort_config": { ... },
  "postsort_config": { ... }
}
```

---

### Submission

#### `POST /api/submit`

Submit participant data after completing the study.

**Request Body:**

```json
{
  "study_slug": "example-study",
  "session_token": "123e4567-e89b-12d3-a456-426614174000",
  "language_used": "en",
  "presort_answers": {
    "age": 25,
    "gender": "female"
  },
  "qsort": [
    { "statement_id": 1, "grid_score": 3, "card_comment": "Resonates strongly" },
    { "statement_id": 2, "grid_score": -2, "card_comment": null }
  ],
  "postsort_answers": {
    "missing_statement": "",
    "general_comment": "Overall feedback..."
  }
}
```

**Response:**

```json
{
  "status": "success",
  "confirmation_code": "ABC123XYZ",
  "id": 42
}
```

---

### Password Unlock

#### `POST /api/study/{slug}/unlock`

Validate a study's access password. Returns unlock status if correct, 403 if incorrect.

**Query Parameter:** `password` (required)

**Response:**

```json
{
  "status": "unlocked"
}
```

---

## Authentication

Administrative endpoints require a **JSON Web Token (JWT)**.

### 1. Obtain a Token

#### `POST /api/token`

Authenticate with email and password to receive an access token.

**Request:** `application/x-www-form-urlencoded`

- `username`: User email
- `password`: User password
- `x-totp-token` (Header, optional): 6-digit TOTP token if 2FA is enabled

**Response (2FA Not Enabled):**

```json
{
  "access_token": "eyJhbG...",
  "token_type": "bearer"
}
```

**Response (2FA Required):**

If the account has 2FA enabled and no TOTP token was provided:

```json
{
  "requires_2fa": true
}
```

On the second attempt, include the `X-TOTP-Token` header with a valid 6-digit code:

```bash
curl -X POST "http://localhost:8000/api/token" \
  -H "X-TOTP-Token: 123456" \
  -d "username=user@example.com&password=secret"
```

### 2. Use the Token

### Authentication & Headers

Administrative endpoints require two layers of identification:

1.  **JWT Token**: Provided in the `Authorization: Bearer <token>` header.
2.  **Workspace ID**: Provided in the `X-Workspace-ID` header. This is mandatory for all requests targeting studies, recruitment, or exports.

---

## Administrative API

The Administrative API allows researchers to manage studies, users, and data.

### Two-Factor Authentication (2FA)

- `GET /api/me/2fa/setup`: Generate a new TOTP secret and provisioning URI (QR code).
- `POST /api/me/2fa/enable`: Enable 2FA by verifying a TOTP token.
- `POST /api/me/2fa/disable`: Disable 2FA (requires password confirmation).

### Recruitment

- `GET /api/admin/recruitment/{slug}/links`: List all recruitment links for a study.
- `POST /api/admin/recruitment/{slug}/links`: Create new access links (public, individual, or limited).
- `DELETE /api/admin/recruitment/links/{link_id}`: Revoke a recruitment link.

### Invitations

- `POST /api/admin/workspaces/{slug}/invitations`: Send a workspace invitation via email (or log the URL if SMTP is not configured).
- `GET /api/admin/invitations/{token}`: Accept an invitation by token.

### Study Management

- `GET /api/admin/studies/`: List studies accessible to the current user.
- `POST /api/admin/studies/`: Create a new study (Draft state).
- `GET /api/admin/studies/{slug}`: Fetch full configuration (including internal IDs).
- `PATCH /api/admin/studies/{slug}`: Update configuration (structural changes allowed in Draft only).
- `POST /api/admin/studies/{slug}/state`: Publish or Close a study.
- `DELETE /api/admin/studies/{slug}`: Completely remove a study (Owner only).

### Workspace Management

- `GET /api/admin/workspaces/`: List workspaces accessible to the current user.
- `POST /api/admin/workspaces/`: Create a new workspace.
- `GET /api/admin/workspaces/{slug}`: Get workspace details.
- `PATCH /api/admin/workspaces/{slug}`: Update workspace settings.
- `GET /api/admin/workspaces/{slug}/members`: List workspace members.
- `PATCH /api/admin/workspaces/{slug}/members/{user_id}`: Update a member's role.
- `DELETE /api/admin/workspaces/{slug}/members/{user_id}`: Remove a member.

### User Management (Superuser Only)

- `GET /api/admin/users/`: List all system users.
- `POST /api/admin/users/`: Create a new user account.
- `DELETE /api/admin/users/{id}`: Remove a user (prevents self-deletion).

---

### Data Exports

#### `GET /api/admin/studies/{slug}/dump`

Download the full study data as a JSON object (Study config + All participants).

#### `GET /api/admin/studies/{slug}/export/csv`

Download results as a wide-format CSV file.

#### `GET /api/admin/studies/{slug}/export/pqmethod`

Download a ZIP file containing `.dat` and `.sta` files for PQMethod.

#### `GET /api/admin/studies/{slug}/export/rkit`

Download a ZIP file formatted for R analysis.

---

### Analysis

#### `GET /api/admin/studies/{slug}/analysis/eigenvalues`

Compute and return eigenvalues for a study's Q-sort data. Used to display the scree plot and determine the suggested number of factors.

#### `POST /api/admin/studies/{slug}/analysis/run`

Run a full factor analysis with the specified parameters. Request body includes extraction method (PCA or centroid), number of factors, rotation method (varimax or none), and flagging mode (auto or manual).

Returns factor loadings, factor arrays, statement z-scores, distinguishing/consensus classifications, and factor characteristics.

---

### Audio Recordings

#### `POST /api/audio/upload`

Upload an audio recording for a participant. Requires S3 to be configured. Returns the recording ID and metadata.

#### `GET /api/audio/{recording_id}/url`

Get a presigned URL for playing back an audio recording. URLs expire after a configured duration.

#### `DELETE /api/audio/{recording_id}`

Delete an audio recording from S3 and remove its metadata from the database.

---

## Rate Limiting

To ensure fair usage and system stability, the API implements rate limiting via `slowapi`.

| Endpoint                | Limit                | Requirement |
| ----------------------- | -------------------- | ----------- |
| `GET /api/study/{slug}`          | 120 requests / minute | Public     |
| `POST /api/submit`               | 60 requests / minute  | Public     |
| `POST /api/study/{slug}/unlock`  | 10 requests / minute  | Public     |
| `/api/admin/*`                   | 30 requests / minute  | Authorized |

---

## Error Response Format

All API errors follow a standardized JSON schema:

```json
{
  "code": 422,
  "message": "Validation Error",
  "details": [
    {
      "loc": ["body", "qsort", 0, "grid_score"],
      "msg": "field required",
      "type": "value_error.missing"
    }
  ]
}
```

| Field     | Type             | Description                                          |
| :-------- | :--------------- | :--------------------------------------------------- |
| `code`    | `integer`        | HTTP status code                                     |
| `message` | `string`         | Human-readable error description                     |
| `details` | `array \| null`  | Validation details (Pydantic errors) or conflict info |

Common error codes:

| Code | Meaning                                                    |
| :--- | :--------------------------------------------------------- |
| 400  | Bad request (malformed input)                              |
| 401  | Authentication required or invalid token                   |
| 403  | Insufficient permissions or incorrect password             |
| 404  | Resource not found                                         |
| 409  | Conflict (e.g., duplicate slug, concurrent edit detected)  |
| 422  | Validation error (missing or invalid fields)               |
| 429  | Rate limit exceeded                                        |
| 507  | Insufficient storage (audio quota exceeded)                |

---

## Security Headers

The API includes security headers on all responses:

| Header                    | Value                                                   |
| :------------------------ | :------------------------------------------------------ |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains`                 |
| `Content-Security-Policy` | Restricts sources; includes S3 endpoint for audio       |
| `X-Frame-Options`        | `DENY`                                                   |
| `X-Content-Type-Options`  | `nosniff`                                               |
| `Permissions-Policy`      | Restricts camera; enables microphone (self)             |
