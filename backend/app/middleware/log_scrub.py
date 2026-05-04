# Qualis - Open-source platform for conducting Q-methodology research
# Copyright (C) 2025 Julien Vastenekels
# Licensed under the GNU Affero General Public License v3.0 or later.

"""Strip auth-email tokens from access-log path queries.

`Referrer-Policy: no-referrer` on the consume pages plus this scrubber
form the two-line defense against URL-token leakage (URL → access logs +
URL → third-party Referer header). The body of consume requests is POST,
so the only place the token appears is the GET that loads the page,
which this filter rewrites in the access-log line.

Scope of redaction:

* Sensitive query keys ``token``, ``otp``, ``code`` (case-insensitive).
  ``token`` covers email-verify / password-reset / 2FA-disable /
  email-change consume URLs; ``otp`` and ``code`` cover any 2FA-email
  verification path that happens to surface the code in a query string
  (defence-in-depth — the code is normally POSTed in the body).

Scope of attachment:

* ``uvicorn.access`` — the access logger that renders every request line
  (the original target).
* ``app.middleware.errors`` — formats ``request.url`` directly into 500
  / IntegrityError / ServiceError lines (lines 95, 153, 182). Without
  this filter, a 5xx during a token-link consume would log the raw
  token in the application-error pipeline.
* ``app.routers.logs`` — the ``frontend_error`` logger that records
  client-side error reports; their context payloads may include URLs
  with sensitive query params.

Other application loggers do not currently emit URLs with sensitive
params; if a future contributor adds one, ``install_access_log_scrub``
is the single point to extend (see ``_TARGET_LOGGER_NAMES``). The
``lint_logger_urls.py`` script (run by the security-scans workflow)
flags new ``request.url`` / ``request.query_string`` formatting in
non-attached loggers.
"""

import logging
import re

# Match ``?key=…`` or ``&key=…`` for any sensitive key, case-insensitive,
# stopping at the next ``&`` or end-of-string. The first capture group
# preserves the separator (``?`` or ``&``); the second preserves the
# original key casing in the redacted output.
_TOKEN_RE = re.compile(r"([?&])(token|otp|code)=[^&]*", re.IGNORECASE)

# Loggers that may emit URLs containing sensitive query params. Keep
# this list narrow: every entry must have an audited reason. See module
# docstring for the rationale on each.
_TARGET_LOGGER_NAMES: tuple[str, ...] = (
    "uvicorn.access",
    "app.middleware.errors",
    "app.routers.logs",
)


def scrub_token_query(path_with_query: str) -> str:
    """Replace ``?token=…`` / ``?otp=…`` / ``?code=…`` (any case) with
    ``?<key>=REDACTED``. The key casing is preserved so log lines
    remain visually faithful to the original request."""
    return _TOKEN_RE.sub(r"\1\2=REDACTED", path_with_query)


class TokenLogScrubFilter(logging.Filter):
    """Logging filter applied to access + selected application loggers.

    Mutates the log record so the rendered message never contains the
    raw token / OTP / code value. Handles two distinct call shapes:

    * **Lazy formatting** — ``logger.error("... %s ...", request.url)``.
      ``record.args`` is a tuple of substitution values; we scrub each
      string entry. ``record.msg`` carries only the format template
      (no sensitive value).
    * **Pre-formatted message** — ``logger.error(f"... {request.url} ...")``
      or ``logger.error("..." + url)``. ``record.args`` is empty and
      ``record.msg`` already contains the rendered, sensitive string.
      We scrub ``record.msg`` directly. This path covers third-party
      libraries and future contributor mistakes that don't use lazy
      formatting.
    """

    def filter(self, record: logging.LogRecord) -> bool:
        if record.args and isinstance(record.args, tuple):
            record.args = tuple(
                scrub_token_query(a) if isinstance(a, str) else a for a in record.args
            )
        elif isinstance(record.msg, str) and not record.args:
            record.msg = scrub_token_query(record.msg)
        return True


def install_access_log_scrub() -> None:
    """Attach the scrub filter to every logger in ``_TARGET_LOGGER_NAMES``.

    Idempotent — repeated calls do not stack duplicate filters.
    """
    for name in _TARGET_LOGGER_NAMES:
        logger = logging.getLogger(name)
        if not any(isinstance(f, TokenLogScrubFilter) for f in logger.filters):
            logger.addFilter(TokenLogScrubFilter())
