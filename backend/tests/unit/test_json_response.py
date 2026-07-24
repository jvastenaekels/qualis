"""Unit tests for the orjson-backed default response class.

These guard the two ways swapping the serialiser could change what goes over
the wire, both of which are silent failures rather than obvious ones: an
integer dict key raising instead of being stringified, and non-ASCII text being
escaped instead of emitted as UTF-8.
"""

import json

import numpy as np
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.main import app as real_app
from app.utils.json_response import ORJSONResponse


def _client() -> TestClient:
    app = FastAPI(default_response_class=ORJSONResponse)

    @app.get("/payload")
    def payload() -> dict[str, object]:
        # dict[int, int] mirrors `placements` in app.types.wire, which reaches
        # the encoder with its integer keys intact.
        return {"placements": {1: 3, 2: -1}, "label": "Enoncé éàü", "empty": None}

    @app.get("/direct")
    def direct() -> ORJSONResponse:
        return ORJSONResponse({"z": np.array([1.5, 2.5])})

    return TestClient(app)


def test_integer_dict_keys_are_stringified_like_json_dumps() -> None:
    """orjson rejects non-str keys unless OPT_NON_STR_KEYS is set."""
    response = _client().get("/payload")

    assert response.status_code == 200
    assert response.json()["placements"] == {"1": 3, "2": -1}


def test_non_ascii_is_emitted_as_utf8_not_escaped() -> None:
    """Starlette's JSONResponse uses ensure_ascii=False; orjson must match."""
    response = _client().get("/payload")

    assert "Enoncé éàü" in response.text
    assert "\\u00e9" not in response.text


def test_output_is_byte_identical_to_the_stdlib_encoder() -> None:
    """The swap is a speed change, not a format change."""
    body = _client().get("/payload").content
    expected = json.dumps(
        {"placements": {1: 3, 2: -1}, "label": "Enoncé éàü", "empty": None},
        separators=(",", ":"),
        ensure_ascii=False,
    ).encode()

    assert body == expected


def test_numpy_arrays_serialise_on_the_direct_return_path() -> None:
    """A handler returning ORJSONResponse bypasses jsonable_encoder."""
    response = _client().get("/direct")

    assert response.status_code == 200
    assert response.json() == {"z": [1.5, 2.5]}


def test_app_is_wired_to_the_orjson_response_class() -> None:
    """Guards against the default_response_class being dropped in a refactor."""
    assert real_app.router.default_response_class is ORJSONResponse
