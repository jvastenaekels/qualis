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

## Rate Limiting

To ensure fair usage and system stability, the API implements rate limiting via `slowapi`.

| Endpoint                | Limit                |
| ----------------------- | -------------------- |
| `GET /api/study/{slug}` | 60 requests / minute |
| `POST /api/submit`      | 5 requests / minute  |

**Response Headers:**
When a request is made, the following headers are included to inform the client about their current status:

- `X-RateLimit-Limit`: The number of requests allowed within the time window.
- `X-RateLimit-Remaining`: The number of requests remaining in the current window.
- `X-RateLimit-Reset`: The time at which the current window resets (in UTC epoch seconds).

---

## Error Responses

| Status | Description                             |
| ------ | --------------------------------------- |
| `404`  | Study not found                         |
| `422`  | Validation error (invalid data)         |
| `429`  | Too Many Requests (Rate limit exceeded) |
| `500`  | Internal server error                   |

---

## Authentication

Currently, Open-Q does not require authentication for public studies. Researcher authentication for data export is planned for future releases.
