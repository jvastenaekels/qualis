# Qualis - Open-source platform for conducting Q-methodology research
# Copyright (C) 2025 Julien Vastenekels
# Licensed under the GNU Affero General Public License v3.0 or later.

"""Strip auth-email tokens from access-log path queries.

`Referrer-Policy: no-referrer` on the consume pages plus this scrubber
form the two-line defense against URL-token leakage (URL → access logs +
URL → third-party Referer header). The body of consume requests is POST,
so the only place the token appears is the GET that loads the page,
which this filter rewrites in the access-log line.
"""

import logging
import re

_TOKEN_RE = re.compile(r"([?&])([Tt]oken)=[^&]*")


def scrub_token_query(path_with_query: str) -> str:
    """Replace `?token=...` (any case) with `?token=REDACTED`."""
    return _TOKEN_RE.sub(r"\1\2=REDACTED", path_with_query)


class TokenLogScrubFilter(logging.Filter):
    """Logging filter applied to the uvicorn access logger.

    Mutates the log record's args so the rendered message never contains
    the raw token value.
    """

    def filter(self, record: logging.LogRecord) -> bool:
        if record.args and isinstance(record.args, tuple):
            record.args = tuple(
                scrub_token_query(a) if isinstance(a, str) else a for a in record.args
            )
        return True


def install_access_log_scrub() -> None:
    """Attach the scrub filter to uvicorn.access logger. Idempotent."""
    logger = logging.getLogger("uvicorn.access")
    if not any(isinstance(f, TokenLogScrubFilter) for f in logger.filters):
        logger.addFilter(TokenLogScrubFilter())
