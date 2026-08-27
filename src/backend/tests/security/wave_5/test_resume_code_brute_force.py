# Qualis - Open-source platform for conducting Q-methodology research
# Copyright (C) 2025 Julien Vastenekels
# Licensed under the GNU Affero General Public License v3.0 or later.

"""F-06-001 — Resume-code per-code rate-limit lockout.

Pre-fix attack model
--------------------

``GET /api/study/{slug}/resume/{code}`` carried only a per-IP rate limit
of 30/minute. Resume codes are ``adjective-noun-NNN`` triples drawn
from ~100 adjectives × ~100 nouns × 900 numeric suffixes = ~9M
combinations per locale. A distributed brute-forcer paying out across
many source IPs is unbounded by a per-IP limiter alone — the per-IP
cap only forces the attacker to use more sources, not to slow down
attempts against a single code.

Post-fix invariant
------------------

A second slowapi limit is applied keyed by ``sha256(slug|code)``:
``10/hour`` per code regardless of source IP. Combined with the
~9M-entropy code space, the cost of guessing a single specific
participant's code becomes roughly 9M / 10 / hour ≈ 100 years of
sustained attempts — well below the threshold of practical concern.

Tests pin three properties:

1. **Per-code key function isolates one code from another.** Hashing
   ``slug|code`` produces distinct keys per (slug, code) tuple; a
   different code in the same study or the same code in a different
   study yields a different key.
2. **Decorator is applied.** Static check that the ``resume_session``
   route handler carries the second ``@limiter.limit(...,
   key_func=resume_code_key_func_sync)`` decorator. We can't easily
   exercise the runtime limiter inside the test process (the test
   harness disables slowapi to keep response-time tests
   deterministic), so the static gate is the canonical regression
   anchor.
3. **Fallback to per-IP keying** when path params are absent (defence
   in depth — slowapi shouldn't reach the key_func without a path
   match, but the fallback prevents key_func crashes at the framework
   boundary).
"""

from __future__ import annotations

from unittest.mock import MagicMock

from app.limiter import _get_real_ip, resume_code_key_func_sync


class TestResumeCodeKeyFunc:
    """The per-code key function isolates rate-limit scope by (slug, code)."""

    def _make_request(
        self, slug: str | None, code: str | None, peer_ip: str = "1.2.3.4"
    ) -> MagicMock:
        """Build a stand-in for starlette.Request with the path params we need."""
        req = MagicMock()
        req.client.host = peer_ip
        req.headers = {}
        req.path_params = {}
        if slug is not None:
            req.path_params["slug"] = slug
        if code is not None:
            req.path_params["code"] = code
        return req

    def test_distinct_codes_yield_distinct_keys(self) -> None:
        """Two different codes within the same study must produce different
        rate-limit keys; otherwise the per-code cap is shared across all
        codes in the same study (defeats the lockout)."""
        req_a = self._make_request(slug="study-1", code="brave-tiger-427")
        req_b = self._make_request(slug="study-1", code="wise-owl-123")
        assert resume_code_key_func_sync(req_a) != resume_code_key_func_sync(req_b)

    def test_same_code_in_different_studies_yields_distinct_keys(self) -> None:
        """The slug enters the hash so the unlikely-but-possible case of two
        studies sharing a code gets independent limit budgets."""
        req_a = self._make_request(slug="study-1", code="brave-tiger-427")
        req_b = self._make_request(slug="study-2", code="brave-tiger-427")
        assert resume_code_key_func_sync(req_a) != resume_code_key_func_sync(req_b)

    def test_key_independent_of_source_ip(self) -> None:
        """Two different IPs hitting the same (slug, code) must hash to the
        same key — this is the whole point: aggregate attempts across IPs
        so a distributed brute-force is bounded by the per-code cap."""
        req_a = self._make_request(
            slug="study-1", code="brave-tiger-427", peer_ip="1.1.1.1"
        )
        req_b = self._make_request(
            slug="study-1", code="brave-tiger-427", peer_ip="2.2.2.2"
        )
        assert resume_code_key_func_sync(req_a) == resume_code_key_func_sync(req_b)

    def test_case_normalised(self) -> None:
        """Path codes lowercase server-side at the handler entry; the
        key_func mirrors that normalisation so a mixed-case attempt and a
        lowercase attempt count against the same budget."""
        req_a = self._make_request(slug="study-1", code="BRAVE-TIGER-427")
        req_b = self._make_request(slug="study-1", code="brave-tiger-427")
        assert resume_code_key_func_sync(req_a) == resume_code_key_func_sync(req_b)

    def test_fallback_to_ip_when_code_missing(self) -> None:
        """When path_params lacks a ``code`` key (framework wiring edge case),
        the key_func degrades to per-IP keying instead of crashing."""
        req = self._make_request(slug="study-1", code=None, peer_ip="9.9.9.9")
        key = resume_code_key_func_sync(req)
        # Should equal the per-IP key, not a "resume:" prefix.
        assert key == _get_real_ip(req)
        assert not key.startswith("resume:")

    def test_resume_keys_are_namespaced(self) -> None:
        """The returned key is prefixed with ``resume:`` so it cannot collide
        with email- or IP-keyed buckets even on shared limiter storage."""
        req = self._make_request(slug="study-1", code="brave-tiger-427")
        key = resume_code_key_func_sync(req)
        assert key.startswith("resume:")


class TestResumeSessionDecorator:
    """The route handler must carry the per-code decorator."""

    def test_decorator_applied(self) -> None:
        """Static guard: the per-code key_func is wired onto the
        resume_session handler. Without this assertion a future refactor
        could remove the second ``@limiter.limit`` decorator and silently
        re-open the brute-force surface."""
        import inspect

        from app.routers.participants import resume_session

        source = inspect.getsource(resume_session)
        # The decorator is attached to the closure in the wrapped function;
        # inspect.getsource on the inner function returns the def + body.
        # We assert against the module source to catch the decorator chain.
        from app.routers import participants as participants_module

        module_source = inspect.getsource(participants_module)
        # Find the resume_session block and assert it has the per-code limit.
        idx = module_source.find("async def resume_session")
        assert idx != -1, "resume_session handler not found"
        # Look at the ~400 chars preceding the def for decorators.
        decorators_blob = module_source[max(0, idx - 400) : idx]
        assert "key_func=resume_code_key_func_sync" in decorators_blob, (
            "resume_session must carry an additional @limiter.limit with "
            "key_func=resume_code_key_func_sync to enforce per-code lockout. "
            f"Decorators preceding the def:\n{decorators_blob!r}"
        )
        # Sanity: the per-IP limit is also still present.
        assert "@limiter.limit" in decorators_blob and "/minute" in decorators_blob, (
            "resume_session must keep its per-IP @limiter.limit('30/minute'). "
            f"Decorators:\n{decorators_blob!r}"
        )
        # source unused but kept to anchor inspect import
        assert source
