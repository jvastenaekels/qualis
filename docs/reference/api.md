# API Reference

Open-Q uses **FastAPI** which auto-generates interactive API documentation.

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
  "presort_data": {
    "age": 25,
    "gender": "female"
  },
  "rough_data": {
    "agree": [1, 3, 5],
    "disagree": [2, 4],
    "neutral": [6, 7]
  },
  "qsort_data": [
    { "statement_id": 1, "column_score": 3, "row_position": 0 },
    { "statement_id": 2, "column_score": -2, "row_position": 1 }
  ],
  "postsort_data": {
    "card_comments": {
      "1": "This statement resonates because...",
      "2": "I disagree because..."
    },
    "missing_statement": "",
    "general_comment": "Overall feedback..."
  }
}
```

**Response:**

```json
{
  "success": true,
  "confirmation_code": "ABC123XYZ"
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

## 🏗️ Administrative API

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

- `POST /api/admin/studies/{slug}/invite`: Send a collaborator invitation via email (or log the URL if SMTP is not configured).

### Study Management

- `GET /api/admin/studies/`: List studies accessible to the current user.
- `POST /api/admin/studies/`: Create a new study (Draft state).
- `GET /api/admin/studies/{slug}`: Fetch full configuration (including internal IDs).
- `PATCH /api/admin/studies/{slug}`: Update configuration (structural changes allowed in Draft only).
- `POST /api/admin/studies/{slug}/state`: Publish or Close a study.
- `DELETE /api/admin/studies/{slug}`: Completely remove a study (Owner only).

### Collaborator Management

- `GET /api/admin/studies/{slug}/collaborators`: List researchers on a study.
- `POST /api/admin/studies/{slug}/collaborators`: Invite or update a collaborator's role.
- `DELETE /api/admin/studies/{slug}/collaborators/{email}`: Remove a collaborator.

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

Download a ZIP file formatted for R analysis (experimental).

## Rate Limiting

To ensure fair usage and system stability, the API implements rate limiting via `slowapi`.

| Endpoint                | Limit                | Requirement |
| ----------------------- | -------------------- | ----------- |
| `GET /api/study/{slug}` | 60 requests / minute | Public      |
| `POST /api/submit`      | 5 requests / minute  | Public      |
| `/api/admin/*`          | 30 requests / minute | Authorized  |
