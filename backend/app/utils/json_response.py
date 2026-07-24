"""Fast JSON response class backed by orjson.

Starlette's default `JSONResponse` renders through the standard library's
`json.dumps`, which is pure Python. orjson is a Rust implementation and is
typically several times faster on the payloads that actually matter here — the
study full dump, the CSV/analysis export previews and the factor-analysis
result, all of which are large nested structures produced in one shot.

Two options are set deliberately, because dropping either would change
observable behaviour rather than just speed:

* ``OPT_NON_STR_KEYS`` — `jsonable_encoder` leaves integer dict keys as
  integers (``placements: dict[int, int]`` in ``app.types.wire``), and
  `json.dumps` silently stringifies them. Without this option orjson raises
  ``TypeError: Dict key must be str`` and the endpoint returns a 500.
* ``OPT_SERIALIZE_NUMPY`` — only reachable when a handler returns an
  ``ORJSONResponse`` directly, since a plain ``return`` goes through
  `jsonable_encoder` first, which rejects a raw ndarray before orjson ever sees
  it. Set so that the direct-return path works rather than failing on a type
  orjson handles natively.

Key ordering and separators already match: orjson preserves insertion order and
emits compact output, which is what `JSONResponse` asks `json.dumps` for.
"""

from typing import Any

import orjson
from starlette.responses import JSONResponse


class ORJSONResponse(JSONResponse):
    """Drop-in `JSONResponse` that renders with orjson."""

    media_type = "application/json"

    def render(self, content: Any) -> bytes:  # type: ignore[explicit-any]  # noqa: E501 — Starlette's render() takes arbitrary JSON-able content
        return orjson.dumps(
            content,
            option=orjson.OPT_NON_STR_KEYS | orjson.OPT_SERIALIZE_NUMPY,
        )
