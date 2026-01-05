# Database Migration: Add created_at Column to Participants Table

## Problem

The `participants.created_at` column was added to the SQLAlchemy model but not to the database schema, causing the following error:

```
column participants.created_at does not exist
```

## Solution

Run the migration script to add the missing column to your database.

## Instructions

### For Production/Staging (PostgreSQL)

1. Make sure you have access to your production database
2. Set the `DATABASE_URL` environment variable if not already set
3. Run the migration script:

```bash
cd backend
uv run python migrate_add_participant_created_at.py
```

### For Local Development (SQLite)

1. First, initialize your database if not already done:

```bash
cd backend
uv run python init_db.py
```

2. If you have an existing database that needs the column, run:

```bash
uv run python migrate_add_participant_created_at.py
```

## What the Migration Does

The script:
- Checks if the `created_at` column already exists
- If not, adds it with a default value of `CURRENT_TIMESTAMP`
- Works for both PostgreSQL and SQLite databases

## Verification

After running the migration, your application should work without the error. The `created_at` column will automatically capture the timestamp when each participant record is created.
