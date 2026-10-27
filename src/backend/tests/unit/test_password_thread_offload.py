"""bcrypt must run in a worker thread so one password check cannot stall the event loop."""

import asyncio

from app.utils.security import (
    get_password_hash,
    get_password_hash_async,
    verify_password_async,
)


async def test_verify_password_async_does_not_block_loop() -> None:
    hashed = get_password_hash("x")
    ticks = 0

    async def ticker() -> None:
        nonlocal ticks
        while True:
            await asyncio.sleep(0.01)
            ticks += 1

    task = asyncio.create_task(ticker())
    try:
        assert await verify_password_async("x", hashed) is True
    finally:
        task.cancel()
    # bcrypt cost 12 takes ~300 ms; a blocked loop would tick 0-1 times.
    assert ticks >= 5


async def test_get_password_hash_async_roundtrip() -> None:
    hashed = await get_password_hash_async("pw")
    assert await verify_password_async("pw", hashed) is True
    assert await verify_password_async("other", hashed) is False
