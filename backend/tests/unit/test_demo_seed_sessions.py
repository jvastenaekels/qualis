"""Regression tests for demo seed authentication reuse."""

import json
from unittest.mock import AsyncMock, MagicMock

import pytest

import seed_demo
import seed_lipset
from app.utils.script_utils import APIClient, sync_study_from_file


@pytest.mark.asyncio
async def test_sync_study_borrows_authenticated_client(tmp_path) -> None:
    """A multi-step seed must not log in or close its borrowed API client."""
    fixture = tmp_path / "study.json"
    fixture.write_text(json.dumps({"slug": "borrowed-client"}), encoding="utf-8")

    api = MagicMock(spec=APIClient)
    api.login = AsyncMock()
    api.close = AsyncMock()
    api.get_study = AsyncMock(return_value=None)
    api.create_study = AsyncMock()
    api.transform_study_data.side_effect = lambda data: data

    await sync_study_from_file(str(fixture), api=api)

    api.login.assert_not_awaited()
    api.close.assert_not_awaited()
    api.create_study.assert_awaited_once_with({"slug": "borrowed-client"})


@pytest.mark.asyncio
async def test_sync_study_owns_default_client(tmp_path, monkeypatch) -> None:
    """The generic seed path still logs in and closes its internally owned client."""
    fixture = tmp_path / "study.json"
    fixture.write_text(json.dumps({"slug": "owned-client"}), encoding="utf-8")

    api = MagicMock(spec=APIClient)
    api.login = AsyncMock()
    api.close = AsyncMock()
    api.get_study = AsyncMock(return_value=None)
    api.create_study = AsyncMock()
    api.transform_study_data.side_effect = lambda data: data
    monkeypatch.setattr("app.utils.script_utils.APIClient", MagicMock(return_value=api))

    await sync_study_from_file(str(fixture))

    api.login.assert_awaited_once_with()
    api.close.assert_awaited_once_with()
    api.create_study.assert_awaited_once_with({"slug": "owned-client"})


@pytest.mark.asyncio
async def test_bioeconomy_seed_uses_one_authenticated_client(monkeypatch) -> None:
    api = MagicMock(spec=APIClient)
    api.login = AsyncMock()
    api.close = AsyncMock()
    sync = AsyncMock()
    seed_concourse = AsyncMock()
    submit_sorts = AsyncMock()

    monkeypatch.setattr(seed_demo, "APIClient", MagicMock(return_value=api))
    monkeypatch.setattr(seed_demo, "sync_study_from_file", sync)
    monkeypatch.setattr(seed_demo, "seed_concourse", seed_concourse)
    monkeypatch.setattr(seed_demo, "submit_sorts", submit_sorts)

    await seed_demo.main()

    api.login.assert_awaited_once_with()
    api.close.assert_awaited_once_with()
    assert sync.await_args.kwargs["api"] is api
    seed_concourse.assert_awaited_once_with(api)
    submit_sorts.assert_awaited_once_with(api)


@pytest.mark.asyncio
async def test_lipset_seed_uses_one_authenticated_client(monkeypatch) -> None:
    api = MagicMock(spec=APIClient)
    api.login = AsyncMock()
    api.close = AsyncMock()
    sync = AsyncMock()
    submit_sorts = AsyncMock()

    monkeypatch.setattr(seed_lipset, "APIClient", MagicMock(return_value=api))
    monkeypatch.setattr(seed_lipset, "sync_study_from_file", sync)
    monkeypatch.setattr(seed_lipset, "submit_sorts", submit_sorts)

    await seed_lipset.main()

    api.login.assert_awaited_once_with()
    api.close.assert_awaited_once_with()
    assert sync.await_args.kwargs["api"] is api
    submit_sorts.assert_awaited_once_with(api)
