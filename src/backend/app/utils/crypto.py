# Qualis - Open-source platform for conducting Q-methodology research
# Copyright (C) 2025 Julien Vastenekels
# Licensed under the GNU Affero General Public License v3.0 or later.

"""Cryptographic utilities for privacy and security."""

import hashlib
import os


def hash_ip(ip_address: str) -> str:
    """Hashes an IP address using SHA-256 and a salt for privacy (GDPR compliance).

    Consistent hashing allows for basic fraud/duplicate detection without storing PII.
    """
    salt = os.getenv("IP_HASH_SALT")
    if not salt:
        # Check if we are in production (Postgres is a good indicator)
        if os.getenv("DATABASE_URL", "").startswith("postgre"):
            raise ValueError(
                "IP_HASH_SALT environment variable MUST be set in production for privacy."
            )
        salt = "CHANGEME-insecure-dev-only"

    return hashlib.sha256(f"{ip_address}{salt}".encode()).hexdigest()[:64]


# UA strings carry device/browser/version detail. On rare browsers
# (or on uncommon User-Agent strings minted by automation tooling)
# they can be a quasi-identifier. The consent text promises that
# "Direct identifiers (such as IP addresses) are immediately
# converted into an anonymous code"; the example list is non-exhaustive.
# We therefore mirror the IP treatment: SHA-256 + the same per-deployment
# salt, truncated to 64 hex chars.
#
# We retain a coarse device class prefix ("mobile" / "desktop") because
# the existing study-stats device-breakdown heuristic in
# StudyDataService.get_study_stats reads this column. The class is
# computed by the same case-insensitive substring check that the
# heuristic uses, then prefixed with a colon: e.g. "mobile:abc123…".
# This preserves the heuristic without persisting the full identifying
# UA string.
_MOBILE_TOKENS = ("mobile", "android", "iphone", "ipad")


def _device_class(user_agent: str) -> str:
    """Return ``"mobile"`` or ``"desktop"`` for a UA string.

    Mirrors the substring heuristic in
    :func:`StudyDataService.get_study_stats` so the post-hash device
    breakdown matches the historical (raw-UA) result.
    """
    lowered = user_agent.lower()
    if any(token in lowered for token in _MOBILE_TOKENS):
        return "mobile"
    return "desktop"


def hash_user_agent(user_agent: str | None) -> str | None:
    """Hashes a User-Agent string using SHA-256 and the IP salt (GDPR compliance).

    Returns ``None`` if ``user_agent`` is ``None`` or empty (preserves
    the pre-hash convention that absent UA stays NULL on the row).

    Format: ``"<device_class>:<sha256[:56]>"`` where device_class is
    ``"mobile"`` or ``"desktop"`` (substring heuristic on the raw UA,
    case-insensitive). The class prefix preserves the per-study device
    breakdown without retaining the identifying UA fingerprint.

    Reuses ``IP_HASH_SALT`` deliberately: a single per-deployment salt
    keeps the operator's GDPR config to one variable. Production
    refuses to start without it (same enforcement path as ``hash_ip``).
    """
    if not user_agent:
        return None

    salt = os.getenv("IP_HASH_SALT")
    if not salt:
        if os.getenv("DATABASE_URL", "").startswith("postgre"):
            raise ValueError(
                "IP_HASH_SALT environment variable MUST be set in production for privacy."
            )
        salt = "CHANGEME-insecure-dev-only"

    digest = hashlib.sha256(f"{user_agent}{salt}".encode()).hexdigest()[:56]
    return f"{_device_class(user_agent)}:{digest}"
