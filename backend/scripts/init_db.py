import asyncio
from app.database import engine, Base

async def init_db():
    print("--- Initializing Database Schema ---")
    async with engine.begin() as conn:
        # Create all tables if they do not exist
        # This will NOT drop existing data
        await conn.run_sync(Base.metadata.create_all)
    print("--- Initialization Complete ---")

if __name__ == "__main__":
    asyncio.run(init_db())
