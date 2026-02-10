# Libre-Q - Open-source platform for conducting Q-methodology research
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
