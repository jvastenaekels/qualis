# Qualis - Open-source platform for conducting Q-methodology research
# Copyright (C) 2025 Julien Vastenekels
# Licensed under the GNU Affero General Public License v3.0 or later.

"""Delete consumed_email_tokens older than 7 days. Safe to run as a cron."""

import asyncio
from datetime import timedelta

from app.database import SessionLocal
from app.services.email_token_consume_service import cleanup_consumed


async def main() -> None:
    async with SessionLocal() as db:
        deleted = await cleanup_consumed(db, older_than=timedelta(days=7))
        await db.commit()
        print(f"deleted={deleted}")


if __name__ == "__main__":
    asyncio.run(main())
