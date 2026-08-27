import asyncio
from app.database import engine
from sqlalchemy import text


async def check_tables():
    async with engine.connect() as conn:
        res = await conn.execute(
            text(
                "SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname = 'public'"
            )
        )
        tables = [r[0] for r in res]
        print(f"Tables in public: {tables}")


if __name__ == "__main__":
    asyncio.run(check_tables())
