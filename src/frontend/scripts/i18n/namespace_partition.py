"""Single source of truth for the i18n namespace partition.

Maps top-level translation.json keys to the target namespace file.
Used by:
  - split_translations.py (to slice locale files)
  - check_i18n.py (to iterate over the right key sets per namespace)
  - check_interpolations.py (same)
  - frontend/src/test-utils/i18n-test-resources.ts (re-exported via JSON manifest)
"""

# Top-level key → target namespace.
# Every top-level key in en/translation.json must appear here.
PARTITION: dict[str, str] = {
    # Participant-facing + public + shared chrome
    "common": "participant",
    "layout": "participant",
    "footer": "participant",
    "errors": "participant",
    "landing": "participant",
    "welcome": "participant",
    "consent": "participant",
    "presort": "participant",
    "rough": "participant",
    "fine": "participant",
    "post": "participant",
    "audio": "participant",
    "resume": "participant",
    "erasure": "participant",
    "study": "participant",
    # Researcher-facing
    "admin": "admin",
    "auth": "admin",
}

NAMESPACES: tuple[str, ...] = ("participant", "admin")


def keys_for_namespace(ns: str) -> list[str]:
    """Return the top-level keys assigned to a given namespace."""
    return [k for k, target in PARTITION.items() if target == ns]
