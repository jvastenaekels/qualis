import asyncio
from app.database import engine
from sqlalchemy import text


async def check_cols():
    async with engine.connect() as conn:
        res = await conn.execute(
            text(
                "SELECT column_name FROM information_schema.columns WHERE table_name = 'studies'"
            )
        )
        cols = [r[0] for r in res]
        print(f"Columns in studies: {cols}")


if __name__ == "__main__":
    asyncio.run(check_cols())
