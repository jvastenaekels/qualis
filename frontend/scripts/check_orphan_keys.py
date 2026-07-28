"""Fail when a `t()` key in src/ resolves in no locale file at all.

`check_i18n.py` compares the locale files **against each other**. A key that is
absent from every one of them — including `en/` — is, to that tool, perfectly in
sync: nothing is missing relative to the master. What actually renders in that
case is the developer-written second argument (`t('a.b', 'Fallback')`), or, when
there is no second argument, the raw dotted key. Either way the string is
English for every locale and invisible to translators, because there is no key
for them to translate.

This script closes that gap: it parses every `t(` call site in `src/`, resolves
each key against the union of all locale files, and fails on the ones that
resolve nowhere.

Read the COVERAGE block it prints before trusting a green run: it states exactly
which call-site forms it can and cannot see, and lists the deferred keys by name
and reason. There is no silent escape hatch.
"""

from __future__ import annotations

import fnmatch
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "i18n"))

from i18n_utils import get_keys  # noqa: E402
from namespace_partition import NAMESPACES  # noqa: E402

REPO_FRONTEND = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")

# ---------------------------------------------------------------------------
# Deferred keys.
#
# Every entry here is a key that resolves in NO locale file and is therefore a
# known defect, not an approved state. It is listed — by name, with a reason —
# because fixing it needs work this checker cannot do on its own, not because it
# is acceptable. The list is printed on every run, pass or fail. Shrink it; do
# not grow it. Adding an entry to silence a new failure defeats the check.
#
# All current entries share one cause: the key lives in the `participant`
# namespace, whose parity policy is *strict* (see check_i18n.py). Adding it to
# `en/participant.json` alone makes the other eight locales fail CI, so each one
# needs a real translation in nine files — a translation task, not this one.
# ---------------------------------------------------------------------------
DEFERRED: dict[str, str] = {
    "common.edit": "participant ns is strict-parity; needs 9-locale translation (admin-only call sites in ConcourseDetailPage, in flight on another branch)",
    "common.save": "participant ns is strict-parity; needs 9-locale translation (admin-only call sites in ConcourseDetailPage, in flight on another branch)",
    "common.remove": "participant ns is strict-parity; needs 9-locale translation",
    "common.retry": "participant ns is strict-parity; needs 9-locale translation",
    "common.status.offline": "participant ns is strict-parity; needs 9-locale translation",
    "common.errors.component_error": "participant ns is strict-parity; needs 9-locale translation",
    "common.errors.conflict_title": "participant ns is strict-parity; needs 9-locale translation; renders the raw key today",
    "common.errors.conflict_message": "participant ns is strict-parity; needs 9-locale translation; renders the raw key today",
    "common.errors.timeout.title": "participant ns is strict-parity; needs 9-locale translation",
    "common.errors.timeout.message": "participant ns is strict-parity; needs 9-locale translation",
    "common.errors.validation_title": "participant ns is strict-parity; needs 9-locale translation; renders the raw key today",
    "common.errors.validation_message": "participant ns is strict-parity; needs 9-locale translation; renders the raw key today",
    "fine.deck.confirm_reset": "participant ns is strict-parity; needs 9-locale translation; renders the raw key today",
    "fine.grid.slot_label": "participant ns is strict-parity; needs 9-locale translation",
    "post.extreme.required": "participant ns is strict-parity; needs 9-locale translation",
    "post.submit_error.hint": "participant ns is strict-parity; needs 9-locale translation",
    "study.access.password_label": "participant ns is strict-parity; needs 9-locale translation",
    "study.access.protected_desc": "participant ns is strict-parity; needs 9-locale translation",
    "study.access.unlock_btn": "participant ns is strict-parity; needs 9-locale translation",
    "study.access.wrong_password": "participant ns is strict-parity; needs 9-locale translation",
}

PLURAL_SUFFIXES = ("_zero", "_one", "_two", "_few", "_many", "_other")


# ---------------------------------------------------------------------------
# Minimal TS/TSX scanner
# ---------------------------------------------------------------------------
def read_string_literal(s: str, i: int, keep: bool = False):
    """If s[i] opens a string/template literal, return (quote, body, end).

    With keep=False the body of a template literal has each `${...}` hole
    replaced by the placeholder `${*}` so it can be turned into a glob.
    """
    q = s[i] if i < len(s) else ""
    if q not in "\"'`":
        return None
    j = i + 1
    body: list[str] = []
    while j < len(s):
        c = s[j]
        if c == "\\":
            body.append(s[j : j + 2])
            j += 2
            continue
        if q == "`" and c == "$" and j + 1 < len(s) and s[j + 1] == "{":
            k = j + 2
            depth = 1
            while k < len(s) and depth:
                if s[k] == "{":
                    depth += 1
                elif s[k] == "}":
                    depth -= 1
                k += 1
            body.append(s[j:k] if keep else "${*}")
            j = k
            continue
        if c == q:
            return (q, s[i : j + 1] if keep else "".join(body), j + 1)
        if q != "`" and c == "\n":
            return None
        body.append(c)
        j += 1
    return None


def strip_comments(s: str) -> str:
    """Blank out // and /* */ comments, preserving offsets and line numbers.

    Without this, prose such as `// the t() call above` is mistaken for a call
    site — which is how a naive scan reports phantom orphans.
    """
    out: list[str] = []
    i, n = 0, len(s)
    while i < n:
        c = s[i]
        if c in "\"'`":
            lit = read_string_literal(s, i, keep=True)
            if lit:
                out.append(lit[1])
                i = lit[2]
                continue
        if c == "/" and i + 1 < n and s[i + 1] == "/":
            j = s.find("\n", i)
            j = n if j < 0 else j
            out.append(" " * (j - i))
            i = j
            continue
        if c == "/" and i + 1 < n and s[i + 1] == "*":
            j = s.find("*/", i + 2)
            j = n if j < 0 else j + 2
            out.append("".join(ch if ch == "\n" else " " for ch in s[i:j]))
            i = j
            continue
        out.append(c)
        i += 1
    return "".join(out)


# `t(` not preceded by an identifier character or a dot, so `.t(` (i18n.t) and
# `format(` do not match. i18n.t is not used in src/; if it ever is, this
# regex must be widened.
CALL_RE = re.compile(r"(?<![\w$.])t\(")


def collect_sites(src_dir: str):
    """Return (sites, opaque) over src_dir.

    sites  : (relpath, line, key, is_template)
    opaque : (relpath, line, snippet) — the first argument is not a literal, so
             the key is unknowable statically. Reported, never hidden.
    """
    files: list[str] = []
    for dirpath, dirnames, filenames in os.walk(src_dir):
        dirnames[:] = [
            d for d in dirnames if d not in ("test-utils", "__tests__", "__mocks__")
        ]
        files.extend(
            os.path.join(dirpath, fn)
            for fn in filenames
            if fn.endswith((".ts", ".tsx")) and ".test." not in fn and ".spec." not in fn
        )
    files.sort()

    sites, opaque = [], []
    for path in files:
        with open(path, encoding="utf-8") as f:
            src = strip_comments(f.read())
        rel = os.path.relpath(path, REPO_FRONTEND)
        for m in CALL_RE.finditer(src):
            i = m.end()
            while i < len(src) and src[i] in " \t\n\r":
                i += 1
            line = src.count("\n", 0, m.start()) + 1
            lit = read_string_literal(src, i)
            if lit is None:
                snippet = " ".join(src[m.start() : m.start() + 60].split())
                opaque.append((rel, line, snippet))
                continue
            quote, key, _ = lit
            sites.append((rel, line, key, quote == "`" and "${*}" in key))
    return files, sites, opaque


def load_locale_keys(locales_dir: str):
    """Union of every key in every locale file, plus the language list."""
    keys: set[str] = set()
    langs = sorted(
        d for d in os.listdir(locales_dir) if os.path.isdir(os.path.join(locales_dir, d))
    )
    files = 0
    for lang in langs:
        for ns in NAMESPACES:
            path = os.path.join(locales_dir, lang, f"{ns}.json")
            if os.path.exists(path):
                with open(path, encoding="utf-8") as f:
                    keys |= get_keys(json.load(f))
                files += 1
    return keys, langs, files


def make_resolver(locale_keys: set[str]):
    """A key resolves if it is present, or is the stem of a plural/context key.

    i18next appends `_one`/`_other` (plurals) and `_<context>` (context) to the
    key the developer writes, so `t('a.n_items', {count})` is live when only
    `a.n_items_one` / `a.n_items_other` exist in the JSON.
    """
    stems = {k.rsplit("_", 1)[0] for k in locale_keys if k.endswith(PLURAL_SUFFIXES)}
    context_stems = set()
    for k in locale_keys:
        head, _, leaf = k.rpartition(".")
        if head and "_" in leaf:
            context_stems.add(f"{head}.{leaf.split('_')[0]}")

    def resolves(key: str, is_template: bool) -> bool:
        if is_template:
            glob = key.replace("${*}", "*")
            return any(
                fnmatch.fnmatchcase(k, glob) or fnmatch.fnmatchcase(k, glob + "_*")
                for k in locale_keys
            )
        return key in locale_keys or key in stems or key in context_stems

    return resolves


def check_orphan_keys(src_dir: str | None = None, locales_dir: str | None = None) -> int:
    src_dir = src_dir or os.path.join(REPO_FRONTEND, "src")
    locales_dir = locales_dir or os.path.join(REPO_FRONTEND, "public", "locales")

    locale_keys, langs, locale_files = load_locale_keys(locales_dir)
    resolves = make_resolver(locale_keys)
    files, sites, opaque = collect_sites(src_dir)

    orphans: dict[str, list[tuple[str, int]]] = {}
    for rel, line, key, is_tpl in sites:
        if not resolves(key, is_tpl):
            orphans.setdefault(key, []).append((rel, line))

    print("Checking for t() keys that resolve in no locale file")
    print("\nCOVERAGE — what this check inspects, and what it cannot")
    print(f"  ✓ inspected  {len(files)} .ts/.tsx files under {os.path.relpath(src_dir, REPO_FRONTEND)}")
    print(f"  ✓ inspected  {len(sites)} t() call sites with a literal or template-literal key")
    print(f"  ✓ resolved   against {len(locale_keys)} keys from {locale_files} files "
          f"across {len(langs)} locales ({', '.join(langs)})")
    print("  ✓ understands i18next plural (_one/_other/…) and context (_suffix) key stems")
    print("  ✓ understands template-literal keys: `a.b.${x}` is matched as the glob a.b.*")
    print("  ✓ comments are blanked before scanning, so prose mentioning t() is not a call site")
    print("  ✗ SKIPS *.test.*, *.spec.*, test-utils/, __tests__/, __mocks__/ — test copy is not shipped UI")
    print(f"  ✗ BLIND to {len(opaque)} call sites whose first argument is not a literal")
    print("      (t(key), t(step.labelKey), t(...tuple) — the key is only known at runtime):")
    for rel, line, snippet in opaque:
        print(f"        {rel}:{line}  {snippet}")
    print("  ✗ BLIND to keys reached only through i18next's own fallbackLng chain at runtime")

    print(f"\nDEFERRED — {len(DEFERRED)} known-orphan keys carried as debt, never silent:")
    stale: list[str] = []
    for key in sorted(DEFERRED):
        hits = orphans.pop(key, [])
        if not hits:
            stale.append(key)
        where = ", ".join(f"{r}:{n}" for r, n in hits) or "no live call site"
        print(f"  ⚠️  {key}  — {DEFERRED[key]}")
        print(f"        at {where}")

    if stale:
        print("\n  ℹ️  deferred entries that are no longer orphaned or no longer")
        print("      referenced — delete them from DEFERRED in this file:")
        for key in stale:
            print(f"        {key}")

    n_sites = sum(len(v) for v in orphans.values())
    if orphans:
        print(f"\n❌ FAIL: {len(orphans)} key(s) / {n_sites} call site(s) resolve in no locale file.")
        for key in sorted(orphans):
            for rel, line in orphans[key]:
                print(f"  ❌ {key}\n        {rel}:{line}")
        print(
            "\nFix by adding the key to public/locales/en/admin.json with the call site's\n"
            "own fallback text as its value (admin parity is best-effort — the other\n"
            "locales fall back to English). Participant-namespace keys need all nine\n"
            "locales, because that namespace is strict-parity."
        )
        return 1

    print("\n✅ PASS: every statically visible t() key resolves in at least one locale file.")
    return 0


if __name__ == "__main__":
    sys.exit(check_orphan_keys())
