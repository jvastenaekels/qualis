import asyncio
from app.database import engine
from sqlalchemy import text


async def check_version():
    async with engine.connect() as conn:
        res = await conn.execute(text("SELECT version_num FROM alembic_version"))
        print(f"Alembic version: {res.scalar()}")


if __name__ == "__main__":
    asyncio.run(check_version())
